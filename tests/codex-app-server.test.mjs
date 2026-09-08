// Hermetic protocol regression tests. This fixture never launches the real Codex binary,
// calls a model, opens a browser, or reads the user's credentials.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {runCodex} from '../server/codex-app-server.mjs';

const fixtureSource=String.raw`#!/usr/bin/env node
const fs=require('node:fs'),path=require('node:path'),readline=require('node:readline');
const directory=__dirname;
const scenario=JSON.parse(fs.readFileSync(path.join(directory,'scenario.json'),'utf8'));
const tracePath=path.join(directory,'trace.jsonl');
const log=value=>fs.appendFileSync(tracePath,JSON.stringify(value)+'\n');
const args=process.argv.slice(2),overrides={},features={};
for(let i=0;i<args.length;i++){
 if(args[i]==='-c'){const value=args[++i],equal=value.indexOf('=');overrides[value.slice(0,equal)]=value.slice(equal+1)}
 else if(args[i]==='--disable')features[args[++i]]=false;
 else if(args[i]==='--enable')features[args[++i]]=true;
}
const parse=(key,fallback)=>{try{return JSON.parse(overrides[key])}catch{return fallback}};
const disabledSkills=!!overrides.skills;
const cwd=process.cwd(),home=process.env.CODEX_HOME;
log({event:'spawn',pid:process.pid,args,credentialHomeIsSeparate:home!==path.join(directory,'host-home'),authIsSymlink:fs.lstatSync(path.join(home,'auth.json')).isSymbolicLink(),hasSecret:!!process.env.ATLAS_FIXTURE_SECRET,hasDesktopPipe:!!process.env.CODEX_APP_TOOLS_PIPE_PATH,hasHostThread:!!process.env.CODEX_THREAD_ID});
let output=Promise.resolve(),interrupted=false,hostRequestAnswered=false,hostRequestInventoryId=null;
function send(message){
 const work=async()=>{
  const bytes=Buffer.from(JSON.stringify(message)+'\n');
  const at=bytes.indexOf(Buffer.from('中文'));
  // Split the three-byte Chinese code point across three writes, not merely JSON lines.
  const cuts=at<0?[bytes.length]:[at+1,at+2,at+3,bytes.length];
  let start=0;for(const end of cuts){process.stdout.write(bytes.subarray(start,end));start=end;if(end<bytes.length)await new Promise(r=>setTimeout(r,3))}
 };
 output=output.then(work);return output;
}
const result=(id,value)=>send({id,result:value});
const notice=(method,params)=>send({method,params});
const rawReason='RAW_REASONING_MUST_NEVER_REACH_PUBLIC_EVENTS';
const finalItem={id:'answer',type:'agentMessage',phase:'final_answer',text:'中文探索🧪：已完成。'};
let requestedMcp={};
async function complete(status='completed'){
 if(status==='completed' && interrupted)return;
 await notice('turn/completed',{threadId:'fixture-thread',turn:{id:'fixture-turn',status,items:status==='completed'?[{id:'private-reasoning',type:'reasoning',rawContent:[rawReason]},finalItem]:[]}});
}
async function stream(){
 await notice('turn/started',{threadId:'fixture-thread',turn:{id:'fixture-turn',status:'inProgress',items:[]}});
 await notice('item/reasoning/textDelta',{threadId:'fixture-thread',delta:rawReason});
 await notice('item/started',{threadId:'fixture-thread',item:{id:'private-reasoning',type:'reasoning',rawContent:[rawReason]}});
 await notice('item/completed',{threadId:'fixture-thread',item:{id:'private-reasoning',type:'reasoning',rawContent:[rawReason]}});
 await notice('item/completed',{threadId:'fixture-thread',item:{id:'commentary',type:'agentMessage',phase:'commentary',text:'中文进度：开始探索。'}});
 // Foreign-thread events must not contaminate the answer or displayed stream.
 await notice('item/agentMessage/delta',{threadId:'another-thread',itemId:'foreign',delta:'FOREIGN_PRIVATE_TEXT'});
 await notice('item/agentMessage/delta',{threadId:'fixture-thread',turnId:'fixture-turn',itemId:'answer',delta:'中文探索🧪'});
 if(scenario.hold)await new Promise(r=>setTimeout(r,1000));
 if(interrupted)return;
 await notice('item/agentMessage/delta',{threadId:'fixture-thread',turnId:'fixture-turn',itemId:'answer',delta:'：已完成。'});
 await new Promise(r=>setTimeout(r,20));
 if(interrupted)return;
 if(scenario.malformed){process.stdout.write('{invalid-json}\n');return}
 await notice('item/completed',{threadId:'fixture-thread',item:finalItem});
 await complete();
}
readline.createInterface({input:process.stdin}).on('line',async line=>{
 let message;try{message=JSON.parse(line)}catch{process.exit(2)}
 log({event:'request',...message});
 if(!message.method){if(message.id===900){hostRequestAnswered=message.error?.code===-32601;log({event:'host-request-denied',denied:hostRequestAnswered});await result(hostRequestInventoryId,{data:[],nextCursor:null})}return}
 const {id,method,params}=message;
 if(method==='initialize')return result(id,{userAgent:'fixture/1'});
 if(method==='initialized')return;
 if(method==='skills/list')return result(id,{data:[{cwd,errors:[],skills:[{name:'fixture-host-skill',path:path.join(directory,'host-home','skills','fixture','SKILL.md'),enabled:scenario.skillEnabled || !disabledSkills}]}]});
 if(method==='config/read'){
  const config={features,web_search:parse('web_search'),developer_instructions:parse('developer_instructions'),project_doc_max_bytes:parse('project_doc_max_bytes'),model_instructions_file:parse('model_instructions_file'),notify:[],mcp_servers:{},model_provider:parse('model_provider'),permissions:{atlas_bridge:{filesystem:{':minimal':'read'},network:{enabled:false}}}};
  if(scenario.audit==='host-mcp')config.mcp_servers.host_files={enabled:true,url:'http://host.invalid/mcp'};
  if(scenario.audit==='shell')config.features.shell_tool=true;
  if(scenario.audit==='code-host')config.features.code_mode_host=false;
  if(scenario.audit==='instructions')config.developer_instructions='HOST_PRIVATE_INSTRUCTIONS';
  if(scenario.audit==='network')config.permissions.atlas_bridge.network.enabled=true;
  if(scenario.audit==='filesystem')config.permissions.atlas_bridge.filesystem['/private']='read';
  if(scenario.audit==='model-catalog')config.model_catalog_json='/host/private-models.json';
  return result(id,{config});
 }
 if(method==='account/read')return result(id,{account:{type:'chatgpt'},requiresOpenaiAuth:true});
 if(method==='thread/start'){
  requestedMcp=params.config?.mcp_servers||{};
  return result(id,{thread:{id:'fixture-thread'},cwd:params.cwd,activePermissionProfile:{id:scenario.audit==='profile'?'unsafe-profile':'atlas_bridge'},approvalPolicy:'never',modelProvider:'openai',runtimeWorkspaceRoots:[],instructionSources:scenario.audit==='instruction-sources'?['/host/private/AGENTS.md']:[],sandbox:{type:'readOnly',networkAccess:false}});
 }
 if(method==='mcpServerStatus/list'){
  if(scenario.hostRequest){hostRequestInventoryId=id;await send({id:900,method:'item/tool/call',params:{threadId:'fixture-thread',tool:'read_host_file',arguments:{path:'/host/private/file'}}});return}
  if(scenario.audit==='mcp-pagination' && !params.cursor)return result(id,{data:Object.keys(requestedMcp).map(name=>({name,tools:{}})),nextCursor:'page-2'});
  let names=scenario.audit==='missing-mcp'?[]:Object.keys(requestedMcp);
  if(scenario.audit==='mcp-inventory' || scenario.audit==='mcp-pagination')names.push('unexpected_host_mcp');
  return result(id,{data:names.map(name=>({name,tools:{}})),nextCursor:null});
 }
 if(method==='turn/start'){await result(id,{turn:{id:'fixture-turn',status:'inProgress'}});stream().catch(()=>process.exit(3));return}
 if(method==='turn/interrupt'){interrupted=true;await result(id,{});await complete('interrupted');return}
 return send({id,error:{code:-32601,message:'Unknown fixture request'}});
});
`;

