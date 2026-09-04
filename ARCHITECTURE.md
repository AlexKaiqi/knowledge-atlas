# Architecture

Knowledge Atlas is maintained as a project, not as hand-authored pages.

## First-class objects

### 1. Case

`content/cases/<case-id>/case.json`

A Case owns:

- the real problem and semantic goal
- visible artifacts / workspace objects
- Harness controls (interventions)
- evidence slots
- Notebook cell order
- reusable Knowledge references
- a Runtime Contract reference

A Case does **not** duplicate knowledge prose or page HTML.

Published Cases are ordered by `content/cases/index.json`. Draft Case directories may exist without being published.

### 2. Knowledge

`content/knowledge/<knowledge-id>.json`

A Knowledge object carries epistemic status and separates:

- statement
- formula (optional)
- assumptions
- does-not-imply
- engineering implications
- sources

Published Knowledge is ordered by `content/knowledge/index.json`. Draft Knowledge may exist outside the published registry.

### 3. Page

`site/pages/*.mjs`

Pages are renderers. They turn content objects into HTML. `dist/` is disposable.

The Case page is generic: artifacts, Harness controls, evidence slots, Notebook cells, quick prompts, and the runtime path are generated from the manifest.

### 4. Runtime

```text
site/runtime/
  core/                 shared Runtime Contract implementation
    agent-lab.js
  cases/                case-specific domain behavior
    tests-green-wrong.js
```

The shared runtime owns:

- Harness snapshotting
- stale-result detection
- Run lifecycle
- Run History / Replay
- generic evidence rendering
- tool permission enforcement
- sidecar Agent interaction plumbing

Each Case then separates **Environment** (truth, tools, observers, oracle) from **Agent Provider** (policy and tool selection). This is the seam that lets a deterministic teaching agent later be replaced by a real LLM without moving truth or judge authority into the model.

See [RUNTIME.md](./RUNTIME.md).

## Build graph

```text
content/cases ───────┐
                     ├── validate ──> page renderers ──> dist/
content/knowledge ───┘                     │              ├── HTML + relationship explorer
                                            │              ├── public JSON registry/context
                                            │              └── llms.txt + llms-full.txt
                                            └── runtime/core + runtime/cases
```

## Content lifecycle

```text
Backlog
  │
  ▼
scaffold draft
  │
  ├── Case manifest
  └── Case runtime
  │
  ▼
local experiment / validation
  │
  ▼
promote
  │
  ▼
published registry
  │
  ▼
GitHub Pages
```

Knowledge follows `scaffold → review → publish` independently of Cases.

## Repository invariants

1. A published Case references only published Knowledge objects.
2. A Knowledge object declares epistemic status, assumptions, and does-not-imply.
3. Formula and engineering implication are separate fields.
4. Published registries and object `status` must agree.
5. Runtime modules use an explicit contract version; unsupported versions fail validation.
6. Artifact ids, Harness ids, and Evidence ids are unique within a Case.
7. A published Case contains the core Notebook cells: Case, Harness, Execution, Verification, Knowledge.
8. A changed Harness never retroactively re-evaluates an old Run; the result becomes stale until replayed.
9. Agent Providers choose tools but cannot bypass Environment tool permissions.
10. `dist/` is never the source of truth.
11. Atlas pages are generated from registries; do not manually add content cards to HTML.

## Extension rule

Adding a new problem should normally change only:

```text
content/cases/<id>/case.json
site/runtime/cases/<id>.js
```

Adding a new theory/model/heuristic should normally change only:

```text
content/knowledge/<id>.json
```

Core UI code should change only when the **platform capability** changes, not when content grows.
