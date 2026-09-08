import { attachBrowserInput } from "./browser-input.js";
// The actual browser UI is the upstream Web Component, not an iframe of a report.
let component;
async function loadComponent() {
  if (!component) component = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = new URL("./vendor/browser-ui.js", import.meta.url).href;
    script.onload = () => resolve(window.agent_infra_browser_ui.BrowserUI);
    script.onerror = () => { component = null; reject(new Error("浏览器组件未载入，请重试。")); };
    document.head.append(script);
  });
  return component;
}

export function createBrowserPanel({ root, api, notify }) {
  let scope = null, enabled = false, allowed = false, visible = false, epoch = 0;
  let connection = null, pending = null, checking = null, operating = null, lastChecked = 0;
  let activity = null, followTimer = null, lastInteraction = 0, pointerDown = false, disconnections = Promise.resolve();
  const detached = new WeakSet(), inputDrafts = new Map();
  root.addEventListener("pointerdown", () => { pointerDown=true; lastInteraction=Date.now(); });
  window.addEventListener("pointerup", () => { pointerDown=false; });
  root.addEventListener("keydown", () => { lastInteraction=Date.now(); });
  root.innerHTML = `<div class="browser-empty"><h2>一起打开、一起探索</h2><p class="browser-state" role="status"></p><button class="primary" data-browser-start>打开浏览器</button></div><div class="browser-canvas" hidden></div><div class="browser-footer" hidden><span>独立环境 · 文件持续保留</span><button data-browser-reconnect>重新连接画面</button><button data-browser-stop>暂停环境</button></div>`;
  const empty = root.querySelector(".browser-empty"), canvas = root.querySelector(".browser-canvas"), status = root.querySelector(".browser-state"), start = root.querySelector("[data-browser-start]");
  const footer = root.querySelector(".browser-footer");
  const valid = (id, version) => id === scope && version === epoch && enabled && allowed;
  const show = text => { empty.hidden = false; status.textContent = text; };
  function dispose(record) {
    if (!record) return disconnections;
    record.inputCleanup?.(); record.mount.remove();
    if (record.ui && !detached.has(record.ui)) {
      const old=record.ui; detached.add(old);
      disconnections = disconnections.catch(() => {}).then(async () => {
        // browser-ui 0.2.2 destroy closes managed tabs. Disconnect transport
        // first so cleanup cannot close the shared experiment or its form.
        old.browser.isIntentionalDisconnect = true;
        await old.browser.pptrBrowser?.disconnect();
        await old.destroy().catch(() => {});
      });
    }
    return disconnections;
  }
  function invalidate() {
    epoch++; clearTimeout(followTimer); followTimer=null; lastChecked = 0; checking = null; operating = null;
    dispose(connection); connection = null;
    dispose(pending); pending = null;
    start.disabled = false;
  }
  async function connect(data, id, version) {
    if (connection || pending || !visible || !valid(id, version)) return;
    const record = { mount: document.createElement("div"), ui: null };
    record.mount.style.cssText = "width:100%;height:100%";
    pending = record; show("正在连接同一个浏览器画面…");
    try {
      await disconnections;
      const BrowserUI = await loadComponent();
      if (!valid(id, version) || pending !== record) return;
      empty.hidden = true; canvas.hidden = false; footer.hidden = false;
      canvas.append(record.mount);
      const rect = canvas.getBoundingClientRect(); record.width = rect.width;
      const endpoint = new URL(data.socketPath, location.origin); endpoint.protocol = location.protocol === "https:" ? "wss:" : "ws:";
      record.ui = await BrowserUI.create({ root: record.mount, browserOptions: {
        connect: { browserWSEndpoint: endpoint.href, defaultViewport: { width: Math.max(320, Math.round(rect.width || 800)), height: Math.max(320, Math.round(rect.height || 600)) } },
        cast: { format: "jpeg", quality: 75, everyNthFrame: 1 },
      } });
      if (!valid(id, version) || pending !== record) { dispose(record); return; }
      connection = record; record.inputCleanup = attachBrowserInput(record.ui, root, notify, inputDrafts, id); empty.hidden = true;
    } catch (error) {
      dispose(record);
      if (valid(id, version)) { canvas.hidden = true; show(error.message || "画面连接中断，请重新连接。"); }
    } finally { if (pending === record) pending = null; }
  }
  async function refresh(force = false) {
    if (!scope || !enabled || !allowed || !visible || checking || (!force && Date.now() - lastChecked < 2500)) return;
    const ticket = {}; checking = ticket;
    const id = scope, version = epoch; lastChecked = Date.now();
    try {
      const data = await api(`/spaces/${id}/browser`);
      if (!valid(id, version)) return;
      start.hidden = !data.available || data.state === "starting";
      start.textContent = data.state === "paused" ? "继续这个环境" : "打开浏览器";
      if (data.state === "running") await connect(data, id, version);
      else {
        dispose(connection); connection = null;
        canvas.hidden = true; footer.hidden = true;
        show(data.reason || (data.state === "starting" ? "正在准备独立浏览器，Codex 的过程会同步显示。" : data.state === "paused" ? "环境已暂停，文件仍在。继续后可让 Codex 启动原来的应用。" : "直接告诉 Codex 想做什么。网页、实验和小工具可以在这里运行，你也可以随时操作。"));
      }
    } catch (error) { if (valid(id, version)) { dispose(connection); connection = null; canvas.hidden = true; show(error.message); } }
    finally { if (checking === ticket) checking = null; }
  }
  async function operate(operation) {
    const id = scope, version = epoch;
    if (!id || !allowed || operating) return;
    operating = { id, version }; start.disabled = true;
    show(operation === "start" ? "正在准备浏览器环境…" : "正在暂停，文件会保留…");
    try { await api(`/spaces/${id}/browser`, { operation }); }
    catch (error) { if (valid(id, version)) notify(error.message); }
    finally { if (valid(id, version)) { operating = null; start.disabled = false; await refresh(true); } }
  }
  start.onclick = () => operate("start");
  root.querySelector("[data-browser-stop]").onclick = () => operate("stop");
  root.querySelector("[data-browser-reconnect]").onclick = async () => { if (!operating) { invalidate(); await refresh(true); } };
  const observer = new ResizeObserver(() => {
    if (!connection || !visible || canvas.clientWidth < 200 || Math.abs(canvas.clientWidth-connection.width)<20) return;
    clearTimeout(followTimer);
    const id=scope, version=epoch;
    const resize = async () => {
      if (!valid(id,version) || !visible) return;
      if (pointerDown || Date.now()-lastInteraction<1000 || root.querySelector('.browser-text-input textarea:focus')) { followTimer=setTimeout(resize,1000); return; }
      invalidate(); await refresh(true);
    };
    followTimer=setTimeout(resize,350);
  });
  observer.observe(canvas);
  return {
    async sync({ id, available, canUse, shown, activityKey = "" }) {
      if (scope !== id) activity = activityKey;
      else if (activity !== activityKey) {
        activity = activityKey;
        if (activityKey && connection) {
          const idAtChange=id, version=epoch;
          clearTimeout(followTimer);
          const follow = async () => {
            if (!valid(idAtChange,version) || !visible) return;
            if (pointerDown || Date.now()-lastInteraction<1500 || root.querySelector('.browser-text-input textarea:focus')) { followTimer=setTimeout(follow,1000); return; }
            // Reattach the upstream cast after an external browser tool changes
            // its target. This preserves the remote page; it does not navigate.
            invalidate(); await refresh(true);
          };
          followTimer=setTimeout(follow,700);
        }
      }
      if (scope !== id || (allowed && !canUse) || (enabled && !available)) invalidate();
      scope = id; enabled = available; allowed = canUse; visible = shown;
      if (!enabled || !id || !canUse) {
        canvas.hidden = true; start.hidden = true; footer.hidden = true;
        show(!id ? "先说出一个问题，浏览器会跟随这段探索。" : !canUse ? "加入这段探索后，可以使用共同的工作浏览器。" : "此服务尚未连接浏览器环境；已保存的成果仍可阅读。");
        return;
      }
      if (shown) await refresh();
    },
    refresh,
    destroy() { invalidate(); scope = null; allowed = false; canvas.hidden = true; },
  };
}
