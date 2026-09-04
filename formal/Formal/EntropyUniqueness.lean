import Formal.DemandSystem
import Mathlib.InformationTheory.KullbackLeibler.Basic
import Mathlib.MeasureTheory.Measure.Decomposition.RadonNikodym
import Mathlib.Tactic

set_option linter.style.header false

/-!
# Strict entropy convexity for probability densities

This file supplies the density-level step behind uniqueness in the general static allocation
problem. It does not assume that the state space is finite or discrete. Two density functions are
identified when they agree almost everywhere, which is exactly the equality relevant to the
probability measures that they induce.
-/

open Real MeasureTheory Set

namespace PossibilityAllocation

open InformationTheory

/-- The entropy integrand representation of KL for a density relative to a reference measure. For
probability densities over a probability measure, the affine terms in `klFun` integrate to zero,
leaving the usual integral of `q * log q`. -/
noncomputable def densityEntropy
    {α : Type*} [MeasurableSpace α] (μ : Measure α) (q : α → ℝ) : ℝ :=
  ∫ x, klFun (q x) ∂μ

/-- The measure induced by a nonnegative real density relative to `μ`. Negative values, which are
excluded in the allocation model, are truncated to zero by `ENNReal.ofReal`. -/
noncomputable def densityMeasure
    {α : Type*} [MeasurableSpace α] (μ : Measure α) (q : α → ℝ) : Measure α :=
  μ.withDensity (fun x ↦ ENNReal.ofReal (q x))

/-- A nonnegative integrable density of total mass one induces a probability measure. -/
theorem densityMeasure_isProbability
    {α : Type*} [MeasurableSpace α] (μ : Measure α) [IsProbabilityMeasure μ]
    {q : α → ℝ} (hqInt : Integrable q μ) (hqNonneg : 0 ≤ᵐ[μ] q)
    (hqMass : ∫ x, q x ∂μ = 1) :
    IsProbabilityMeasure (densityMeasure μ q) := by
  refine ⟨?_⟩
  rw [densityMeasure, withDensity_apply _ MeasurableSet.univ,
    Measure.restrict_univ, ← ofReal_integral_eq_lintegral_ofReal hqInt hqNonneg, hqMass]
  norm_num

/-- The density entropy used below is exactly Mathlib's KL divergence from the induced measure to
the reference probability measure. -/
theorem densityEntropy_eq_klDiv
    {α : Type*} [MeasurableSpace α] (μ : Measure α) [IsProbabilityMeasure μ]
    {q : α → ℝ} (hqMeas : Measurable q) (hqInt : Integrable q μ)
    (hqNonneg : 0 ≤ᵐ[μ] q) :
    densityEntropy μ q = (klDiv (densityMeasure μ q) μ).toReal := by
  change densityEntropy μ q =
    (klDiv (μ.withDensity (fun x ↦ ENNReal.ofReal (q x))) μ).toReal
  let _ : IsFiniteMeasure
      (μ.withDensity (fun x ↦ ENNReal.ofReal (q x))) :=
    isFiniteMeasure_withDensity_ofReal hqInt.2
  rw [toReal_klDiv_eq_integral_klFun
    (withDensity_absolutelyContinuous μ (fun x ↦ ENNReal.ofReal (q x)))]
  unfold densityEntropy
  apply integral_congr_ae
  have hRn := Measure.rnDeriv_withDensity μ hqMeas.ennreal_ofReal
  filter_upwards [hRn, hqNonneg] with x hx hqx
  rw [hx, ENNReal.toReal_ofReal hqx]

/-- Almost-everywhere equal densities induce the same measure. -/
theorem densityMeasure_eq_of_ae_eq
    {α : Type*} [MeasurableSpace α] (μ : Measure α) {q r : α → ℝ}
    (hqr : q =ᵐ[μ] r) :
    densityMeasure μ q = densityMeasure μ r := by
  unfold densityMeasure
  exact withDensity_congr_ae (hqr.fun_comp ENNReal.ofReal)

/-- The midpoint of two density functions. -/
noncomputable def halfMix {α : Type*} (q r : α → ℝ) : α → ℝ :=
  fun x ↦ (1 / 2 : ℝ) * q x + (1 / 2 : ℝ) * r x

/-- Welfare minus a positive multiple of density entropy. -/
noncomputable def densityObjective
    {α : Type*} [MeasurableSpace α] (μ : Measure α)
    (welfare : (α → ℝ) → ℝ) (ρ : ℝ) (q : α → ℝ) : ℝ :=
  welfare q - ρ * densityEntropy μ q