async function fixture(scenario,run){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'atlas-app-server-test-'));
 const hostHome=path.join(directory,'host-home'),runtime=path.join(directory,'runtime');
 fs.mkdirSync(hostHome);fs.mkdirSync(runtime);
 // This is a synthetic credential placeholder; the fixture only checks the symlink type.
 fs.writeFileSync(path.join(hostHome,'auth.json'),'{}\n',{mode:0o600});
 const bin=path.join(directory,'codex-fixture');fs.writeFileSync(bin,fixtureSource,{mode:0o700});
 fs.writeFileSync(path.join(directory,'scenario.json'),JSON.stringify(scenario));
 const saved=new Map(['CODEX_HOME','ATLAS_FIXTURE_SECRET','CODEX_APP_TOOLS_PIPE_PATH','CODEX_THREAD_ID'].map(name=>[name,process.env[name]]));
 process.env.CODEX_HOME=hostHome;process.env.ATLAS_FIXTURE_SECRET='synthetic-secret';process.env.CODEX_APP_TOOLS_PIPE_PATH='synthetic-desktop-pipe';process.env.CODEX_THREAD_ID='synthetic-host-thread';
 const readTrace=()=>fs.existsSync(path.join(directory,'trace.jsonl'))?fs.readFileSync(path.join(directory,'trace.jsonl'),'utf8').trim().split('\n').filter(Boolean).map(JSON.parse):[];
 try{
  await run({configuration:{bin,version:'fixture-only',temporaryRoot:runtime},readTrace,directory});
  assert.deepEqual(fs.readdirSync(runtime),[],'temporary auth and session directories must be removed');
  assert.equal(fs.readFileSync(path.join(hostHome,'auth.json'),'utf8'),'{}\n','source auth placeholder must remain untouched');
 }finally{
  for(const[name,value]of saved)value===undefined?delete process.env[name]:process.env[name]=value;
  fs.rmSync(directory,{recursive:true,force:true});
 }
}
const options=extra=>({guidance:'测试教学引导',context:{messages:[{role:'user',body:'中文问题；literal $(echo nope) `command`'}]},timeoutMs:10000,...extra});
const methods=trace=>trace.filter(row=>row.event==='request'&&row.method).map(row=>row.method);

