export function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function badge(type) {
  return `<span class="epi epi-${escapeHtml(type.toLowerCase().replaceAll('_','-'))}">${escapeHtml(type.replaceAll('_', ' '))}</span>`;
}

export function shell({title = 'Knowledge Atlas', body, root = './', active = ''}) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="description" content="Knowledge Atlas — 从真实问题出发，探索 Agent 与系统工程知识。" />
  <meta name="theme-color" content="#f2efe5" />
  <title>${escapeHtml(title)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&amp;family=Manrope:wght@400;500;600&amp;family=Noto+Serif+SC:wght@500;600;700&amp;display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="${root}assets/styles.css" />
  <link rel="stylesheet" href="${root}assets/field-atlas.css" />
</head>
<body data-page="${escapeHtml(active || 'home')}">
<header class="site-header">
  <a class="brand" href="${root}index.html"><span class="brand-mark">KA</span><span><strong>Knowledge Atlas</strong><small>Systems field notes · 01</small></span></a>
  <nav aria-label="主导航">
    <a class="${active==='explore'?'active':''}" ${active==='explore'?'aria-current="page"':''} href="${root}explore/index.html">地图</a>
    <a class="${active==='problems'?'active':''}" ${active==='problems'?'aria-current="page"':''} href="${root}index.html">问题</a>
    <a class="${active==='knowledge'?'active':''}" ${active==='knowledge'?'aria-current="page"':''} href="${root}knowledge/index.html">知识</a>
    <a class="${active==='method'?'active':''}" ${active==='method'?'aria-current="page"':''} href="${root}method/index.html">方法</a>
  </nav>
  <a class="repo-link" href="https://github.com/AlexKaiqi/knowledge-atlas" target="_blank" rel="noreferrer">SOURCE ↗</a>
</header>
<main>${body}</main>
<footer class="site-footer"><div><strong>Knowledge Atlas</strong><span>Problem → Evidence → Knowledge → Intervention</span></div><div><a href="${root}method/index.html">内容方法</a><a href="https://github.com/AlexKaiqi/knowledge-atlas" target="_blank" rel="noreferrer">GitHub ↗</a></div></footer>
</body>
</html>`;
}