/-- Entropy is strictly convex between distinct nonnegative finite-entropy densities. Distinctness
is modulo almost-everywhere equality, so the result applies on the natural quotient `L¹(μ)`. -/
theorem densityEntropy_strict_mix
    {α : Type*} [MeasurableSpace α] {μ : Measure α}
    {q r : α → ℝ} (hqMeas : Measurable q) (hrMeas : Measurable r)
    (hq : 0 ≤ᵐ[μ] q) (hr : 0 ≤ᵐ[μ] r) (hqr : ¬ q =ᵐ[μ] r)
    {a b : ℝ} (ha : 0 < a) (hb : 0 < b) (hab : a + b = 1)
    (hqInt : Integrable (fun x ↦ klFun (q x)) μ)
    (hrInt : Integrable (fun x ↦ klFun (r x)) μ) :
    densityEntropy μ (fun x ↦ a * q x + b * r x) <
      a * densityEntropy μ q + b * densityEntropy μ r := by
  have hmixMeas : Measurable (fun x ↦ klFun (a * q x + b * r x)) := by
    apply measurable_klFun.comp
    fun_prop
  have hmixInt : Integrable (fun x ↦ klFun (a * q x + b * r x)) μ := by
    apply Integrable.mono' ((hqInt.const_mul a).add (hrInt.const_mul b))
      hmixMeas.aestronglyMeasurable
    filter_upwards [hq, hr] with x hxq hxr
    have hmixNonneg : 0 ≤ a * q x + b * r x :=
      add_nonneg (mul_nonneg ha.le hxq) (mul_nonneg hb.le hxr)
    rw [Real.norm_eq_abs, abs_of_nonneg (klFun_nonneg hmixNonneg)]
    simpa [smul_eq_mul] using
      strictConvexOn_klFun.convexOn.2 hxq hxr ha.le hb.le hab
  let d := fun x ↦ a * klFun (q x) + b * klFun (r x) -
    klFun (a * q x + b * r x)
  have hdNonneg : 0 ≤ᵐ[μ] d := by
    filter_upwards [hq, hr] with x hxq hxr
    apply sub_nonneg.mpr
    simpa [smul_eq_mul] using
      strictConvexOn_klFun.convexOn.2 hxq hxr ha.le hb.le hab
  have hdInt : Integrable d μ := by
    exact ((hqInt.const_mul a).add (hrInt.const_mul b)).sub hmixInt
  have hdNotZero : ¬ d =ᵐ[μ] 0 := by
    intro hdZero
    apply hqr
    filter_upwards [hq, hr, hdZero] with x hxq hxr hdx
    by_contra hne
    have hlt : klFun (a * q x + b * r x) <
        a * klFun (q x) + b * klFun (r x) := by
      simpa [smul_eq_mul] using
        strictConvexOn_klFun.2 hxq hxr hne ha hb hab
    exact (ne_of_gt (sub_pos.mpr hlt)) hdx
  have hdIntegralNe : (∫ x, d x ∂μ) ≠ 0 := by
    intro hzero
    apply hdNotZero
    exact (integral_eq_zero_iff_of_nonneg_ae hdNonneg hdInt).mp hzero
  have hdIntegralPos : 0 < ∫ x, d x ∂μ :=
    lt_of_le_of_ne (integral_nonneg_of_ae hdNonneg) (Ne.symm hdIntegralNe)
  have hdIntegral :
      (∫ x, d x ∂μ) =
        a * (∫ x, klFun (q x) ∂μ) + b * (∫ x, klFun (r x) ∂μ) -
          ∫ x, klFun (a * q x + b * r x) ∂μ := by
    calc
      _ = (∫ x, a * klFun (q x) + b * klFun (r x) ∂μ) -
          ∫ x, klFun (a * q x + b * r x) ∂μ :=
        integral_sub ((hqInt.const_mul a).add (hrInt.const_mul b)) hmixInt
      _ = ((∫ x, a * klFun (q x) ∂μ) + ∫ x, b * klFun (r x) ∂μ) -
          ∫ x, klFun (a * q x + b * r x) ∂μ := by
        rw [integral_add (hqInt.const_mul a) (hrInt.const_mul b)]
      _ = _ := by rw [integral_const_mul, integral_const_mul]
  unfold densityEntropy
  rw [hdIntegral] at hdIntegralPos
  linarith

