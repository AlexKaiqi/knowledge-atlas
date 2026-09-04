import Formal.PossibilityAllocation

set_option linter.style.header false

/-!
# Finite families of general demands

The decision space `E` is arbitrary; it can represent densities or probability measures once the
appropriate vector-space model is chosen. Each demand observes a linear moment of the decision and
assigns a concave value to that moment.
-/

open Set

namespace PossibilityAllocation

/-- A finite family of demands represented by linear moment maps and scalar value functions. -/
structure DemandSystem (I E : Type*) [Fintype I] [AddCommMonoid E] [Module ℝ E] where
  moment : I → E →ₗ[ℝ] ℝ
  value : I → ℝ → ℝ

namespace DemandSystem

variable {I E : Type*} [Fintype I] [AddCommMonoid E] [Module ℝ E]

/-- Aggregate value of all demand moments. -/
noncomputable def welfare (system : DemandSystem I E) (x : E) : ℝ :=
  ∑ i, system.value i (system.moment i x)

/-- Aggregate demand value minus a positive multiple of the resistance term. -/
noncomputable def regularizedObjective (system : DemandSystem I E)
    (resistance : E → ℝ) (ρ : ℝ) (x : E) : ℝ :=
  system.welfare x - ρ * resistance x

/-- A finite sum of concave values of linear moments is concave on every convex feasible set. -/
theorem welfare_concaveOn (system : DemandSystem I E) {K : Set E}
    (hK : Convex ℝ K)
    (hValue : ∀ i, ConcaveOn ℝ Set.univ (system.value i)) :
    ConcaveOn ℝ K system.welfare := by
  classical
  refine ⟨hK, ?_⟩
  intro x hx y hy a b ha hb hab
  simp only [welfare]
  rw [Finset.smul_sum, Finset.smul_sum, ← Finset.sum_add_distrib]
  apply Finset.sum_le_sum
  intro i hi
  simpa using (hValue i).2 (Set.mem_univ _) (Set.mem_univ _) ha hb hab

/-- Continuous moments and continuous values produce continuous aggregate welfare. -/
theorem welfare_continuous [TopologicalSpace E] (system : DemandSystem I E)
    (hMoment : ∀ i, Continuous (system.moment i))
    (hValue : ∀ i, Continuous (system.value i)) :
    Continuous system.welfare := by
  classical
  apply continuous_finsetSum
  intro i hi
  exact (hValue i).comp (hMoment i)

/-- Multiplication by a positive KL coefficient preserves strict convexity. -/
theorem positive_scale_strictConvexOn {K : Set E} {resistance : E → ℝ}
    {ρ : ℝ} (hρ : 0 < ρ) (hR : StrictConvexOn ℝ K resistance) :
    StrictConvexOn ℝ K (fun x ↦ ρ * resistance x) := by
  refine ⟨hR.1, ?_⟩
  intro x hx y hy hxy a b ha hb hab
  have h := hR.2 hx hy hxy ha hb hab
  have hscaled := mul_lt_mul_of_pos_left h hρ
  simpa only [smul_eq_mul, mul_add, mul_assoc, mul_left_comm, mul_comm] using hscaled

/-- General existence and uniqueness for finitely many concave demands. Upper semicontinuity is
stated directly so that lower-semicontinuous KL resistance in weak topologies can be used. -/
theorem existsUnique_regularized_solution [TopologicalSpace E]
    (system : DemandSystem I E) {K : Set E} {resistance : E → ℝ} {ρ : ℝ}
    (hKne : K.Nonempty) (hKcompact : IsCompact K)
    (hObjectiveUsc : UpperSemicontinuousOn
      (system.regularizedObjective resistance ρ) K)
    (hValueConcave : ∀ i, ConcaveOn ℝ Set.univ (system.value i))
    (hResistanceStrict : StrictConvexOn ℝ K resistance)
    (hρ : 0 < ρ) :
    ∃! x : E,
      x ∈ K ∧ IsMaxOn (system.regularizedObjective resistance ρ) K x := by
  let problem : StaticProblem E :=
    { feasible := K
      welfare := system.welfare
      resistance := fun x ↦ ρ * resistance x }
  have hWelfareConcave : ConcaveOn ℝ K system.welfare :=
    system.welfare_concaveOn hResistanceStrict.1 hValueConcave
  have hScaledStrict : StrictConvexOn ℝ K (fun x ↦ ρ * resistance x) :=
    positive_scale_strictConvexOn hρ hResistanceStrict
  exact problem.existsUnique_solution hKne hKcompact hObjectiveUsc
    hWelfareConcave hScaledStrict

