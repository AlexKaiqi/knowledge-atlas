// Lifecycle behavior only: every Docker command resolves to a temporary executable.
// The HTTP server below is a readiness fixture, not a browser or real AIO service.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import {generateKeyPairSync} from 'node:crypto';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createBrowserWorkbench} from '../server/browser-workbench.mjs';
import {acquireServiceLock} from '../server/local-service-lock.mjs';
const SPACE='11111111-1111-4111-8111-111111111111';
const IMAGE='fixture/sandbox:1',IMAGE_ID='sha256:fixture-image';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const fakeDocker=String.raw`#!/usr/bin/env node
const fs=require('node:fs'),path=require('node:path');
const root=__dirname,args=process.argv.slice(2),statePath=path.join(root,'docker-state.json');
const trace=row=>fs.appendFileSync(path.join(root,'docker-trace.jsonl'),JSON.stringify(row)+'\n');
trace({event:'command',args});
const state=()=>JSON.parse(fs.readFileSync(statePath,'utf8'));
const write=value=>fs.writeFileSync(statePath,JSON.stringify(value));
const output=value=>process.stdout.write(typeof value==='string'?value+'\n':JSON.stringify(value)+'\n');
const find=(s,target)=>Object.entries(s.containers).find(([name,data])=>name===target||data.Id===target);
const main=async()=>{
 if(args[0]==='image'&&args[1]==='inspect')return output([{Id:'sha256:fixture-image'}]);
 if(args[0]==='inspect'){
  const found=find(state(),args[1]);
  if(!found){process.stderr.write('Error: No such object: '+args[1]+'\n');process.exitCode=1;return}
  return output([found[1]]);
 }
 if(args[0]==='ps'){
  const match=args.find(x=>x.startsWith('label=atlas.browser.namespace='))?.split('=').at(-1);
  return output(Object.values(state().containers).filter(c=>c.State.Running&&c.Config.Labels['atlas.browser.namespace']===match).map(c=>c.Id).join('\n'));
 }
 if(args[0]==='start'||args[0]==='stop'){
  const target=args.at(-1),initial=state(),delay=args[0]==='start'?(initial.startDelayMs||0):0;
  if(delay)await new Promise(resolve=>setTimeout(resolve,delay));
  const current=state(),found=find(current,target);
  if(!found){process.stderr.write('No such container\n');process.exitCode=1;return}
  found[1].State.Running=args[0]==='start';write(current);
  trace({event:'mutation-completed',operation:args[0],target});return output(target);
 }
 process.stderr.write('Unexpected fake Docker command: '+args[0]+'\n');process.exitCode=2;
};
main().catch(error=>{process.stderr.write(error.message);process.exitCode=3});
`;

