import { environmentPackage, environmentHandoff, readEnvironmentPackage } from './environment-package.js';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const e = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const time = n => new Date(n).toLocaleString('zh-CN');
const button = (action, title, primary = false) => `<button type="button" class="${primary ? 'primary' : 'secondary'}" data-env-action="${action}">${title}</button>`;
export function environmentEntry() {
  return `<section class="environment-entry"><div><p class="scene-eyebrow">实验环境 · 一起搭建</p><h2>想做什么实验？从这里搭起。</h2><p>先说清想尝试什么，再由自己、同伴或 Agent 补齐环境。已有环境也可以改成适合你的版本。</p></div><button class="primary" data-action="environment-new">新建环境</button></section><section id="environment-library" aria-live="polite"><p class="scene-empty compact">正在读取可复用的环境…</p></section>`;
}
export function createEnvironmentUI({ api, mutate, modal, close, notify, download, navigate, getScope, useEnvironment, root }) {
  let startersPromise;
  const starters = () => startersPromise ||= fetch(new URL('data/environment-starters.json', root)).then(r => { if (!r.ok) throw new Error('环境起点读取失败，请重试。'); return r.json(); }).catch(err => { startersPromise = null; throw err; });
  const scopeIs = scope => scope === getScope();
  const live = form => form.isConnected && $('#dialog').open;
  function formHandler(form, handler) {
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const submit = $('[type=submit]', form);
      if (submit.disabled) return;
      submit.disabled = true;
      $('[data-env-error]', form).textContent = '';
      try { await handler(Object.fromEntries(new FormData(form))); }
      catch (err) { if (live(form)) $('[data-env-error]', form).textContent = err.message; else notify(err.message); }
      finally { submit.disabled = false; }
    });
  }
  async function mount(host, id, version, current) {
    if (!id) {
      const { environments } = await api('/environments');
      if (!current()) return;
      host.innerHTML = `<div class="scene-section-heading"><h2>我的与大家的环境</h2><button class="subtle" data-env-action="new">新建或导入</button></div><label class="scene-search">查找环境<input type="search" placeholder="比如：数据分析、仿真" data-env-search></label><div class="scene-list" data-env-cards></div>`;
      function filter() {
        const query = $('[data-env-search]', host).value.trim().toLowerCase();
        const list = environments.filter(x => `${x.title} ${x.purpose}`.toLowerCase().includes(query));
        $('[data-env-cards]', host).innerHTML = list.length ? list.map(x => `<button class="scene-row" data-env-open="${e(x.id)}"><span><span class="scene-meta">${x.visibility === 'shared' ? '本站共享' : '私人'} · ${x.role === 'owner' ? '我创建的' : x.role ? '已参与共建' : '可参与共建'} · v${x.version}</span><h2>${e(x.title)}</h2><p>${e(x.purpose.slice(0, 150))}</p></span><span class="row-arrow">→</span></button>`).join('') : '<p class="scene-empty compact">还没有匹配的环境。可以从实验需求开始创建，逐步邀请大家完善。</p>';
      }
      filter(); $('[data-env-search]', host).oninput = filter;
      host.onclick = event => { const b = event.target.closest('button'); if (b?.dataset.envOpen) navigate(b.dataset.envOpen); if (b?.dataset.envAction === 'new') edit().catch(err => notify(err.message)); };
      return;
    }
    const data = await api(`/environments/${id}${version ? '?version=' + encodeURIComponent(version) : ''}`);
    if (!current()) return;
    const { environment: env, selected: v, versions } = data;
    const latest = env.version === v.version, editable = env.role && latest, sharedVersion = env.visibility === 'shared' && v.sharedAt != null;
    host.innerHTML = `<div class="reading-toolbar">${button('back', '← 环境与实践')}${button('use', '带到探索', true)}</div><article class="environment-detail"><p class="scene-eyebrow">${sharedVersion ? '本站共享' : '私人版本'} · v${v.version}${latest ? '' : ' · 历史版本'}</p><h1 id="scene-title" tabindex="-1">${e(env.title)}</h1><p class="environment-purpose">${e(v.purpose)}</p><p class="review-block">已保存环境定义。这里不会自动启动容器；请交给自己的 Agent 构建与检验，运行记录另行保存。</p><div class="environment-actions">${button('handoff', '交给自己的 Agent', true)}${editable ? button('edit', '编辑与导入') : ''}${!env.role && env.visibility === 'shared' ? button('join', '参与共建') : ''}${button('fork', '派生新环境')}${env.role === 'owner' && latest ? button('share', env.visibility === 'shared' ? '管理分享' : '分享当前版本') : env.role === 'owner' && env.visibility === 'shared' && !v.sharedAt ? button('share', '分享此历史版本') : ''}</div><p class="scene-meta">${e(v.name)} · ${time(v.createdAt)}${v.reason ? ' · ' + e(v.reason) : ''}</p>${env.source ? `<p class="scene-meta">派生自 <button class="text-link" data-env-source="${e(env.source.id)}" data-env-version="${env.source.version}">原环境 v${env.source.version}</button>，此环境可独立维护。</p>` : ''}<div class="scene-section-heading"><h2>环境文件</h2><span class="scene-meta">${v.files.length} 个文本文件</span></div><div class="environment-files">${v.files.map(f => `<details><summary>${e(f.path)}</summary><pre><code>${e(f.content)}</code></pre></details>`).join('')}</div><details class="environment-history"><summary>版本与修改记录（${versions.length}）</summary>${versions.map(x => `<button class="scene-row" data-env-version="${x.version}"><span><strong>v${x.version}</strong> · ${e(x.name)}<p>${e(x.reason || '创建环境')}</p><span class="scene-meta">${time(x.createdAt)}${x.sharedAt ? ' · 曾明确分享' : ' · 私人版本'}</span></span></button>`).join('')}</details></article>`;
    document.title = `${env.title} · 环境 · 知图`;
    $('#scene-title', host).focus();
    host.onclick = async event => {
      const b = event.target.closest('button');
      if (!b) return;
      if (b.dataset.envVersion) { navigate(b.dataset.envSource || id, Number(b.dataset.envVersion)); return; }
      const action = b.dataset.envAction;
      if (!action) return;
      b.disabled = true;
      try {
        if (action === 'back') await navigate();
        else if (action === 'edit') await edit(data);
        else if (action === 'fork') await edit(data, true);
        else if (action === 'handoff') await handoff(data);
        else if (action === 'share') share(data);
        else if (action === 'use') await useEnvironment(data);
        else if (action === 'join') {
          const token = getScope();
          await mutate(`/environments/${id}/join`, {});
          if (scopeIs(token)) await navigate(id, v.version, false);
          notify('已加入共建，可以编辑文件并保存新版本。');
        }
      } catch (err) { notify(err.message); }
      finally { b.disabled = false; }
    };
  }
  async function edit(data = null, fork = false) {
    let token = getScope();
    const options = await starters();
    if (!scopeIs(token)) return;
    let editing = data && !fork, env = data?.environment;
    const v = data?.selected;
    let key = `atlas-environment:${editing ? env.id : fork ? 'fork-' + env.id + '-' + v.version : 'new'}`;
    let draft;
    try { draft = JSON.parse(sessionStorage.getItem(key) || 'null'); } catch {}
    let files = draft?.files || structuredClone(v?.files || options.python.files);
    let baseVersion = draft?.baseVersion || v?.version;
    modal(`<h2>${editing ? '完善这个环境' : fork ? '派生自己的环境' : '新建实验环境'}</h2><form class="form-stack environment-editor" id="environment-form"><label>你想做什么实验？<textarea name="purpose" rows="3" maxlength="4000" required placeholder="比如：模拟抛硬币，看看次数增加后会发生什么">${e(draft?.purpose ?? v?.purpose ?? '')}</textarea></label><label>环境名称（可留空）<input name="title" maxlength="80" value="${e(draft?.title ?? (fork ? env.title + ' · 我的版本' : env?.title || ''))}"></label>${data ? '' : `<label>从哪里开始<select name="starter"><option value="python">Python 起点 · 自带可运行示例</option><option value="blank">空白起点 · 按实验需要搭建</option></select></label><p class="form-help">先描述需要就能保存。起点只是骨架，具体实验可继续交给 Agent 完善。</p>`}<details class="environment-advanced" ${editing ? 'open' : ''}><summary>文件与导入 · 可让 Agent 帮你补齐</summary><div data-env-file-editor></div><button type="button" class="secondary" data-env-add-file>添加文件</button><details class="environment-import"><summary>导入 Agent 返回的环境包</summary><label>选择 JSON 环境包<input type="file" accept=".json,application/json" data-env-import-file></label><label>或粘贴环境包<textarea rows="4" data-env-import-text placeholder="粘贴 Agent 返回的 JSON 环境包"></textarea></label><button type="button" class="secondary" data-env-import>读入并预览</button><p class="form-help">只读入文件，不执行代码。检查后再保存。</p></details></details>${editing ? '<label>这次改了什么<textarea name="reason" rows="2" maxlength="1500" required placeholder="比如：补充依赖版本和运行说明"></textarea></label>' : ''}<p class="form-help">${editing && env.visibility === 'shared' ? `将保存为共同版本；只包含本表单内容，基础版本 v${baseVersion}。` : '新环境默认私人。保存后可以单独分享，邀请大家共同维护。'} 草稿保存在此设备。</p><p role="alert" data-env-error></p><div data-env-conflict></div><button type="submit" class="primary">${editing ? '保存新版本' : '创建环境'}</button></form>`);
    const form = $('#environment-form'); token = getScope();
    if (draft?.reason && form.elements.reason) form.elements.reason.value = draft.reason;
    if (draft?.starter && form.elements.starter) form.elements.starter.value = draft.starter;
    const readFiles = () => $$('[data-env-file]', form).map(row => ({ path: $('[data-env-path]', row).value, content: $('[data-env-content]', row).value }));
    function persist() {
      try { sessionStorage.setItem(key, JSON.stringify({ ...Object.fromEntries(new FormData(form)), files: readFiles(), baseVersion })); } catch {}
    }
    function renderFiles() {
      $('[data-env-file-editor]', form).innerHTML = files.map((f, i) => `<fieldset data-env-file><legend>文件 ${i + 1}</legend><label>路径<input data-env-path maxlength="160" value="${e(f.path)}"></label><label>文件内容<textarea data-env-content rows="5" spellcheck="false">${e(f.content)}</textarea></label><button type="button" class="subtle" data-env-remove="${i}">移除此文件</button></fieldset>`).join('');
    }
    renderFiles();
    form.oninput = persist;
    $('[data-env-file-editor]', form).onclick = event => {
      const b = event.target.closest('[data-env-remove]'); if (!b) return;
      files = readFiles(); files.splice(Number(b.dataset.envRemove), 1); renderFiles(); persist();
    };
    $('[data-env-add-file]', form).onclick = () => { files = readFiles(); if (files.length >= 20) { $('[data-env-error]', form).textContent = '最多保存 20 个文本文件。'; return; } files.push({ path: '', content: '' }); renderFiles(); persist(); $('[data-env-file]:last-child input', form).focus(); };
    if (form.elements.starter) form.elements.starter.onchange = () => {
      // Selecting a starter is explicit; preserve the previous editable file set.
      const input = form.elements.starter;
      const chosen = input.value;
      files = readFiles();
      const previousFiles = files;
      files = structuredClone(options[chosen].files); renderFiles(); persist();
      const help = $('[data-env-conflict]', form);
      help.innerHTML = '<p>已换起点。<button type="button" class="text-link">恢复之前的文件</button></p>';
      $('button', help).onclick = () => { files = previousFiles; renderFiles(); persist(); help.innerHTML = ''; };
    };
    let importEpoch = 0;
    function applyImport(text) {
      const value = readEnvironmentPackage(text);
      if (editing && value.source && value.source.id !== env.id) throw new Error('环境包来自另一个环境。请派生新环境，当前文件已保留。');
      if (editing && value.source && Number.isSafeInteger(value.source.version) && value.source.version > 0) baseVersion = value.source.version;
      files = value.files; renderFiles();
      if (value.title) form.elements.title.value = value.title;
      if (value.purpose) form.elements.purpose.value = value.purpose;
      persist(); $('[data-env-error]', form).textContent = `环境包已读入，尚未保存。${editing ? '基础版本 v' + baseVersion + '；如已有共同修改，保存时先比较合并。' : ''}请检查用途与文件。`;
    }
    $('[data-env-import]', form).onclick = () => { importEpoch++; try { applyImport($('[data-env-import-text]', form).value); } catch (err) { $('[data-env-error]', form).textContent = err.message; } };
    $('[data-env-import-file]', form).onchange = async event => {
      const n = ++importEpoch, file = event.target.files[0]; if (!file) return;
      try { if (file.size > 200000) throw new Error('环境包超过 200 KB，请将数据和完整日志放到包外。'); const text = await file.text(); if (n === importEpoch && live(form)) applyImport(text); }
      catch (err) { if (n === importEpoch && live(form)) $('[data-env-error]', form).textContent = err.message; }
    };
    formHandler(form, async p => {
      const title = p.title.trim() || p.purpose.trim().slice(0, 60);
      const definition = readEnvironmentPackage({ format: 'knowledge-atlas/environment-1', title, purpose: p.purpose, files: readFiles() });
      persist();
      const submittedDraft = sessionStorage.getItem(key);
      const body = { title, purpose: definition.purpose, files: definition.files, ...(editing ? { baseVersion, reason: p.reason } : fork ? { sourceEnvironment: env.id, sourceVersion: v.version } : {}) };
      if (new TextEncoder().encode(JSON.stringify(body)).length > 47000) throw new Error('文件编码后的提交超过 48 KB，请将大段数据或日志放到包外并留下取得方式。');
      try {
        const saved = await mutate(editing ? `/environments/${env.id}/versions` : '/environments', body);
        const unchanged = sessionStorage.getItem(key) === submittedDraft;
        if (live(form) && scopeIs(token) && unchanged) { sessionStorage.removeItem(key); close(); await navigate(saved.id, saved.version); }
        else if (live(form) && scopeIs(token)) {
          // Continue edits typed during the request against the saved revision.
          sessionStorage.removeItem(key);
          env = { ...env, id: saved.id }; editing = true; baseVersion = saved.version;
          key = `atlas-environment:${saved.id}`;
          if (!form.elements.reason) { const label = document.createElement('label'); label.innerHTML = '这次改了什么<textarea name="reason" rows="2" maxlength="1500" required>继续完善环境</textarea>'; $('[type=submit]', form).before(label); }
          $('[type=submit]', form).textContent = '保存新版本'; persist();
          $('[data-env-error]', form).textContent = `v${saved.version} 已保存。刚才继续输入的修改仍在这里，可保存为下一版。`;
        }
        notify('环境定义已保存，可以继续完善或交给自己的 Agent 构建。');
      } catch (err) {
        if (err.status === 409 && editing && live(form)) {
          const latestData = await api(`/environments/${env.id}`);
          if (live(form)) {
            const target = $('[data-env-conflict]', form);
            target.innerHTML = `<details open><summary>比较最新 v${latestData.environment.version}（你的输入保留在上方）</summary><pre>${e(JSON.stringify(environmentPackage(latestData), null, 2))}</pre><button type="button" class="secondary">我已比较，改用最新版本作为基础</button></details>`;
            $('button', target).onclick = () => { baseVersion = latestData.environment.version; persist(); target.innerHTML = `<p>现在以 v${baseVersion} 为基础。请合并需要保留的修改后再保存。</p>`; };
          }
        }
        throw err;
      }
    });
  }
  function share(data) {
    const { environment: env, selected: v } = data;
    let token = getScope();
    const historical = env.version !== v.version;
    modal(`<h2>${historical ? '分享选定的历史版本' : '环境分享'}</h2><form class="form-stack" id="environment-share"><p>分享「${e(env.title)}」的 v${v.version} 文件和用途。此前私人版本、探索讨论与学习记录不包含在内。共享后，大家可加入并提交共同版本，也可派生独立环境。</p><p>已经复制出去的文件与探索快照不会因撤回分享而被收回。</p><label>谁可以看到<select name="visibility">${historical ? '' : '<option value="private">仅自己</option>'}<option value="shared">本站共享，可参与共建</option></select></label><p role="alert" data-env-error></p><button type="submit" class="primary">保存分享范围</button></form>`);
    const form = $('#environment-share'); token = getScope(); form.elements.visibility.value = env.visibility;
    formHandler(form, async p => { await mutate(`/environments/${env.id}/share`, { baseVersion: env.version, visibility: p.visibility, ...(historical ? { version: v.version } : {}) }); if (live(form) && scopeIs(token)) { close(); await navigate(env.id, v.version, false); } notify('环境分享范围已更新。'); });
  }
  async function handoff(data) {
    const token = getScope();
    const fresh = await api(`/environments/${data.environment.id}?version=${data.selected.version}`);
    if (!scopeIs(token)) return;
    const pack = environmentPackage(fresh), instructions = environmentHandoff(fresh);
    modal(`<h2>交给自己的 Agent</h2><p>复制这份需求与文件，交给 Codex、Pi 或其他已有 Agent。完成后回到“编辑与导入”，审阅并保存新版本。</p><label class="form-stack">所选 v${pack.source.version} · 仅此环境<textarea class="environment-export" rows="10" readonly>${e(instructions)}</textarea></label><div class="environment-actions">${button('copy', '复制需求与环境', true)}${button('download', '下载 JSON 环境包')}</div><p role="status" data-env-copy-status></p>`);
    const host = $('#dialog-body'), textarea = $('.environment-export', host);
    $('[data-env-action=copy]', host).onclick = async () => { try { await navigator.clipboard.writeText(instructions); if (textarea.isConnected) $('[data-env-copy-status]', host).textContent = '已复制。交给自己的 Agent 后，将返回的环境包导入此版本继续。'; } catch { if (!textarea.isConnected) return; $('.environment-export', host).focus(); $('.environment-export', host).select(); $('[data-env-copy-status]', host).textContent = '请从上方选中的文本手动复制。'; } };
    $('[data-env-action=download]', host).onclick = () => download(`environment-${pack.source.id}-v${pack.source.version}.json`, pack);
  }
  return { mount, edit };
}
