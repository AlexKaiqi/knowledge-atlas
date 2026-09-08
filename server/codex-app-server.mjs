// Native Codex app-server adapter. Version-tested protocol, no model SDK or agent loop.
// No SDK model calls or custom agent tool loop. The native CLI owns auth, turns, and MCP.
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const DISABLED = ['shell_tool','apps','plugins','hooks','multi_agent','multi_agent_v2','browser_use','browser_use_external','computer_use','in_app_browser','code_mode','view_image','image_generation','workspace_dependencies','skill_search','sleep_tool','tool_suggest','memories','remote_plugin','recommended_plugins','skill_mcp_dependency_install','goals','auth_elicitation','request_permissions_tool','context_management','external_agent_memory_import'];
const PUBLIC = new Set(['item/agentMessage/delta','item/started','item/completed','turn/started','turn/completed','turn/plan/updated','thread/status/changed','item/mcpToolCall/progress']);
const envNames = ['HOME','PATH','LANG','LC_ALL','TMPDIR','SYSTEMROOT','USERPROFILE'];
const toml = value => typeof value === 'string' ? JSON.stringify(value) : typeof value === 'boolean' || typeof value === 'number' ? String(value) : Array.isArray(value) ? `[${value.map(toml).join(',')}]` : `{${Object.entries(value).map(([k,v])=>`${JSON.stringify(k)}=${toml(v)}`).join(',')}}`;
function publicNotification(message) {
  if (!PUBLIC.has(message.method)) return null;
  if (message.params?.item?.type === 'reasoning') return null;
  // turn/completed may contain reasoning items even without raw-reasoning notifications.
  if (message.params?.turn?.items) return {method:message.method,params:{...message.params,turn:{...message.params.turn,items:message.params.turn.items.filter(i=>i.type !== 'reasoning')}}};
  return {method:message.method,params:message.params};
}
function normalizedMcpServers(input = {}) {
  if (!input || Array.isArray(input) || typeof input !== 'object') throw new Error('MCP 配置必须由服务器提供。');
  return Object.fromEntries(Object.entries(input).map(([name,server])=>{
    if (!/^[A-Za-z][A-Za-z0-9_-]{0,47}$/.test(name) || !server || typeof server !== 'object') throw new Error('无效的 MCP 配置。');
    const keys = ['url','http_headers','enabled_tools','disabled_tools','startup_timeout_sec','tool_timeout_sec'];
    if (Object.keys(server).some(k=>!keys.includes(k))) throw new Error('仅允许显式 HTTP MCP；不允许宿主命令或凭据辅助命令。');
    const url = new URL(server.url);
    if (!['http:','https:'].includes(url.protocol) || url.username || url.password || url.hash) throw new Error('无效的 MCP URL。');
    if (server.http_headers && (typeof server.http_headers !== 'object' || Array.isArray(server.http_headers) || Object.values(server.http_headers).some(v=>typeof v !== 'string'))) throw new Error('无效的 MCP 请求头。');
    for (const key of ['enabled_tools','disabled_tools']) if (server[key] && (!Array.isArray(server[key]) || server[key].some(x=>typeof x!=='string'))) throw new Error('无效的 MCP 工具清单。');
    return [name,{...server,url:url.href,enabled:true,required:true,default_tools_approval_mode:'approve'}];
  }));
}
class NativeRpc {
  constructor(bin,args,options,onNotification) {
    this.pending = new Map(); this.sequence = 0; this.failure = null;
    this.child = spawn(bin,args,{...options,detached:process.platform !== 'win32',stdio:['pipe','pipe','pipe']});
    this.child.stdin.on('error',()=>{}); this.child.stderr.on('data',()=>{}); // Never persist raw CLI/config/auth diagnostics.
    const lines=createInterface({input:this.child.stdout});let total=0;
    lines.on('line',line=>{
      total += Buffer.byteLength(line);
      if (line.length > 8000000 || total > 32000000) return this.fail(new Error('Codex 原生事件过大。'));
      let message;try{message=JSON.parse(line)}catch{return this.fail(new Error('Codex 原生协议格式异常。'))}
      if (message.id != null && !message.method) {
        const entry=this.pending.get(message.id);if(!entry)return;
        this.pending.delete(message.id);clearTimeout(entry.timer);
        message.error?entry.reject(new Error(`Codex ${entry.method} 失败（${message.error.code}）。`)):entry.resolve(message.result);
      } else if (message.id != null) {
        // No host-side callbacks, approvals, arbitrary file reads, or dynamic tools.
        this.write({id:message.id,error:{code:-32601,message:'This bridge does not implement host requests.'}});
      } else onNotification(message);
    });
    this.child.once('error',()=>this.fail(new Error('无法启动 Codex app-server。')));
    this.child.once('close',()=>this.fail(new Error('Codex app-server 已退出。')));
  }
  write(message){if(this.child.stdin.writable)this.child.stdin.write(JSON.stringify(message)+'\n')}
  request(method,params,timeout=20000){
    if(this.failure)return Promise.reject(this.failure);
    const id=++this.sequence;
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error(`Codex ${method} 超时。`))},timeout);
      this.pending.set(id,{resolve,reject,timer,method});this.write({id,method,params});
    });
  }
  fail(error){if(this.failure)return;this.failure=error;for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(error)}this.pending.clear();this.onFailure?.(error)}
  async close(){
    const child=this.child;if(child.exitCode !== null)return;
    const kill=signal=>{try{process.platform==='win32'?child.kill(signal):process.kill(-child.pid,signal)}catch{}};
    child.stdin.end();kill('SIGTERM');
    await new Promise(resolve=>{const timer=setTimeout(()=>{kill('SIGKILL');resolve()},1000);child.once('close',()=>{clearTimeout(timer);resolve()})});
  }
}

