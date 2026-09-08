const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ],
  );

// Keep this renderer deliberately small: source HTML and links remain text.
function inline(text) {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}

function tableCells(line) {
  const cells = [];
  let cell = "", codeTicks = 0, separators = 0;
  for (let index = 0; index < line.length; index++) {
    const character = line[index];
    if (character === "\\" && /[\\|]/.test(line[index + 1] || "")) {
      cell += line[++index];
    } else if (character === "`") {
      let ticks = 1;
      while (line[index + ticks] === "`") ticks++;
      if (!codeTicks) codeTicks = ticks;
      else if (codeTicks === ticks) codeTicks = 0;
      cell += "`".repeat(ticks);
      index += ticks - 1;
    } else if (character === "|" && !codeTicks) {
      cells.push(cell.trim());
      cell = "";
      separators++;
    } else {
      cell += character;
    }
  }
  if (!separators) return null;
  cells.push(cell.trim());
  if (cells[0] === "") cells.shift();
  if (cells.at(-1) === "") cells.pop();
  return cells;
}

function tableHeader(line, separator) {
  const cells = tableCells(line), rules = tableCells(separator || "");
  if (
    !cells?.length || rules?.length !== cells.length ||
    !rules.every((rule) => /^:?-{3,}:?$/.test(rule))
  ) return null;
  return {
    cells,
    align: rules.map((rule) =>
      rule.endsWith(":") ? (rule.startsWith(":") ? "center" : "right") : "left",
    ),
  };
}

function tableRow(cells, align, heading = false) {
  const tag = heading ? "th" : "td";
  return `<tr>${align.map((alignment, index) =>
    `<${tag}${heading ? ' scope="col"' : ""} class="markdown-align-${alignment}">${inline(cells[index] || "")}</${tag}>`,
  ).join("")}</tr>`;
}

export function markdown(text) {
  const lines = String(text ?? "").replace(/\r\n?/g, "\n").split("\n");
  const output = [];
  let code = false;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (line.startsWith("```")) {
      code = !code;
      output.push(code ? "<pre><code>" : "</code></pre>");
      continue;
    }
    if (code) {
      output.push(escapeHtml(line) + "\n");
      continue;
    }
    const header = tableHeader(line, lines[index + 1]);
    if (header) {
      const rows = [];
      index++;
      while (index + 1 < lines.length) {
        const cells = tableCells(lines[index + 1]);
        if (!cells?.length) break;
        rows.push(tableRow(cells, header.align));
        index++;
      }
      output.push(`<div class="markdown-table-scroll" tabindex="0" role="region" aria-label="数据表格"><table><thead>${tableRow(header.cells, header.align, true)}</thead><tbody>${rows.join("")}</tbody></table></div>`);
      continue;
    }
    const value = inline(line), heading = value.match(/^(#{1,3}) (.*)$/);
    if (heading)
      output.push(`<h${heading[1].length}>${heading[2]}</h${heading[1].length}>`);
    else if (value.startsWith("&gt; "))
      output.push(`<blockquote>${value.slice(5)}</blockquote>`);
    else if (/^[-*] /.test(value)) output.push(`<p>· ${value.slice(2)}</p>`);
    else output.push(value ? `<p>${value}</p>` : "<br>");
  }
  if (code) output.push("</code></pre>");
  return output.join("");
}