async function fixture(run){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'atlas-browser-behavior-'));
 const savedPath=process.env.PATH;
 const tracePath=path.join(root,'docker-trace.jsonl'),statePath=path.join(root,'docker-state.json');
 const publicKeys=generateKeyPairSync('rsa',{modulusLength:2048,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});
 let held=false,healthRequests=0;const pending=new Set();
 const server=http.createServer((_req,res)=>{
  healthRequests++;
  if(held){pending.add(res);res.once('close',()=>pending.delete(res));return}
  res.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify({webSocketDebuggerUrl:'ws://127.0.0.1/devtools/browser/fixture'}));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 await fs.writeFile(path.join(root,'docker'),fakeDocker,{mode:0o700});
 await fs.writeFile(statePath,JSON.stringify({containers:{}}));
 process.env.PATH=root+path.delimiter+(savedPath||'');
 const readState=async()=>JSON.parse(await fs.readFile(statePath,'utf8'));
 const writeState=async state=>fs.writeFile(statePath,JSON.stringify(state));
 const trace=async()=>{const body=await fs.readFile(tracePath,'utf8').catch(()=> '');return body.trim().split('\n').filter(Boolean).map(JSON.parse)};
 const workbench=db=>createBrowserWorkbench({directory:path.join(root,'workspaces'),databasePath:path.join(root,db),configuration:{available:true,image:IMAGE}});
 async function seed(wb,{running=true,id=SPACE,change=()=>{}}={}){
  const folder=path.join(root,'workspaces',wb.namespace,id),workspace=path.join(folder,'workspace');
  await fs.mkdir(workspace,{recursive:true});
  await fs.writeFile(path.join(folder,'connection.json'),JSON.stringify({version:1,image:IMAGE,...publicKeys}));
  const name='atlas-browser-'+wb.namespace+'-'+id;
  const data={Id:'container-'+wb.namespace+'-'+id,Image:IMAGE_ID,State:{Running:running},Config:{Image:IMAGE,Labels:{'atlas.browser.namespace':wb.namespace,'atlas.browser.space':id},Env:['JWT_PUBLIC_KEY='+Buffer.from(publicKeys.publicKey).toString('base64')]},Mounts:[{Type:'bind',RW:true,Source:workspace,Destination:'/home/gem/workspace'}],HostConfig:{PortBindings:{'8080/tcp':[{HostIp:'127.0.0.1',HostPort:String(server.address().port)}]}},NetworkSettings:{Ports:{'8080/tcp':[{HostIp:'127.0.0.1',HostPort:String(server.address().port)}]}}};
  change(data);const state=await readState();state.containers[name]=data;await writeState(state);return{name,data,workspace};
 }
 const until=async predicate=>{const end=Date.now()+4000;while(Date.now()<end){if(await predicate())return;await sleep(10)}throw new Error('fixture condition not reached')};
 try{await run({root,workbench,seed,readState,writeState,trace,until,healthCount:()=>healthRequests,holdHealth:()=>{held=true},releaseHealth:()=>{held=false;for(const res of pending)res.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify({webSocketDebuggerUrl:'ws://127.0.0.1/devtools/browser/fixture'}));pending.clear()}})}
 finally{
  savedPath===undefined?delete process.env.PATH:process.env.PATH=savedPath;
  server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
  await fs.rm(root,{recursive:true,force:true});
 }
}
const mutations=trace=>trace.filter(row=>row.event==='command'&&['run','start','stop','rm'].includes(row.args[0]));

test('a same-name container with another owner or workspace is never started or stopped',async t=>{
 for(const mismatch of ['label','mount'])await t.test(mismatch,async()=>fixture(async x=>{
  const wb=x.workbench('atlas.sqlite');
  const seeded=await x.seed(wb,{running:false,change:data=>{
   if(mismatch==='label')data.Config.Labels['atlas.browser.namespace']='another-owner';
   else data.Mounts[0].Source=path.join(x.root,'someone-elses-files');
  }});
  await fs.writeFile(path.join(seeded.workspace,'keep.txt'),'existing work');
  await assert.rejects(wb.ensure(SPACE),/不匹配/);
  await assert.rejects(wb.stop(SPACE),/不匹配/);
  assert.deepEqual(mutations(await x.trace()),[]);
  assert.equal(await fs.readFile(path.join(seeded.workspace,'keep.txt'),'utf8'),'existing work');
 }));
});

test('preparation cancellation stops readiness waits and observes an in-flight Docker mutation before returning',async t=>{
 await t.test('abort readiness and allow a later retry',async()=>fixture(async x=>{
  const wb=x.workbench('atlas.sqlite');await x.seed(wb);x.holdHealth();
  const controller=new AbortController(),pending=wb.ensure(SPACE,{signal:controller.signal});
  // Attach rejection handling immediately; abort reasons are intentionally propagated.
  const cancelled=assert.rejects(pending,error=>error.name==='AbortError');
  await x.until(()=>x.healthCount()>0);controller.abort();await cancelled;
  x.releaseHealth();await wb.ensure(SPACE);
  assert.equal((await wb.status(SPACE)).state,'running');
  assert.deepEqual(mutations(await x.trace()),[]);
 }));
 await t.test('do not abandon a daemon mutation halfway',async()=>fixture(async x=>{
  const wb=x.workbench('atlas.sqlite'),seeded=await x.seed(wb,{running:false});
  const state=await x.readState();state.startDelayMs=180;await x.writeState(state);
  const controller=new AbortController(),pending=wb.ensure(SPACE,{signal:controller.signal});
  const cancelled=assert.rejects(pending,error=>error.name==='AbortError');
  await x.until(async()=>mutations(await x.trace()).some(row=>row.args[0]==='start'));controller.abort();await cancelled;
  const completed=(await x.trace()).filter(row=>row.event==='mutation-completed');
  assert.ok(completed.some(row=>row.operation==='start'&&row.target===seeded.data.Id));
  assert.equal(x.healthCount(),0,'cancelled preparation must not continue into browser polling');
  // Cancellation is not permission to delete workspace data; explicit stop can now cleanly pause it.
  await wb.stop(SPACE);assert.equal((await x.readState()).containers[seeded.name].State.Running,false);
 }));
});