// Exposed only to the local no-model probe; product code should call runCodex.
export async function openIsolatedCodex(configuration, {onNotification=()=>{}, mcpServers={}}={}) {
  const parent=configuration.temporaryRoot || os.tmpdir();
  await fs.mkdir(parent,{recursive:true,mode:0o700});
  const directory=await fs.mkdtemp(path.join(parent,'atlas-native-'));
  const credentials=path.join(directory,'codex-home'),workspace=path.join(directory,'workspace');
  let rpc;
  try {
    await fs.mkdir(credentials,{mode:0o700});await fs.mkdir(workspace,{mode:0o700});
    // Stop project-layer discovery at this isolated, empty workspace.
    await fs.mkdir(path.join(workspace,'.git'),{mode:0o700});
    const originalHome=process.env.CODEX_HOME || path.join(os.homedir(),'.codex');
    const auth=path.join(originalHome,'auth.json');
    if (!(await fs.stat(auth).catch(()=>null))?.isFile()) throw new Error('此薄桥接需要原生文件认证；当前未找到 auth.json，Keychain-only 登录尚未支持。');
    await fs.symlink(auth,path.join(credentials,'auth.json'));
    const instructions=path.join(credentials,'instructions.md');
    await fs.writeFile(instructions,'You are an assistant participating in a learning discussion. Follow the supplied developer guidance and user conversation. Use only explicitly available tools.\n',{mode:0o600});
    const override={
      model_provider:'openai',approval_policy:'never',web_search:'disabled',project_doc_max_bytes:0,
      model_instructions_file:instructions,developer_instructions:'',instructions:'',compact_prompt:'Summarize only this learning conversation.',
      notify:[],cli_auth_credentials_store:'file',check_for_update_on_startup:false,
      include_apps_instructions:false,include_collaboration_mode_instructions:false,include_environment_context:false,
      default_permissions:'atlas_bridge',permissions:{atlas_bridge:{filesystem:{':minimal':'read'},network:{enabled:false}}},
      analytics:{enabled:false},feedback:{enabled:false},history:{persistence:'none'},
    };
    // Same native CODEX_HOME purpose, separate child process config/state; no credential copy/read.
    const env={...Object.fromEntries(envNames.filter(k=>process.env[k]).map(k=>[k,process.env[k]])),CODEX_HOME:credentials};
    const launch=skills=>new NativeRpc(configuration.bin,['app-server',...DISABLED.flatMap(n=>['--disable',n]),'--enable','code_mode_host','--enable','skip_host_skill_discovery',...Object.entries({...override,...(skills?{skills:{config:skills.map(file=>({path:file,enabled:false}))}}:{})}).flatMap(([k,v])=>['-c',`${k}=${toml(v)}`])],{cwd:workspace,env},onNotification);
    const initialize=async()=>{await rpc.request('initialize',{clientInfo:{name:'knowledge_atlas_bridge',version:'0.1.0'},capabilities:{experimentalApi:true}});rpc.write({method:'initialized'})};
    rpc=launch();await initialize();
    // Native discovery can still find bundled/global Skills outside CODEX_HOME. Names/paths only;
    // no Skill content is read by this bridge and no turn has been created yet.
    const discovered=await rpc.request('skills/list',{cwds:[workspace],forceReload:true});
    if(!Array.isArray(discovered.data))throw new Error('Codex Skills 协议不兼容；未发出模型请求。');
    const entries=discovered.data.flatMap(x=>x.skills||[]);
    const skillFiles=[...new Set(entries.map(s=>s.path).filter(Boolean))];
    if(skillFiles.length){await rpc.close();rpc=launch(skillFiles);await initialize()}
    const effective=(await rpc.request('config/read',{cwd:workspace,includeLayers:false})).config;
    if(effective.features?.code_mode_host!==true || DISABLED.some(name=>effective.features?.[name] !== false) || effective.web_search!=='disabled' || effective.developer_instructions!=='' || effective.project_doc_max_bytes!==0 || effective.model_instructions_file!==instructions || effective.notify?.length || Object.values(effective.mcp_servers||{}).some(server=>server.enabled!==false)) throw new Error('Codex 隔离配置检查未通过；未发出模型请求。');
    const finalSkills=await rpc.request('skills/list',{cwds:[workspace],forceReload:true});
    if(!Array.isArray(finalSkills.data) || finalSkills.data.some(x=>x.errors?.length || x.skills?.some(s=>s.enabled))) throw new Error('Codex 宿主 Skill 隔离检查未通过；未发出模型请求。');
    const permission=effective.permissions?.atlas_bridge;
    if(permission?.extends || permission?.network?.enabled!==false || permission?.filesystem?.[':minimal']!=='read' || Object.entries(permission.filesystem).some(([name,value])=>name!==':minimal' && value!=null) || effective.model_provider!=='openai' || effective.model_catalog_json || effective.experimental_compact_prompt_file)throw new Error('Codex 文件与模型隔离检查未通过；未发出模型请求。');
    const account=await rpc.request('account/read',{refreshToken:false});
    if(!account.account) throw new Error('原生 Codex 登录不可用，请检查本机登录状态。');
    return {rpc,directory,workspace,instructions,mcpServers:normalizedMcpServers(mcpServers),audit:{disabledSkills:skillFiles.length,hostMcpEnabled:0,configuration:'isolated-child-home',authType:account.account.type,filesystem:effective.permissions?.atlas_bridge?.filesystem,network:effective.permissions?.atlas_bridge?.network,externalModelCatalog:!!effective.model_catalog_json,externalCompactionFile:!!effective.experimental_compact_prompt_file,modelProvider:effective.model_provider},async close(){await rpc.close();await fs.rm(directory,{recursive:true,force:true})}};
  } catch(error) {await rpc?.close();await fs.rm(directory,{recursive:true,force:true});throw error}
}