test('native protocol preserves fragmented Chinese UTF-8, streams before completion, and uses authoritative final items',async()=>{
 await fixture({},async({configuration,readTrace})=>{
  const events=[];let completed=false,sawEarlyDelta=false;
  const result=await runCodex(configuration,options({onEvent:async event=>{
   if(event.method==='item/agentMessage/delta'&&!completed)sawEarlyDelta=true;
   if(event.method==='turn/completed')completed=true;
   events.push(event);
  }}));
  assert.equal(result.body,'中文探索🧪：已完成。');assert.equal(result.threadId,'fixture-thread');assert.equal(result.turnId,'fixture-turn');
  assert.equal(result.execution.provider,'codex-app-server');assert.ok(sawEarlyDelta);
  assert.equal(events.filter(e=>e.method==='item/agentMessage/delta').map(e=>e.params.delta).join(''),result.body);
  assert.ok(!JSON.stringify(events).includes('RAW_REASONING'));assert.ok(!JSON.stringify(events).includes('FOREIGN_PRIVATE_TEXT'));
  assert.ok(!result.body.includes('开始探索'),'commentary must not become the final answer');
  const trace=readTrace(),spawns=trace.filter(x=>x.event==='spawn');
  assert.equal(spawns.length,2,'discovered host Skills are disabled by a fresh process before a model turn');
  for(const spawn of spawns){assert.equal(spawn.hasSecret,false);assert.equal(spawn.hasDesktopPipe,false);assert.equal(spawn.hasHostThread,false);assert.equal(spawn.authIsSymlink,true);assert.equal(spawn.credentialHomeIsSeparate,true)}
  const turn=trace.find(x=>x.method==='turn/start');
  assert.ok(turn.params.input[0].text.includes('literal $(echo nope) `command`'),'user text travels literally over stdin');
  const started=trace.find(x=>x.method==='thread/start').params;
  assert.equal(started.ephemeral,true);assert.equal(started.experimentalRawEvents,false);assert.equal(started.approvalPolicy,'never');
  assert.deepEqual(started.selectedCapabilityRoots,[]);assert.deepEqual(started.environments,[]);assert.deepEqual(started.dynamicTools,[]);
  assert.ok(spawns[1].args.some((arg,i)=>arg==='--enable'&&spawns[1].args[i+1]==='code_mode_host'),'native code host is needed even when shell and desktop tools stay disabled');
  for(const flag of ['shell_tool','apps','plugins','hooks','multi_agent','browser_use','computer_use'])assert.ok(spawns[1].args.some((arg,i)=>arg==='--disable'&&spawns[1].args[i+1]===flag));
 });
});

