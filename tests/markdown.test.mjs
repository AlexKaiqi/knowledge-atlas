import test from "node:test";
import assert from "node:assert/strict";
import { markdown } from "../site/assets/markdown.js";

test("imported report tables render with headers, alignment, and inline text", () => {
  const html = markdown("## 结果\n\n| 条件 | **耗时** | 结论 |\n| :--- | ---: | :---: |\n| `n = 10` | 0.25 | 一致 |\n| n = 20 | 0.50 | 待验证 |\n\n下一步");
  assert.match(html, /<h2>结果<\/h2>/);
  assert.match(html, /<table><thead><tr><th scope="col" class="markdown-align-left">条件<\/th>/);
  assert.match(html, /<th scope="col" class="markdown-align-right"><strong>耗时<\/strong><\/th>/);
  assert.match(html, /<td class="markdown-align-center">一致<\/td>/);
  assert.match(html, /<td class="markdown-align-left"><code>n = 10<\/code><\/td>/);
  assert.equal((html.match(/<tr>/g) || []).length, 3);
  assert.match(html, /<\/table><\/div><br><p>下一步<\/p>$/);
});

test("tables accept optional outer pipes, CRLF, escaped pipes, and inline-code pipes", () => {
  const html = markdown("内容 | 表达式\r\n--- | ---\r\na \\| b | `x | y`\r\n最后 | `done`");
  assert.match(html, /<td class="markdown-align-left">a \| b<\/td>/);
  assert.match(html, /<td class="markdown-align-left"><code>x \| y<\/code><\/td>/);
  assert.equal((html.match(/<td /g) || []).length, 4);
  assert.ok(!html.includes("\r"));
});

test("pipe text and malformed table separators remain readable text", () => {
  for (const input of ["a | b\n-- | ---", "a | b\n--- | --- | ---", "a | b\nordinary text"]) {
    const html = markdown(input);
    assert.ok(!html.includes("<table>"));
    assert.ok(html.includes("a | b"));
  }
});

test("fenced code keeps table syntax literal and closes an unfinished fence", () => {
  const html = markdown("```markdown\n| a | b |\n| --- | --- |\n| <script> | **text** |");
  assert.ok(!html.includes("<table>"));
  assert.ok(!html.includes("<strong>"));
  assert.match(html, /^<pre><code>\| a \| b \|\n/);
  assert.match(html, /&lt;script&gt;/);
  assert.ok(html.endsWith("</code></pre>"));
});

test("HTML, event handlers, image syntax, and executable links never create active markup", () => {
  const input = `<img src=x onerror="alert(1)">\n[run](javascript:alert(1))\n![remote](https://example.com/pixel)\n\n| <svg onload='alert(2)'> | safe |\n| --- | --- |\n| <script>alert(3)</script> | [run](data:text/html,evil) |\n| &lt;img src=x onerror=alert(4)&gt; | **<iframe src=//example.com>** |`;
  const html = markdown(input);
  assert.ok(!/<(?:img|svg|script|iframe|a)\b/i.test(html));
  assert.ok(!/<[^>]+\b(?:src|href|onerror|onload)\s*=/i.test(html));
  assert.match(html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
  assert.match(html, /&lt;svg onload=&#39;alert\(2\)&#39;&gt;/);
  assert.match(html, /&lt;script&gt;alert\(3\)&lt;\/script&gt;/);
  assert.match(html, /&amp;lt;img/);
  assert.match(html, /<strong>&lt;iframe src=\/\/example.com&gt;<\/strong>/);
  assert.ok(html.includes("[run](javascript:alert(1))"));
});

test("existing headings, quotes, lists, emphasis, and code remain supported", () => {
  assert.equal(markdown("# 标题\n> 依据\n- 条目\n**重点** 和 `code`"), '<h1>标题</h1><blockquote>依据</blockquote><p>· 条目</p><p><strong>重点</strong> 和 <code>code</code></p>');
});
