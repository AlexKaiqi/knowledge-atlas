# Runtime Contract v1

A Knowledge Atlas Case is an executable experiment, not a bespoke page script.

The runtime is split into three responsibilities:

```text
Generic Notebook UI
        │
        ▼
Runtime Contract v1
        │
        ├── Case Environment
        │     ├─ hidden truth / state
        │     ├─ tools + permissions
        │     ├─ observers / oracle
        │     └─ evidence projection
        │
        └── Agent Provider
              ├─ scripted policy (today)
              └─ real LLM policy (later)
```

The critical boundary is: **the Agent Provider chooses actions; the Environment decides what actions are allowed and what is true.**

## Files

A published Case points to a runtime entry:

```json
{
  "runtime": {
    "module": "cases/tests-green-wrong",
    "provider": "scripted",
    "contractVersion": 1
  }
}
```

Typical implementation:

```text
site/runtime/
  core/
    agent-lab.js          notebook lifecycle / replay / chat plumbing
    tool-case.js          Environment + Provider composition
  cases/
    tests-green-wrong.js        browser entry
    tests-green-wrong-model.js  Environment + scripted Provider
```

## Browser entry

The browser entry should stay tiny:

```js
import { mountCaseLab } from '../core/agent-lab.js';
import { createToolCaseAdapter } from '../core/tool-case.js';
import { environment, scriptedProvider } from './my-case-model.js';

mountCaseLab(root, createToolCaseAdapter({
  environment,
  provider: scriptedProvider
}));
```

Case-specific DOM manipulation does not belong here.

## Case Environment

The Environment owns domain semantics.

It provides:

- `createInitialState()`
- `tools`
- `view(context)`

A tool may declare:

- `description`
- `readOnly`
- `available({ harness, state })`
- `describe(args)`
- `execute({ args, harness, state, manifest })`

Tool execution returns an optional structure:

```js
{
  patch: { /* state changes */ },
  result: { /* value returned to Agent */ },
  events: [
    { kind: 'ok', text: 'observable output' }
  ]
}
```

The shared runtime enforces `available(...)`. A Provider cannot bypass a locked tool simply because it asks to call it.

This matters because Harness controls are not decorative UI toggles; they change the **Agent's action space**.

## Agent Provider

A Provider owns policy, not truth.

It may provide:

- `mode`
- `intro`
- `preview(context)` — predicted strategy shown before Run
- `run(context)` — choose and call tools
- `respond(context)` — sidecar conversation

`run(context)` receives:

- `harness`
- `availableTools`
- `callTool(name, args)`
- `getState()`
- `chat(text, meta)`

The current Provider is deterministic so the teaching experiment is reproducible.

A future LLM Provider should see the same tool catalog and use the same `callTool` boundary.

## Notebook lifecycle

`agent-lab.js` owns the experiment lifecycle independently of Case semantics.

### Frozen Harness

A Run freezes the Harness configuration at start.

If the user changes a control after execution, the result becomes:

```text
STALE — HARNESS CHANGED · RERUN
```

We never retroactively apply a new oracle to an old trajectory.

### Run History

Every completed Run records:

- run id
- Harness snapshot
- strategy label
- Harness verdict
- semantic reality verdict
- teaching confidence

### Replay

Replay restores the old Harness snapshot and executes the same Case again.

This makes the central experimental question observable:

```text
intervention
   ↓
Agent action space / policy
   ↓
trajectory
   ↓
observable evidence
```

## Evidence boundary

Evidence slots are declared in the Case manifest. The Environment supplies their state.

The generic UI does not know whether an evidence source is a database probe, Git diff, latency metric, filesystem checksum, or external API observer.

## Real Agent integration

A real deployment should preserve the same conceptual boundary:

```text
Browser Notebook
     │
     │ case + harness + prompt
     ▼
Server-side Agent Provider
     ├─ LLM
     ├─ isolated executor
     └─ tool-call protocol
            │
            ▼
Case Environment / sandbox
     ├─ editable resources
     ├─ protected resources
     ├─ external observers
     └─ read-only oracle
            │
            ▼
observable event stream
```

Do not put model API keys or privileged sandbox credentials into GitHub Pages JavaScript.