test('stop checks its guard after queued preparation and again immediately before stopping the inspected ID',async()=>fixture(async x=>{
 const wb=x.workbench('atlas.sqlite'),seeded=await x.seed(wb);x.holdHealth();
 const ready=wb.ensure(SPACE);await x.until(()=>x.healthCount()>0);
 let permitted=true,guardCalls=0;
 const queuedStop=wb.stop(SPACE,{guard:async()=>{guardCalls++;return permitted}});
 permitted=false;x.releaseHealth();await ready;
 assert.equal(await queuedStop,false);assert.equal(guardCalls,1);assert.deepEqual(mutations(await x.trace()),[]);
 let checks=0;
 assert.equal(await wb.stop(SPACE,{guard:async()=>++checks===1}),false);
 assert.equal(checks,2);assert.deepEqual(mutations(await x.trace()),[]);
 assert.equal(await wb.stop(SPACE),true);
 const stops=mutations(await x.trace());assert.equal(stops.length,1);
 assert.deepEqual(stops[0].args,['stop','--time','5',seeded.data.Id]);
}));

test('the same exploration ID in different databases belongs to independent container namespaces',async()=>fixture(async x=>{
 const first=x.workbench('first.sqlite'),second=x.workbench('second.sqlite');
 assert.notEqual(first.namespace,second.namespace);
 const a=await x.seed(first),b=await x.seed(second);
 await first.stop(SPACE);
 const state=await x.readState();assert.equal(state.containers[a.name].State.Running,false);assert.equal(state.containers[b.name].State.Running,true);
 await second.ensure(SPACE);assert.equal((await second.status(SPACE)).state,'running');
 assert.deepEqual(mutations(await x.trace()).map(row=>row.args.at(-1)),[a.data.Id]);
}));

test('a real second process cannot acquire the same database lock, and release never removes a successor lock',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'atlas-service-lock-test-'));
 const database=path.join(root,'atlas.sqlite'),alias=path.join(root,'alias.sqlite');
 await fs.writeFile(database,'synthetic database');await fs.symlink(database,alias);
 const moduleUrl=new URL('../server/local-service-lock.mjs',import.meta.url).href;
 const script=`const {acquireServiceLock}=await import(${JSON.stringify(moduleUrl)});const lock=acquireServiceLock(${JSON.stringify(database)});process.stdout.write('locked\\n');process.stdin.once('data',()=>{lock.release();process.exit(0)});`;
 const child=spawn(process.execPath,['--input-type=module','-e',script],{stdio:['pipe','pipe','pipe']});
 let first,next,other;
 try{
  const ready=await Promise.race([once(child.stdout,'data').then(([data])=>data.toString()),once(child,'exit').then(()=>{throw new Error('lock holder exited before readiness')})]);
  assert.match(ready,/locked/);
  assert.throws(()=>acquireServiceLock(database),/已有本地服务运行/);
  assert.throws(()=>acquireServiceLock(alias),/已有本地服务运行/,'symlink aliases must not create a second runner');
  other=acquireServiceLock(path.join(root,'independent.sqlite'));
  const exited=once(child,'exit');child.stdin.end('release\n');await exited;
  first=acquireServiceLock(alias);assert.equal(first.databasePath,await fs.realpath(database));first.release();
  next=acquireServiceLock(database);first.release();
  assert.throws(()=>acquireServiceLock(database),/已有本地服务运行/,'old release must not unlink the new owner nonce');
  next.release();next=null;other.release();other=null;
  assert.equal((await fs.readdir(root)).filter(file=>file.endsWith('.serve-lock')).length,0);
 }finally{
  child.kill();first?.release();next?.release();other?.release();await fs.rm(root,{recursive:true,force:true});
 }
});
