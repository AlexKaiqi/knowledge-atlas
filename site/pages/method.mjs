import { shell } from '../components/html.mjs';
export function renderMethod(){
 const body=`<section class="wrap narrow about-page"><p class="kicker">Repository methodology</p><h1>把知识网站当成可执行项目维护。</h1><p class="lede">核心对象不是 HTML，而是 <strong>Case / Knowledge / Page / Runtime</strong>。HTML 是由这些对象生成的发布产物。</p><div class="invariants"><div><span>01</span><h3>Case is a first-class object</h3><p>问题、环境、Harness、证据与 replay 都写进 manifest。</p></div><div><span>02</span><h3>Knowledge is reusable</h3><p>一个知识点可以被多个 Case 引用，Case 不复制理论正文。</p></div><div><span>03</span><h3>Runtime is pluggable</h3><p>交互逻辑与内容分离；未来可换真实 Agent Provider。</p></div><div><span>04</span><h3>Pages are generated</h3><p>首页、Case 页、Knowledge 页由 registry + template 自动生成。</p></div><div><span>05</span><h3>Schema before publish</h3><p>缺 assumptions / does-not-imply / 断链引用会让 build 失败。</p></div><div><span>06</span><h3>Dist is disposable</h3><p><code>dist/</code> 永远可以从 source-of-truth 重新生成。</p></div></div><div class="data-model"><pre>content/
├─ cases/          # executable case manifests
├─ knowledge/      # theorem/model/heuristic/policy objects
└─ planned-cases   # backlog

site/
├─ pages/          # HTML page templates
├─ runtime/        # executable labs
├─ components/
└─ assets/

scripts/
├─ validate.mjs
├─ build.mjs
└─ serve.mjs

schemas/
└─ content contracts

dist/              # generated GitHub Pages artifact</pre></div>

<section class="agent-blueprint" id="agent"><p class="kicker">Agent integration</p><h2>不是把整个仓库塞给模型，<br>而是给它一个受约束的项目接口。</h2><p class="agent-blueprint-lede">当前语料很小，通用模型可以直接读取完整结构化上下文；内容增大后，再把检索替换成向量搜索。浏览器只负责交互，密钥、预算与工具权限留在服务端。</p><div class="agent-flow"><div><small>01 · STATIC SITE</small><b>GitHub Pages</b><span>页面上下文 + 用户问题</span></div><i>→</i><div><small>02 · SECURITY</small><b>Serverless Gateway</b><span>鉴权、限流、预算与日志</span></div><i>→</i><div><small>03 · POLICY</small><b>Agent Provider</b><span>检索 + 回答 + 只读工具</span></div><i>→</i><div><small>04 · TRUTH</small><b>Atlas Objects</b><span>Knowledge / Case / Relations</span></div></div><div class="agent-contracts"><div><span>READ</span><h3>知识问答</h3><p>使用生成的完整上下文或 registry，回答时保留 epistemic type、assumptions 和 does-not-imply。</p></div><div><span>EXPLORE</span><h3>关系探索</h3><p>暴露 <code>search_atlas</code>、<code>get_node</code>、<code>get_neighbors</code> 三个只读工具。</p></div><div><span>ACT</span><h3>可执行 Case</h3><p>真实模型只替换 Provider；Environment 继续掌握事实、权限、observer 与 verdict。</p></div></div><div class="agent-entrypoints"><a href="../data/agent-context.json">Agent context · JSON ↗</a><a href="../data/registry.json">Registry + relations · JSON ↗</a><a href="../llms.txt">llms.txt ↗</a><a href="../llms-full.txt">llms-full.txt ↗</a></div></section></section>`;
 return shell({title:'Method — Knowledge Atlas',body,root:'../',active:'method'});
}
