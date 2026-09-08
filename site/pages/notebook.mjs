import {
  shell,
  escapeHtml as e,
  scriptJson,
  badge,
} from "../components/html.mjs";
import { icon } from "../components/icons.mjs";
import {
  head,
  list,
  search,
  chips,
  kinds,
  choices,
} from "../components/learning.mjs";
export function renderNotebook() {
  return shell({
    title: "我的学习 · 知图",
    root: "../",
    active: "notebook",
    body: `<div class="page">${head("YOUR LEARNING NOTEBOOK", "把变化中的理解，留在这里。", "回到曾经的问题，看看现在的自己会怎样回答。完成一段探索，只是下一次理解的起点。")}<div class="section-title"><div class="filter-row"><button class="filter active" data-notes-filter="all">全部记录</button><button class="filter" data-notes-filter="due">待重访</button><button class="filter" data-notes-filter="practice">实验记录</button></div><button class="button small" data-export-notes>导出学习档案 ${icon("arrowUp")}</button></div><div class="callout">这是你的私人学习档案，保存在服务端，与此浏览器的访问凭据关联。清除 Cookie 后无法自动找回，请定期导出。这里记录作答与重访，不把阅读进度当作掌握程度。</div><div data-notes><p class="skeleton-text">正在读取你的学习记录…</p></div></div>`,
  });
}