/-- If two feasible densities both maximize concave welfare minus positive entropy resistance, then
they agree almost everywhere. Only midpoint feasibility and midpoint concavity are needed for this
uniqueness step; topological assumptions are needed separately to prove existence. -/
theorem ae_eq_of_two_density_maximizers
    {α : Type*} [MeasurableSpace α] {μ : Measure α}
    (feasible : (α → ℝ) → Prop) (welfare : (α → ℝ) → ℝ) (ρ : ℝ)
    (hρ : 0 < ρ) {q r : α → ℝ}
    (hqMeas : Measurable q) (hrMeas : Measurable r)
    (hqNonneg : 0 ≤ᵐ[μ] q) (hrNonneg : 0 ≤ᵐ[μ] r)
    (hqEnt : Integrable (fun x ↦ klFun (q x)) μ)
    (hrEnt : Integrable (fun x ↦ klFun (r x)) μ)
    (hqFeas : feasible q) (hrFeas : feasible r)
    (hmidFeas : feasible (halfMix q r))
    (hWelfareConcave :
      (1 / 2 : ℝ) * welfare q + (1 / 2 : ℝ) * welfare r ≤ welfare (halfMix q r))
    (hqMax : ∀ s, feasible s →
      densityObjective μ welfare ρ s ≤ densityObjective μ welfare ρ q)
    (hrMax : ∀ s, feasible s →
      densityObjective μ welfare ρ s ≤ densityObjective μ welfare ρ r) :
    q =ᵐ[μ] r := by
  by_contra hqr
  have hEntropyStrict :
      densityEntropy μ (halfMix q r) <
        (1 / 2 : ℝ) * densityEntropy μ q + (1 / 2 : ℝ) * densityEntropy μ r := by
    change densityEntropy μ (fun x ↦
      (1 / 2 : ℝ) * q x + (1 / 2 : ℝ) * r x) < _
    exact densityEntropy_strict_mix hqMeas hrMeas hqNonneg hrNonneg hqr
      (a := 1 / 2) (b := 1 / 2) (by norm_num) (by norm_num) (by norm_num) hqEnt hrEnt
  have hObjEq :
      densityObjective μ welfare ρ q = densityObjective μ welfare ρ r := by
    apply le_antisymm
    · exact hrMax q hqFeas
    · exact hqMax r hrFeas
  have hMidBetter :
      densityObjective μ welfare ρ q <
        densityObjective μ welfare ρ (halfMix q r) := by
    unfold densityObjective at hObjEq ⊢
    nlinarith
  exact (not_lt_of_ge (hqMax _ hmidFeas)) hMidBetter

namespace DemandSystem

variable {I α : Type*} [Fintype I] [MeasurableSpace α]

/-- Exact uniqueness theorem for the generalized demand model on densities: finitely many concave
values of linear moments, a convex feasible set, positive KL weight, and finite entropy imply that
any two maximizing densities agree almost everywhere. -/
theorem ae_eq_of_two_regularized_density_maximizers
    (system : DemandSystem I (α → ℝ)) {μ : Measure α}
    {K : Set (α → ℝ)} {ρ : ℝ}
    (hK : Convex ℝ K) (hρ : 0 < ρ)
    (hValueConcave : ∀ i, ConcaveOn ℝ Set.univ (system.value i))
    {q r : α → ℝ}
    (hqMeas : Measurable q) (hrMeas : Measurable r)
    (hqNonneg : 0 ≤ᵐ[μ] q) (hrNonneg : 0 ≤ᵐ[μ] r)
    (hqEnt : Integrable (fun x ↦ klFun (q x)) μ)
    (hrEnt : Integrable (fun x ↦ klFun (r x)) μ)
    (hqFeas : q ∈ K) (hrFeas : r ∈ K)
    (hqMax : ∀ s ∈ K,
      densityObjective μ system.welfare ρ s ≤
        densityObjective μ system.welfare ρ q)
    (hrMax : ∀ s ∈ K,
      densityObjective μ system.welfare ρ s ≤
        densityObjective μ system.welfare ρ r) :
    q =ᵐ[μ] r := by
  have hmixEq :
      (1 / 2 : ℝ) • q + (1 / 2 : ℝ) • r = halfMix q r := by
    funext x
    change (1 / 2 : ℝ) • q x + (1 / 2 : ℝ) • r x =
      (1 / 2 : ℝ) * q x + (1 / 2 : ℝ) * r x
    simp [smul_eq_mul]
  apply ae_eq_of_two_density_maximizers
    (fun s ↦ s ∈ K) system.welfare ρ hρ
    hqMeas hrMeas hqNonneg hrNonneg hqEnt hrEnt hqFeas hrFeas
  · rw [← hmixEq]
    exact hK hqFeas hrFeas (by norm_num) (by norm_num) (by norm_num)
  · have hW := system.welfare_concaveOn hK hValueConcave
    have hmid := hW.2 hqFeas hrFeas
      (by norm_num : (0 : ℝ) ≤ 1 / 2)
      (by norm_num : (0 : ℝ) ≤ 1 / 2)
      (by norm_num : (1 / 2 : ℝ) + 1 / 2 = 1)
    rw [← hmixEq]
    simpa [smul_eq_mul] using hmid
  · exact fun s hs ↦ hqMax s hs
  · exact fun s hs ↦ hrMax s hs

end DemandSystem

end PossibilityAllocation
