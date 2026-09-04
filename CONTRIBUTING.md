# Contributing

Knowledge Atlas accepts two primary contribution types: **Executable Cases** and **Knowledge objects**.

## Add an Executable Case

Start with:

```bash
npm run scaffold:case -- <case-id>
```

A Case is ready for review only when:

1. It starts from an observable engineering problem, not from a theory name.
2. `semanticGoal` can be checked outside the Agent's own narrative.
3. At least one Harness control is a meaningful intervention on the Agent's strategy space.
4. Evidence slots distinguish measurement sources instead of repeating the same oracle.
5. Changing Harness and re-running can plausibly produce a different trajectory.
6. The Case runtime uses `Runtime Contract v1`; it does not reimplement the whole page.
7. Knowledge references are reused rather than copied into Case prose.
8. `npm run check` passes.

Promote only after review:

```bash
npm run promote:case -- <case-id>
```

## Add a Knowledge object

Start with:

```bash
npm run scaffold:knowledge -- <knowledge-id>
```

Before publishing:

1. Choose the epistemic type conservatively.
2. State the claim separately from engineering interpretation.
3. Declare assumptions.
4. Declare at least one `doesNotImply` boundary.
5. Prefer primary / authoritative sources where available.
6. Do not add decorative equations that do no inferential work.
7. `npm run check` passes.

Then:

```bash
npm run publish:knowledge -- <knowledge-id>
```

## Platform changes

Changes under `site/runtime/core`, `site/pages`, or `scripts` are platform changes. They should solve a capability needed by multiple Cases; do not add Case-specific branches to shared runtime code.
