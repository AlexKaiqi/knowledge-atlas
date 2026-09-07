import Formal.EntropyUniqueness
import Mathlib.MeasureTheory.Integral.Bochner.ContinuousLinearMap

set_option linter.style.header false

/-!
# The static demand model with actual integral moments

Bounded measurable statistics act on integrable probability densities. Integral moments are affine
on this domain; no linearity of the totalized integral on all functions is assumed. The objective
includes infinite-entropy feasible points, and value concavity is needed only on attainable moments.
-/

open MeasureTheory Set
open scoped ENNReal

namespace PossibilityAllocation

/-- A finite family of essentially bounded statistics and real-valued utilities. Values outside
the attainable moment images are arbitrary and carry no regularity requirements. -/
structure DensityDemandSystem (I α : Type*) [Fintype I] [MeasurableSpace α]
    (μ : Measure α) where
  satisfaction : I → α → ℝ
  bounded : ∀ i, MemLp (satisfaction i) ∞ μ
  value : I → ℝ → ℝ

namespace DensityDemandSystem

variable {I α : Type*} [Fintype I] [MeasurableSpace α] {μ : Measure α}

noncomputable def moment (system : DensityDemandSystem I α μ) (i : I) (q : α → ℝ) : ℝ :=
  ∫ x, system.satisfaction i x * q x ∂μ

noncomputable def welfare (system : DensityDemandSystem I α μ) (q : α → ℝ) : ℝ :=
  ∑ i, system.value i (system.moment i q)

theorem integrable_moment (system : DensityDemandSystem I α μ) (i : I)
    {q : α → ℝ} (hq : Integrable q μ) :
    Integrable (fun x ↦ system.satisfaction i x * q x) μ :=
  hq.mul_of_top_right (system.bounded i)

/-- The concrete moment is the expectation under the probability measure induced by the density. -/
theorem moment_eq_integral_densityMeasure (system : DensityDemandSystem I α μ) (i : I)
    {q : α → ℝ} (hq : IsProbabilityDensity μ q) :
    system.moment i q = ∫ x, system.satisfaction i x ∂(densityMeasure μ q) := by
  rw [densityMeasure, integral_withDensity_eq_integral_toReal_smul
    hq.measurable.ennreal_ofReal (Filter.Eventually.of_forall fun _ ↦ ENNReal.ofReal_lt_top)]
  apply integral_congr_ae
  filter_upwards [hq.nonneg] with x hx
  simp only [ENNReal.toReal_ofReal hx, smul_eq_mul]
  exact mul_comm _ _

/-- Integral moments respect mixtures on the actual `L¹` domain. -/
theorem moment_mix (system : DensityDemandSystem I α μ) (i : I)
    {q r : α → ℝ} (hq : Integrable q μ) (hr : Integrable r μ) (a b : ℝ) :
    system.moment i (a • q + b • r) = a * system.moment i q + b * system.moment i r := by
  have hqInt := system.integrable_moment i hq
  have hrInt := system.integrable_moment i hr
  unfold moment
  calc
    _ = ∫ x, a * (system.satisfaction i x * q x) +
        b * (system.satisfaction i x * r x) ∂μ := by
      apply integral_congr_ae
      filter_upwards [] with x
      simp only [Pi.add_apply, Pi.smul_apply, smul_eq_mul]
      ring
    _ = _ := by
      rw [integral_add (hqInt.const_mul a) (hrInt.const_mul b),
        integral_const_mul, integral_const_mul]

/-- Changing a density on a null set does not change its moments or welfare. -/
theorem moment_congr_ae (system : DensityDemandSystem I α μ) (i : I)
    {q r : α → ℝ} (hqr : q =ᵐ[μ] r) : system.moment i q = system.moment i r := by
  apply integral_congr_ae
  filter_upwards [hqr] with x hx
  rw [hx]

theorem welfare_congr_ae (system : DensityDemandSystem I α μ)
    {q r : α → ℝ} (hqr : q =ᵐ[μ] r) : system.welfare q = system.welfare r := by
  unfold welfare
  apply Finset.sum_congr rfl
  intro i hi
  rw [system.moment_congr_ae i hqr]

theorem welfare_concaveOn (system : DensityDemandSystem I α μ) {K : Set (α → ℝ)}
    (hK : Convex ℝ K) (hInt : ∀ q ∈ K, Integrable q μ)
    (hValue : ∀ i, ConcaveOn ℝ (system.moment i '' K) (system.value i)) :
    ConcaveOn ℝ K system.welfare := by
  classical
  refine ⟨hK, ?_⟩
  intro q hq r hr a b ha hb hab
  simp only [welfare]
  rw [Finset.smul_sum, Finset.smul_sum, ← Finset.sum_add_distrib]
  apply Finset.sum_le_sum
  intro i hi
  rw [system.moment_mix i (hInt q hq) (hInt r hr)]
  exact (hValue i).2 ⟨q, hq, rfl⟩ ⟨r, hr, rfl⟩ ha hb hab

/-- Uniqueness for the concrete primal problem. The entire feasible set consists of probability
densities; only one feasible point is assumed to have finite entropy. -/
theorem optimal_densities_ae_eq (system : DensityDemandSystem I α μ)
    [IsProbabilityMeasure μ] {K : Set (α → ℝ)} {ρ : ℝ}
    (hK : Convex ℝ K) (hDens : K ⊆ probabilityDensities μ) (hρ : 0 < ρ)
    (hValue : ∀ i, ConcaveOn ℝ (system.moment i '' K) (system.value i))
    {bar q r : α → ℝ} (hbar : bar ∈ K) (hbarEnt : densityEntropy μ bar ≠ ∞)
    (hq : q ∈ K) (hr : r ∈ K)
    (hqMax : ∀ s ∈ K,
      densityObjective μ system.welfare ρ s ≤ densityObjective μ system.welfare ρ q)
    (hrMax : ∀ s ∈ K,
      densityObjective μ system.welfare ρ s ≤ densityObjective μ system.welfare ρ r) :
    q =ᵐ[μ] r := by
  have hmixEq : (1 / 2 : ℝ) • q + (1 / 2 : ℝ) • r = halfMix q r := rfl
  apply ae_eq_of_two_density_maximizers_of_finite_feasible
    (fun s ↦ s ∈ K) system.welfare ρ hρ
    (fun s hs ↦ ⟨(hDens hs).measurable, (hDens hs).nonneg⟩)
    hbar hbarEnt hq hr
  · rw [← hmixEq]
    exact hK hq hr (by norm_num) (by norm_num) (by norm_num)
  · have hW := system.welfare_concaveOn hK (fun s hs ↦ (hDens hs).integrable) hValue
    have hmid := hW.2 hq hr
      (by norm_num : (0 : ℝ) ≤ 1 / 2) (by norm_num : (0 : ℝ) ≤ 1 / 2)
      (by norm_num : (1 / 2 : ℝ) + 1 / 2 = 1)
    rw [← hmixEq]
    simpa only [smul_eq_mul] using hmid
  · exact hqMax
  · exact hrMax

end DensityDemandSystem

end PossibilityAllocation
