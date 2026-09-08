// Mobile input uses the upstream public Page/keyboard APIs on the connected tab.
export function attachBrowserInput(ui, root, notify, drafts = new Map(), scope = "") {
  const canvas = ui.container.getCanvas();
  if (!canvas) return () => {};
  const controller = new AbortController(), options = { signal: controller.signal };
  let alive = true, gesture = null, tail = Promise.resolve(), composing = false;
  const panel = document.createElement('details'); panel.className = 'browser-text-input';
  panel.innerHTML = `<summary>向网页输入文字</summary><p>先点击网页里的输入框，再在这里输入。</p><textarea aria-label="输入到当前网页的文字" rows="2" maxlength="8000"></textarea><div><button data-insert>输入到页面</button><button data-enter>发送回车键</button></div>`;
  root.append(panel);
  const input = panel.querySelector('textarea'), insert = panel.querySelector('[data-insert]');
  const active = () => ui.browser.getActiveTab();
  const key = () => `${scope}:${active()?.tabId || ""}:${active()?.url || ""}`;
  let draftKey = key(); input.value = drafts.get(draftKey) || "";
  input.addEventListener('input', () => drafts.set(draftKey, input.value), options);
  const unsubscribe = ui.browser.subscribeTabChange(() => {
    if (key() === draftKey) return;
    drafts.set(draftKey, input.value); draftKey=key(); input.value=drafts.get(draftKey)||"";
  });
  const enqueue = (tab, work) => {
    tail = tail.catch(() => {}).then(async () => {
      if (!alive || active()?.tabId !== tab?.tabId) return;
      await work(tab.page);
    }).catch(() => { if (alive) notify('网页连接暂时中断，输入仍保留，请重新连接后重试。'); });
    return tail;
  };
  input.addEventListener('compositionstart', () => { composing = true; }, options);
  input.addEventListener('compositionend', () => { composing = false; }, options);
  insert.onclick = async () => {
    const tab = active(), text = input.value, submittedKey = draftKey;
    if (!tab || !text || composing || insert.disabled) return;
    insert.disabled = true;
    await enqueue(tab, async page => {
      await page.keyboard.sendCharacter(text);
      if (alive && active()?.tabId === tab.tabId && draftKey === submittedKey && input.value === text) { input.value = ''; drafts.delete(submittedKey); }
    });
    if (alive) insert.disabled = false;
  };
  panel.querySelector('[data-enter]').onclick = () => { const tab = active(); if (tab) enqueue(tab, page => page.keyboard.press('Enter')); };
  const point = event => {
    const rect = canvas.getBoundingClientRect();
    return { x: (event.clientX-rect.left)*canvas.width/rect.width, y: (event.clientY-rect.top)*canvas.height/rect.height };
  };
  canvas.style.touchAction = 'none';
  canvas.addEventListener('pointerdown', event => {
    if (event.pointerType !== 'touch' || !event.isPrimary) return;
    event.preventDefault(); const p = point(event);
    gesture = { ...p, startX:p.x, startY:p.y, moved:false, tab:active(), pointer:event.pointerId };
    canvas.setPointerCapture(event.pointerId);
  }, options);
  canvas.addEventListener('pointermove', event => {
    if (!gesture || event.pointerId !== gesture.pointer) return;
    event.preventDefault(); const p = point(event), dx = gesture.x-p.x, dy = gesture.y-p.y;
    gesture.moved ||= Math.hypot(p.x-gesture.startX,p.y-gesture.startY)>8;
    if (gesture.moved) enqueue(gesture.tab, async page => { await page.mouse.move(p.x,p.y); await page.mouse.wheel({deltaX:dx,deltaY:dy}); });
    gesture.x=p.x; gesture.y=p.y;
  }, options);
  canvas.addEventListener('pointerup', event => {
    if (!gesture || event.pointerId !== gesture.pointer) return;
    event.preventDefault(); const g=gesture; gesture=null;
    if (!g.moved) enqueue(g.tab, page=>page.mouse.click(g.x,g.y));
  }, options);
  canvas.addEventListener('pointercancel', () => { gesture=null; }, options);
  return () => { drafts.set(draftKey, input.value); alive=false; unsubscribe(); controller.abort(); panel.remove(); };
}
