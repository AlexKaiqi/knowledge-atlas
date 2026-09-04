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
  <meta name="description" content="Knowledge Atlas — problem-driven executable cases for agent engineering." />
  <meta name="theme-color" content="#081018" />
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="${root}assets/styles.css" />
</head>
<body>
<header class="site-header">
  <a class="brand" href="${root}index.html"><span class="brand-mark">KA</span><span><strong>Knowledge Atlas</strong><small>Problems → Agent → Evidence → Theory</small></span></a>
  <nav>
    <a class="${active==='explore'?'active':''}" href="${root}explore/index.html">Explore</a>
    <a class="${active==='problems'?'active':''}" href="${root}index.html">Problems</a>
    <a class="${active==='knowledge'?'active':''}" href="${root}knowledge/index.html">Knowledge</a>
    <a class="${active==='method'?'active':''}" href="${root}method/index.html">Method</a>
  </nav>
  <a class="repo-link" href="https://github.com/AlexKaiqi/knowledge-atlas" target="_blank" rel="noreferrer">GitHub ↗</a>
</header>
<main>${body}</main>
<footer class="site-footer"><div><strong>Knowledge Atlas</strong><span>Problem-driven · executable · evidence-aware</span></div><div><a href="${root}method/index.html">Content invariants</a><a href="https://github.com/AlexKaiqi/knowledge-atlas" target="_blank" rel="noreferrer">Open source ↗</a></div></footer>
</body>
</html>`;
}
