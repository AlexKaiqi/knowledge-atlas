# Knowledge Atlas

A problem-driven, executable knowledge project for Agent and systems engineering.

The product unit is an **Executable Case**: the user gives an Agent a task, changes Harness constraints, re-runs the same task, and inspects whether the trajectory and observable evidence change.

## Project layers

- **Cases** — expandable executable problem set
- **Knowledge** — reusable theorem / model / heuristic / policy objects
- **Pages** — generated HTML views
- **Runtime** — shared Agent Lab engine + Case Environment + pluggable Agent Provider

## Run locally

Requires Node.js 20+.

```bash
npm run check   # validate + runtime tests + build
npm run serve
```

Open <http://localhost:8080>.

The generated site includes:

- `/explore/` — searchable Case ↔ Knowledge relationship map
- `/data/registry.json` — public object and relation registry
- `/data/agent-context.json` — complete structured context for an Agent Provider
- `/llms.txt` and `/llms-full.txt` — Agent-readable discovery and corpus files

## Common maintenance commands

Create a draft Case:

```bash
npm run scaffold:case -- my-case
```

Create a draft Knowledge object:

```bash
npm run scaffold:knowledge -- my-concept
```

When reviewed:

```bash
npm run promote:case -- my-case
npm run publish:knowledge -- my-concept
npm run check
```

Draft objects are validated but are not rendered into the public Atlas until promoted/published.

## Source of truth

```text
content/
  cases/                 executable case manifests
  knowledge/             reusable knowledge objects
  planned-cases.json     problem backlog
schemas/                  content contracts
site/
  pages/                 generated-page renderers
  components/
  runtime/
    core/                 Runtime Contract implementation
    cases/                case-specific behavior
  assets/
scripts/
  validate.mjs
  build.mjs
  scaffold-*.mjs
  promote-case.mjs
  publish-knowledge.mjs
dist/                     generated GitHub Pages artifact
```

Do not hand-edit `dist/`.

## Case workflow

`Problem → Agent trajectory → Observation → Mechanism → Knowledge → Intervention → Re-run → Verification`

The crucial rule is **Re-run**: changing the Harness invalidates the previous experimental result. A new control condition must produce a new Agent trajectory before conclusions are drawn.

## Knowledge workflow

Each Knowledge object must say what kind of claim it is and where the claim stops being valid. Formal statements, assumptions, engineering implications, and non-implications are separate fields.

See:

- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [RUNTIME.md](./RUNTIME.md)
- [AGENT_INTEGRATION.md](./AGENT_INTEGRATION.md)
- [CONTRIBUTING.md](./CONTRIBUTING.md)
