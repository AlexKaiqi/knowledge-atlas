import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createApi} from '../server/api.mjs';
import {openLocalDatabase} from '../server/local-db.mjs';
import {claimCodexJob,freezeCodexContext,finishCodexJob,renewCodexJob} from '../server/codex-jobs.mjs';
import {startCodexRunner} from '../server/codex-runner.mjs';
import {recoverJobs} from '../server/jobs.mjs';
const agent={available:true,version:'test-only'};
const request=p=>({...p,requestId:crypto.randomUUID()});
function setup() {
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'atlas-codex-test-'));
 const db=openLocalDatabase(path.join(directory,'db.sqlite'),new URL('../drizzle',import.meta.url).pathname);
 const api=createApi({catalog:{},agent});
 let cookie='';
 return {db,directory, async call(route,body,headers={}) {
  const response=await api(new Request('http://localhost/api/workspace'+route,{method:body?'POST':'GET',headers:{cookie,...(body?{'content-type':'application/json',origin:'http://localhost'}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})}),db);
  cookie=response.headers.get('set-cookie')?.split(';')[0]||cookie;
  return {status:response.status,data:await response.json()};
 }, cleanup(){db.close();fs.rmSync(directory,{recursive:true,force:true});}};
}
const rows=async(db,sql,...args)=>(await db.prepare(sql).bind(...args).all()).results;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check){for(let n=0;n<100;n++){if(await check())return;await pause(10);}throw new Error('condition not reached');}

test('direct questions atomically queue once; explicit old questions and retries deduplicate',async()=>{
 const x=setup();try {
  await x.call('/session');
  const p=request({body:'我想弄懂第一性原理'});
  const [a,b]=await Promise.all([x.call('/spaces',p),x.call('/spaces',p)]);
  assert.equal(a.data.id,b.data.id);assert.equal(a.data.jobId,b.data.jobId);
  const id=a.data.id, job=a.data.jobId;
  assert.equal((await rows(x.db,'SELECT * FROM ws_jobs')).length,1);
  await x.call(`/spaces/${id}/jobs/${job}/cancel`,{});
  const retries=await Promise.all([1,2].map(()=>x.call(`/spaces/${id}/jobs/${job}/retry`,request({}))));
  assert.equal(retries[0].data.id,retries[1].data.id);
  const claimed=await claimCodexJob(x.db,retries[0].data.id); await freezeCodexContext(x.db,claimed);
  assert.equal(await finishCodexJob(x.db,claimed,'真实调用结果会保存到这里'),true);
  assert.equal(await finishCodexJob(x.db,claimed,'不得重复写入'),false);
  const again=await x.call(`/spaces/${id}/jobs/${job}/retry`,request({}));
  assert.equal(again.data.id,claimed.id);
  const old=(await x.call('/spaces',request({body:'旧问题',askAgent:false}))).data;
  const asks=await Promise.all([1,2].map(()=>x.call(`/spaces/${old.id}/assistant`,request({messageId:old.messageId}))));
  assert.equal(asks[0].data.jobId,asks[1].data.jobId);
  assert.equal((await x.call(`/spaces/${old.id}/assistant`,request({messageId:a.data.messageId}))).status,404);
  await x.call('/profile',{name:'Codex',goals:'私密偏好',interests:'',guidance:''});
  const detail=(await x.call(`/spaces/${id}`)).data;
  assert.equal(detail.messages[0].name,'Codex');assert.equal(detail.messages[0].kind,'human');
  assert.equal(detail.messages[1].kind,'assistant');assert.equal(detail.messages[1].replyTo,a.data.messageId);
 }finally{x.cleanup();}
});

test('queued follow-up includes prior answer; context never includes another space or later questions',async()=>{
 const x=setup();try{
  const a=(await x.call('/spaces',request({body:'第一个问题'}))).data;
  const b=(await x.call(`/spaces/${a.id}/messages`,request({body:'接着上面的解释'}))).data;
  await x.call('/spaces',request({body:'另一个空间的私密内容',askAgent:false}));
  const first=await claimCodexJob(x.db,a.jobId);
  assert.equal(await claimCodexJob(x.db,b.jobId),null);
  const c1=await freezeCodexContext(x.db,first);
  assert.deepEqual(c1.messages.map(m=>m.body),['第一个问题']);
  await finishCodexJob(x.db,first,'第一个问题的回答');
  const second=await claimCodexJob(x.db,b.jobId);
  const c2=await freezeCodexContext(x.db,second);
  assert.deepEqual(c2.messages.map(m=>m.body),['第一个问题','第一个问题的回答','接着上面的解释']);
  assert.ok(!JSON.stringify(c2).includes('另一个空间'));
  await x.db.prepare('UPDATE ws_jobs SET lease_until=? WHERE id=?').bind(Date.now()+1000,second.id).run();
  assert.equal(await renewCodexJob(x.db,second),true);
  await x.call(`/spaces/${a.id}/jobs/${second.id}/cancel`,{});
  assert.equal(await renewCodexJob(x.db,second),false);
  assert.equal(await finishCodexJob(x.db,second,'取消后的迟到结果'),false);
  const third=(await x.call(`/spaces/${a.id}/messages`,request({body:'中断测试'}))).data;
  const expired=await claimCodexJob(x.db,third.jobId);
  await x.db.prepare('UPDATE ws_jobs SET lease_until=0 WHERE id=?').bind(expired.id).run();
  await recoverJobs(x.db);
  assert.equal(await finishCodexJob(x.db,expired,'过期执行结果'),false);
 }finally{x.cleanup();}
});

test('runner cancellation kills the active invocation and shutdown starts no new invocation',async()=>{
 const x=setup();let stop;
 try {
  const a=(await x.call('/spaces',request({body:'停止这次回答'}))).data;
  let called=0,aborted=false;
  stop=startCodexRunner(x.db,agent,{guidance:'test',intervalMs:10,heartbeatMs:10,invoke:async(_,{signal})=>{
   called++;await new Promise(resolve=>signal.addEventListener('abort',()=>{aborted=true;resolve();},{once:true}));
   return {body:'迟到回答'};
  }});
  await until(()=>called===1);
  await x.call(`/spaces/${a.id}/jobs/${a.jobId}/cancel`,{});
  await until(()=>aborted);await stop();stop=null;
  assert.equal((await rows(x.db,"SELECT * FROM ws_messages WHERE actor='agent:codex'")).length,0);
  await x.call('/spaces',request({body:'停机不再新调用'}));
  stop=startCodexRunner(x.db,agent,{guidance:'test',intervalMs:10,invoke:async()=>{called++;return {body:'不应执行'};}});
  await stop();stop=null;assert.equal(called,1);
 }finally{if(stop)await stop();x.cleanup();}
});