test('explicit HTTP MCP is passed over stdin and must be the complete native inventory',async()=>{
 await fixture({},async({configuration,readTrace})=>{
  const result=await runCodex(configuration,options({mcpServers:{sandbox:{url:'http://127.0.0.1:18080/mcp',http_headers:{Authorization:'synthetic-token'},enabled_tools:['browser_get_state']}}}));
  assert.deepEqual(result.execution.tools,['sandbox']);
  const trace=readTrace(),configured=trace.find(x=>x.method==='thread/start').params.config.mcp_servers;
  assert.equal(configured.sandbox.url,'http://127.0.0.1:18080/mcp');assert.equal(configured.sandbox.required,true);assert.equal(configured.sandbox.enabled,true);assert.equal(configured.sandbox.default_tools_approval_mode,'approve','the trusted Sandbox MCP has explicit approval; auto would block native calls under never');
  assert.deepEqual(configured.sandbox.enabled_tools,['browser_get_state']);
  assert.ok(!JSON.stringify(trace.filter(x=>x.event==='spawn')).includes('synthetic-token'),'MCP credentials must not be process arguments');
 });
});

test('abort uses native turn/interrupt and exposes interrupted completion without returning a late answer',async()=>{
 await fixture({hold:true},async({configuration,readTrace})=>{
  const controller=new AbortController();let completedStatus=null;
  await assert.rejects(runCodex(configuration,options({signal:controller.signal,onEvent:event=>{
   if(event.method==='item/agentMessage/delta')controller.abort();
   if(event.method==='turn/completed')completedStatus=event.params.turn.status;
  }})),/回答已停止/);
  assert.equal(completedStatus,'interrupted');
  const interrupts=readTrace().filter(x=>x.method==='turn/interrupt');assert.equal(interrupts.length,1);
  assert.deepEqual(interrupts[0].params,{threadId:'fixture-thread',turnId:'fixture-turn'});
 });
});

test('callback failures reject both during streaming and after native completed has already arrived',async t=>{
 for(const failingMethod of ['item/agentMessage/delta','turn/completed'])await t.test(failingMethod,async()=>{
  await fixture({hold:failingMethod==='item/agentMessage/delta'},async({configuration})=>{
   const failure=new Error('synthetic event persistence failed');let failures=0;
   await assert.rejects(runCodex(configuration,options({onEvent:async event=>{
    if(event.method===failingMethod){await new Promise(r=>setTimeout(r,5));failures++;throw failure}
   }})),error=>error===failure);
   assert.equal(failures,1);
  });
 });
});

test('host capability/config audit fails before turn/start',async t=>{
 for(const audit of ['host-mcp','shell','code-host','instructions','network','filesystem','model-catalog','profile','instruction-sources','mcp-inventory','mcp-pagination','missing-mcp'])await t.test(audit,async()=>{
  await fixture({audit},async({configuration,readTrace})=>{
   await assert.rejects(runCodex(configuration,options({mcpServers:{sandbox:{url:'http://127.0.0.1:18080/mcp'}}})),/隔离|权限|宿主 MCP/);
   assert.ok(!methods(readTrace()).includes('turn/start'),'unsafe configuration must not reach the model');
  });
 });
 await t.test('still-enabled host Skill',async()=>{
  await fixture({skillEnabled:true},async({configuration,readTrace})=>{
   await assert.rejects(runCodex(configuration,options()),/Skill 隔离/);
   assert.ok(!methods(readTrace()).includes('thread/start'));
  });
 });
});

test('MCP local commands and malformed protocol are rejected',async t=>{
 await t.test('stdio host command',async()=>{
  await fixture({},async({configuration,readTrace})=>{
   await assert.rejects(runCodex(configuration,options({mcpServers:{host:{command:'sh',args:['-c','cat private']}}})),/仅允许显式 HTTP MCP/);
   assert.ok(!methods(readTrace()).includes('turn/start'));
  });
 });
 await t.test('invalid JSON after a valid delta',async()=>{
  await fixture({malformed:true},async({configuration})=>{
   await assert.rejects(runCodex(configuration,options()),/协议格式异常/);
  });
 });
});
