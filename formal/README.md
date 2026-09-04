# Lean formalization workspace

This directory is an isolated Lean 4 + Mathlib project for machine-checking
mathematical arguments.

Useful checks:

```sh
lake build
lake env lean Smoke.lean
```

Proofs intended as final results should compile without `sorry`. Use
`#print axioms theorem_name` or a configured Lean LSP `lean_verify` tool to
review their axiom dependencies.

Current case studies:

- `Formal/DemandSystem.lean`: finite families of general linear-moment demands,
  concave welfare, positive KL scaling, and existence/uniqueness.
- `Formal/EntropyUniqueness.lean`: strict convexity of density entropy and
  almost-everywhere uniqueness of the optimal density on arbitrary measurable spaces.
- `Formal/FunctionalCalibration.lean`: continuous Cauchy equations for logarithmic
  information and exponential impact, including the extra calibrations that fix their scales.
- `Formal/PossibilityAllocation.lean`: general measurable-space Gibbs uniqueness
  and the abstract compact/strict-concavity theorem.
- `POSSIBILITY_ALLOCATION.md`: the general static demand--possibility model,
  well-posedness assumptions, proof, KKT layer, and exact Lean coverage.
- `Formal/DynamicAttention.lean`: finite-horizon Bellman existence and uniqueness,
  plus the exact Gibbs policy at every unconstrained KL-control step.
- `Formal/MatcherRouting.lean`: unique finite Matcher routing, Softmax shares,
  the anti-concentration counterpoint, and the replicator derivative identity.
- `DYNAMIC_ATTENTION.md`: the belief-state model, assumptions, derivation,
  corrections to the supplied claims, and exact verification boundary.
- `Formal/SeatAllocation.lean`: the three-seat finite Gibbs model.
- `SEAT_ALLOCATION.md`: assumptions, derivation, document corrections, and
  exact verification scope for that model.
