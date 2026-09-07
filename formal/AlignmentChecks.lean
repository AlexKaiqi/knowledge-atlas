import Formal.DensityDemandSystem
import Mathlib.Analysis.Convex.SpecificFunctions.Pow

set_option linter.style.header false

/-! Regression checks for the static model's value domain and infinite-entropy boundary. -/

open MeasureTheory Set PossibilityAllocation
open scoped ENNReal

namespace AlignmentChecks

/-- Square-root utility on `[0, 1]` is supported without a globally concave extension. -/
noncomputable def sqrtDemand : DemandSystem Unit ℝ where
  moment := fun _ ↦ LinearMap.id
  value := fun _ ↦ Real.sqrt

example : ConcaveOn ℝ (Icc 0 1) sqrtDemand.welfare := by
  apply sqrtDemand.welfare_concaveOn (convex_Icc _ _)
  intro i
  simpa [sqrtDemand] using
    Real.strictConcaveOn_sqrt.concaveOn.subset (Icc_subset_Ici_self) (convex_Icc 0 1)

example : ContinuousOn sqrtDemand.welfare (Icc 0 1) := by
  apply sqrtDemand.welfare_continuousOn
  · intro i
    exact continuous_id.continuousOn
  · intro i
    exact Real.continuous_sqrt.continuousOn

/-- Every finite-entropy point strictly beats an infinite-entropy point, regardless of the
finite welfare values. In particular an infinite penalty cannot collapse to zero. -/
example {α : Type*} [MeasurableSpace α] (μ : Measure α)
    (welfare : (α → ℝ) → ℝ) (ρ : ℝ) (q r : α → ℝ)
    (hq : densityEntropy μ q = ∞) (hr : densityEntropy μ r ≠ ∞) :
    densityObjective μ welfare ρ q < densityObjective μ welfare ρ r := by
  simp only [densityObjective, hq, hr, ite_true, ite_false]
  exact WithBot.bot_lt_coe _

end AlignmentChecks

#print axioms PossibilityAllocation.densityEntropy_eq_klDiv
#print axioms PossibilityAllocation.densityObjective_eq_klDiv
#print axioms PossibilityAllocation.finite_entropy_of_density_maximizer
#print axioms PossibilityAllocation.DensityDemandSystem.optimal_densities_ae_eq