/-- Continuous welfare and lower-semicontinuous resistance make the regularized objective upper
semicontinuous. This is the natural direction for KL in a weak topology. -/
theorem regularizedObjective_upperSemicontinuousOn [TopologicalSpace E]
    (system : DemandSystem I E) {K : Set E} {resistance : E → ℝ} {ρ : ℝ}
    (hMoment : ∀ i, Continuous (system.moment i))
    (hValue : ∀ i, Continuous (system.value i))
    (hResistance : LowerSemicontinuousOn resistance K)
    (hρ : 0 < ρ) :
    UpperSemicontinuousOn (system.regularizedObjective resistance ρ) K := by
  have hW : UpperSemicontinuousOn system.welfare K :=
    (system.welfare_continuous hMoment hValue).continuousOn.upperSemicontinuousOn
  have hScaleContinuous : Continuous (fun t : ℝ ↦ ρ * t) :=
    continuous_const.mul continuous_id
  have hScaleMonotone : Monotone (fun t : ℝ ↦ ρ * t) := by
    intro x y hxy
    exact mul_le_mul_of_nonneg_left hxy hρ.le
  have hScaledLsc : LowerSemicontinuousOn (fun x ↦ ρ * resistance x) K := by
    simpa [Function.comp_def] using
      hScaleContinuous.comp_lowerSemicontinuousOn hResistance hScaleMonotone
  have hNeg : UpperSemicontinuousOn (-(fun x ↦ ρ * resistance x)) K :=
    hScaledLsc.neg
  change UpperSemicontinuousOn
    (fun x ↦ system.welfare x - ρ * resistance x) K
  rw [show (fun x ↦ system.welfare x - ρ * resistance x) =
      fun x ↦ system.welfare x + (-(fun y ↦ ρ * resistance y)) x by
    funext x
    rw [sub_eq_add_neg]
    rfl]
  exact hW.add hNeg

/-- The standard existence-and-uniqueness package for general demands with a
lower-semicontinuous resistance term. -/
theorem existsUnique_regularized_solution_of_lowerSemicontinuous
    [TopologicalSpace E]
    (system : DemandSystem I E) {K : Set E} {resistance : E → ℝ} {ρ : ℝ}
    (hKne : K.Nonempty) (hKcompact : IsCompact K)
    (hMomentCont : ∀ i, Continuous (system.moment i))
    (hValueCont : ∀ i, Continuous (system.value i))
    (hValueConcave : ∀ i, ConcaveOn ℝ Set.univ (system.value i))
    (hResistanceLsc : LowerSemicontinuousOn resistance K)
    (hResistanceStrict : StrictConvexOn ℝ K resistance)
    (hρ : 0 < ρ) :
    ∃! x : E,
      x ∈ K ∧ IsMaxOn (system.regularizedObjective resistance ρ) K x := by
  apply system.existsUnique_regularized_solution hKne hKcompact
  · exact system.regularizedObjective_upperSemicontinuousOn
      hMomentCont hValueCont hResistanceLsc hρ
  · exact hValueConcave
  · exact hResistanceStrict
  · exact hρ

/-- A familiar stronger sufficient package: every component of the regularized objective is
continuous. -/
theorem existsUnique_regularized_solution_of_continuous [TopologicalSpace E]
    (system : DemandSystem I E) {K : Set E} {resistance : E → ℝ} {ρ : ℝ}
    (hKne : K.Nonempty) (hKcompact : IsCompact K)
    (hMomentCont : ∀ i, Continuous (system.moment i))
    (hValueCont : ∀ i, Continuous (system.value i))
    (hValueConcave : ∀ i, ConcaveOn ℝ Set.univ (system.value i))
    (hResistanceCont : Continuous resistance)
    (hResistanceStrict : StrictConvexOn ℝ K resistance)
    (hρ : 0 < ρ) :
    ∃! x : E,
      x ∈ K ∧ IsMaxOn (system.regularizedObjective resistance ρ) K x := by
  exact system.existsUnique_regularized_solution_of_lowerSemicontinuous
    hKne hKcompact hMomentCont hValueCont hValueConcave
    hResistanceCont.continuousOn.lowerSemicontinuousOn hResistanceStrict hρ

end DemandSystem

end PossibilityAllocation
