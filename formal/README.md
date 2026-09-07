# Lean formalization workspace

This directory is an isolated Lean 4 + Mathlib project for machine-checking
mathematical arguments.

Start with [the static token-allocation problem](TOKEN_ALLOCATION_PROBLEM.md)
for the primitives, payment equivalences, unknown demand measure and allocation
mechanism. It separates the research problem from additional entropy and update
axioms. The KL model below is one conditional model, not a derivation of those
axioms from token aggregation.

Useful checks:

```sh
lake build
lake env lean Smoke.lean
lake env lean AlignmentChecks.lean
```

Proofs intended as final results should compile without `sorry`. Use
`#print axioms theorem_name` or a configured Lean LSP `lean_verify` tool to
review their axiom dependencies.

Current case studies:

- `Formal/DemandSystem.lean`: finite families of linear-moment demands with value
  regularity restricted to attainable moment images, and abstract compact existence/uniqueness.
- `Formal/EntropyUniqueness.lean`: extended KL entropy, an objective that assigns
  negative infinity to infinite entropy, and almost-everywhere uniqueness of optimal densities.
- `Formal/DensityDemandSystem.lean`: actual integral moments of bounded statistics
  on probability densities, and uniqueness with one finite-entropy feasible witness.
- `AlignmentChecks.lean`: square-root utility on a bounded interval, the
  infinite-entropy objective boundary, and axiom checks for the concrete static model.
- `Formal/FunctionalCalibration.lean`: continuous Cauchy equations for logarithmic
  information and exponential impact, including the extra calibrations that fix their scales.
- `Formal/PossibilityAllocation.lean`: general measurable-space Gibbs uniqueness
  and the abstract compact/strict-concavity theorem.
- `TOKEN_ALLOCATION_PROBLEM.md`: the static research problem, given token inputs,
  demand measurement, executable entitlements, and boundaries of additional axioms.
- `POSSIBILITY_ALLOCATION.md`: a conditional KL-regularized demand--possibility
  model, well-posedness assumptions, proof, KKT layer, and exact Lean coverage.
- `Formal/DynamicAttention.lean`: finite-horizon Bellman existence and uniqueness,
  plus the exact Gibbs policy at every unconstrained KL-control step.
- `Formal/MatcherRouting.lean`: unique finite Matcher routing, Softmax shares,
  the anti-concentration counterpoint, and the replicator derivative identity.
- `DYNAMIC_ATTENTION.md`: the belief-state model, assumptions, derivation,
  corrections to the supplied claims, and exact verification boundary.
- `Formal/SeatAllocation.lean`: the three-seat finite Gibbs model.
- `SEAT_ALLOCATION.md`: assumptions, derivation, document corrections, and
  exact verification scope for that model.