export async function runCodex(configuration,{guidance,context,signal,onEvent=()=>{},mcpServers={},timeoutMs=180000}={}) {
  if(signal?.aborted)throw new Error('回答已停止。');
  let threadId=null,turnId=null,session,finished=false,abortError=null,settle,fail,stopTimer=null;
  let callbackChain=Promise.resolve(),callbackError=null;const messages=new Map();
  const done=new Promise((resolve,reject)=>{settle=resolve;fail=reject});done.catch(()=>{});
  const receive=event=>{
    if(event.params?.threadId && threadId && event.params.threadId!==threadId)return;
    if(event.method==='turn/started'){turnId=event.params?.turn?.id || turnId;if(abortError)stop()}
    const item=event.params?.item;
    if(event.method==='item/completed' && item?.type==='agentMessage')messages.set(item.id,item);
    const visible=publicNotification(event);
    if(visible) callbackChain=callbackChain.then(()=>{if(!callbackError)return onEvent(visible)}).catch(error=>{callbackError=error;fail(error);stop()});
    if(event.method==='turn/completed'){finished=true;settle(event.params.turn)}
  };
  const stop=()=>{
    abortError ||= new Error('回答已停止。');
    if(threadId && turnId)session.rpc.request('turn/interrupt',{threadId,turnId},3000).catch(()=>{});
    if(!stopTimer)stopTimer=setTimeout(()=>{if(!finished){fail(abortError);session?.rpc.close()}},3500);
    stopTimer.unref();
  };
  const timer=setTimeout(()=>{abortError=new Error('Codex 回答超时，问题已保存，可以重试。');stop()},timeoutMs);
  signal?.addEventListener('abort',stop,{once:true});
  try {
    session=await openIsolatedCodex(configuration,{onNotification:receive,mcpServers});
    session.rpc.onFailure=error=>{if(!finished)fail(error)};
    if(abortError || signal?.aborted)throw abortError || new Error('回答已停止。');
    const started=await session.rpc.request('thread/start',{
      cwd:session.workspace,runtimeWorkspaceRoots:[],ephemeral:true,
      approvalPolicy:'never',permissions:'atlas_bridge',experimentalRawEvents:false,
      selectedCapabilityRoots:[],environments:[],dynamicTools:[],
      developerInstructions:[guidance || '',Object.keys(session.mcpServers).length ? '本机与远端环境的权限边界：本次 Codex 的只读文件系统和网络限制约束本机执行环境；不得访问本机凭据、数据库、仓库或桌面。显式提供的 MCP 连接到另一个独立的实践环境。通过这些 MCP 传入的路径（例如 /home/gem/workspace）指远端环境的文件系统，不是本机同名路径。用户要求在该实践环境创建、修改文件或运行实验时，应使用已提供的远端 MCP 完成；本机只读不表示远端 MCP 只读。不要更改本机权限或改用本机终端。只有远端工具实际返回权限错误时，才报告该操作被拒绝；没有调用工具时，不得推断远端写入被本机只读设置禁止。' : ''].filter(Boolean).join('\n\n'),
      ...(configuration.model?{model:configuration.model}:{}),
      config:{mcp_servers:session.mcpServers},
    });
    threadId=started.thread.id;
    if(started.activePermissionProfile?.id!=='atlas_bridge' || started.approvalPolicy!=='never' || started.cwd!==session.workspace || started.modelProvider!=='openai' || started.runtimeWorkspaceRoots?.length || started.instructionSources?.some(source=>source!==session.instructions))throw new Error('Codex 原生会话权限检查未通过。');
    let cursor=null;const active=[];
    do{const inventory=await session.rpc.request('mcpServerStatus/list',{threadId,limit:100,cursor});active.push(...inventory.data);cursor=inventory.nextCursor}while(cursor);
    if(active.some(s=>!Object.hasOwn(session.mcpServers,s.name)) || Object.keys(session.mcpServers).some(name=>!active.some(s=>s.name===name)))throw new Error('发现未授权的宿主 MCP；未发出模型请求。');
    if(abortError || signal?.aborted)throw abortError || new Error('回答已停止。');
    const environment = Object.keys(session.mcpServers).length
      ? '已连接本段探索独立的 AIO 工作环境。通过提供的 MCP 使用浏览器、终端和文件；不要尝试操作主机。用户工作面板与这些浏览器工具使用同一 Chrome，用户会亲自点击或输入，操作前重新读取当前页面状态。需要制作网页、实验或工具时，直接在环境内实现并启动应用，再用浏览器实际打开、检验；不要只给代码或口头承诺。需要工具时先给一句简短行动说明。持久文件都放在 /home/gem/workspace；保存启动步骤和依赖（例如 README、requirements 或 package.json），方便暂停后继续。应用监听容器内 0.0.0.0，可用浏览器打开 http://localhost:端口。预览无需发布公网。遵守用户指定范围；不擅自提交表单、发送消息、购买或登录。结束时指出实际做了什么及仍待检验的部分。'
      : `当前未开放实践浏览器或其他外部工具。${context?.workbenchUnavailable || ''} 可以正常解释问题，但不能声称已经检索、创建文件或运行实验。`;
    const prompt=`当前是知图学习讨论。回答最后一个用户问题。只有所提供的对话是本次聊天上下文。${environment}\n\n对话（JSON，role 是发言身份，body 是发言内容）：\n${JSON.stringify(context?.messages||[])}`;
    const turn=await session.rpc.request('turn/start',{threadId,input:[{type:'text',text:prompt,text_elements:[]}],...(configuration.effort?{effort:configuration.effort}:{})});
    turnId=turn.turn.id;
    if(abortError || signal?.aborted)stop();
    const result=await done;await callbackChain;if(callbackError)throw callbackError;
    if(abortError || result.status==='interrupted')throw abortError || new Error('回答已停止。');
    if(result.status!=='completed')throw new Error('Codex 未完成本次回答。');
    for(const item of result.items||[])if(item.type==='agentMessage')messages.set(item.id,item);
    const final=[...messages.values()].filter(item=>item.phase!=='commentary');
    const body=final.map(item=>item.text).join('\n\n').trim();
    if(!body || body.length>24000)throw new Error('Codex 回答为空或过长。');
    return {body,threadId,turnId,execution:{provider:'codex-app-server',version:configuration.version,threadId,turnId,tools:Object.keys(session.mcpServers),completedAt:Date.now()}};
  } finally {clearTimeout(timer);clearTimeout(stopTimer);signal?.removeEventListener('abort',stop);await session?.close()}
}
