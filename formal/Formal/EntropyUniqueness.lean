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
open scoped ENNReal

namespace PossibilityAllocation

open InformationTheory

/-- Extended entropy. For probability densities over a probability reference measure this is KL,
including the value `∞`. The nonnegative integrand is `q * log q + 1 - q`. -/
noncomputable def densityEntropy
    {α : Type*} [MeasurableSpace α] (μ : Measure α) (q : α → ℝ) : ℝ≥0∞ :=
  ∫⁻ x, ENNReal.ofReal (klFun (q x)) ∂μ

/-- Real-valued auxiliary used only after proving finite entropy. An unguarded real integral
would assign zero to a nonintegrable integrand and must not define the full optimization problem. -/
noncomputable def finiteDensityEntropy
    {α : Type*} [MeasurableSpace α] (μ : Measure α) (q : α → ℝ) : ℝ :=
  ∫ x, klFun (q x) ∂μ

theorem densityEntropy_ne_top_iff
    {α : Type*} [MeasurableSpace α] {μ : Measure α} {q : α → ℝ}
    (hqMeas : Measurable q) (hqNonneg : 0 ≤ᵐ[μ] q) :
    densityEntropy μ q ≠ ∞ ↔ Integrable (fun x ↦ klFun (q x)) μ := by
  exact lintegral_ofReal_ne_top_iff_integrable
    (measurable_klFun.comp hqMeas).aestronglyMeasurable
    (hqNonneg.mono fun _ hx ↦ klFun_nonneg hx)

/-- Conversion to a real number is used with an explicit finiteness hypothesis. -/
theorem finiteDensityEntropy_eq_toReal
    {α : Type*} [MeasurableSpace α] {μ : Measure α} {q : α → ℝ}
    (hqNonneg : 0 ≤ᵐ[μ] q) (hqEnt : Integrable (fun x ↦ klFun (q x)) μ) :
    finiteDensityEntropy μ q = (densityEntropy μ q).toReal := by
  exact integral_eq_lintegral_of_nonneg_ae
    (hqNonneg.mono fun _ hx ↦ klFun_nonneg hx) hqEnt.aestronglyMeasurable

/-- The measure induced by a nonnegative real density relative to `μ`. Negative values, which are
excluded in the allocation model, are truncated to zero by `ENNReal.ofReal`. -/
noncomputable def densityMeasure
    {α : Type*} [MeasurableSpace α] (μ : Measure α) (q : α → ℝ) : Measure α :=
  μ.withDensity (fun x ↦ ENNReal.ofReal (q x))

/-- A measurable representative of a probability density in `L¹(μ)`. -/
structure IsProbabilityDensity
    {α : Type*} [MeasurableSpace α] (μ : Measure α) (q : α → ℝ) : Prop where
  measurable : Measurable q
  integrable : Integrable q μ
  nonneg : 0 ≤ᵐ[μ] q
  mass : ∫ x, q x ∂μ = 1

def probabilityDensities
    {α : Type*} [MeasurableSpace α] (μ : Measure α) : Set (α → ℝ) :=
  {q | IsProbabilityDensity μ q}

theorem convex_probabilityDensities
    {α : Type*} [MeasurableSpace α] (μ : Measure α) :
    Convex ℝ (probabilityDensities μ) := by
  intro q hq r hr a b ha hb hab
  refine ⟨?_, ?_, ?_, ?_⟩
  · exact (hq.measurable.const_smul a).add (hr.measurable.const_smul b)
  · exact (hq.integrable.const_mul a).add (hr.integrable.const_mul b)
  · filter_upwards [hq.nonneg, hr.nonneg] with x hxq hxr
    exact add_nonneg (mul_nonneg ha hxq) (mul_nonneg hb hxr)
  · change (∫ x, a * q x + b * r x ∂μ) = 1
    rw [integral_add (hq.integrable.const_mul a) (hr.integrable.const_mul b),
      integral_const_mul, integral_const_mul, hq.mass, hr.mass]
    simpa using hab

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

/-- Equality to Mathlib's KL retains infinite values; no `toReal` conversion is involved. -/
theorem densityEntropy_eq_klDiv
    {α : Type*} [MeasurableSpace α] (μ : Measure α) [IsProbabilityMeasure μ]
    {q : α → ℝ} (hqMeas : Measurable q) (hqInt : Integrable q μ)
    (hqNonneg : 0 ≤ᵐ[μ] q) :
    densityEntropy μ q = klDiv (densityMeasure μ q) μ := by
  change densityEntropy μ q =
    klDiv (μ.withDensity (fun x ↦ ENNReal.ofReal (q x))) μ
  let _ : IsFiniteMeasure
      (μ.withDensity (fun x ↦ ENNReal.ofReal (q x))) :=
    isFiniteMeasure_withDensity_ofReal hqInt.2
  rw [klDiv_eq_lintegral_klFun_of_ac
    (withDensity_absolutelyContinuous μ (fun x ↦ ENNReal.ofReal (q x)))]
  unfold densityEntropy
  apply lintegral_congr_ae
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

/-- The full objective takes values in `ℝ ∪ {-∞}`. Infinite entropy gives `⊥`; it is never
converted to a zero penalty. The allocation model uses this definition with `ρ > 0`. -/
noncomputable def densityObjective
    {α : Type*} [MeasurableSpace α] (μ : Measure α)
    (welfare : (α → ℝ) → ℝ) (ρ : ℝ) (q : α → ℝ) : WithBot ℝ :=
  if densityEntropy μ q = ∞ then ⊥ else
    ↑(welfare q - ρ * finiteDensityEntropy μ q)

theorem densityObjective_of_infinite
    {α : Type*} [MeasurableSpace α] (μ : Measure α)
    (welfare : (α → ℝ) → ℝ) (ρ : ℝ) {q : α → ℝ}
    (hq : densityEntropy μ q = ∞) : densityObjective μ welfare ρ q = ⊥ := by
  simp [densityObjective, hq]

theorem densityObjective_of_integrable
    {α : Type*} [MeasurableSpace α] (μ : Measure α)
    (welfare : (α → ℝ) → ℝ) (ρ : ℝ) {q : α → ℝ}
    (hqMeas : Measurable q) (hqNonneg : 0 ≤ᵐ[μ] q)
    (hqEnt : Integrable (fun x ↦ klFun (q x)) μ) :
    densityObjective μ welfare ρ q = ↑(welfare q - ρ * finiteDensityEntropy μ q) := by
  simp [densityObjective, (densityEntropy_ne_top_iff hqMeas hqNonneg).mpr hqEnt]

/-- The extended objective is exactly welfare minus KL, with the infinite case preserved. -/
theorem densityObjective_eq_klDiv
    {α : Type*} [MeasurableSpace α] (μ : Measure α) [IsProbabilityMeasure μ]
    (welfare : (α → ℝ) → ℝ) (ρ : ℝ) {q : α → ℝ}
    (hq : IsProbabilityDensity μ q) :
    densityObjective μ welfare ρ q =
      if klDiv (densityMeasure μ q) μ = ∞ then ⊥ else
        (↑(welfare q - ρ * (klDiv (densityMeasure μ q) μ).toReal) : WithBot ℝ) := by
  rw [← densityEntropy_eq_klDiv μ hq.measurable hq.integrable hq.nonneg]
  by_cases h : densityEntropy μ q = ∞
  · simp [densityObjective, h]
  · simp [densityObjective, h, finiteDensityEntropy_eq_toReal hq.nonneg
      ((densityEntropy_ne_top_iff hq.measurable hq.nonneg).mp h)]

/-- A finite-entropy feasible point rules out an infinite-entropy maximizer. -/
theorem finite_entropy_of_density_maximizer
    {α : Type*} [MeasurableSpace α] {μ : Measure α}
    (feasible : (α → ℝ) → Prop) (welfare : (α → ℝ) → ℝ) (ρ : ℝ)
    {q bar : α → ℝ} (hbarFeas : feasible bar) (hbarEnt : densityEntropy μ bar ≠ ∞)
    (hqMax : ∀ s, feasible s → densityObjective μ welfare ρ s ≤ densityObjective μ welfare ρ q) :
    densityEntropy μ q ≠ ∞ := by
  intro hqInf
  have h := hqMax bar hbarFeas
  simp [densityObjective, hbarEnt, hqInf] at h

/-- Finite entropy is preserved by a positive convex mixture. -/
theorem integrable_klFun_mix
    {α : Type*} [MeasurableSpace α] {μ : Measure α}
    {q r : α → ℝ} (hqMeas : Measurable q) (hrMeas : Measurable r)
    (hq : 0 ≤ᵐ[μ] q) (hr : 0 ≤ᵐ[μ] r)
    {a b : ℝ} (ha : 0 < a) (hb : 0 < b) (hab : a + b = 1)
    (hqInt : Integrable (fun x ↦ klFun (q x)) μ)
    (hrInt : Integrable (fun x ↦ klFun (r x)) μ) :
    Integrable (fun x ↦ klFun (a * q x + b * r x)) μ := by
  have hmixMeas : Measurable (fun x ↦ klFun (a * q x + b * r x)) := by
    apply measurable_klFun.comp
    fun_prop
  apply Integrable.mono' ((hqInt.const_mul a).add (hrInt.const_mul b))
    hmixMeas.aestronglyMeasurable
  filter_upwards [hq, hr] with x hxq hxr
  have hmixNonneg : 0 ≤ a * q x + b * r x :=
    add_nonneg (mul_nonneg ha.le hxq) (mul_nonneg hb.le hxr)
  rw [Real.norm_eq_abs, abs_of_nonneg (klFun_nonneg hmixNonneg)]
  simpa [smul_eq_mul] using
    strictConvexOn_klFun.convexOn.2 hxq hxr ha.le hb.le hab

/-- Entropy is strictly convex between distinct nonnegative finite-entropy densities. Distinctness
is modulo almost-everywhere equality, so the result applies on the natural quotient `L¹(μ)`. -/
theorem finiteDensityEntropy_strict_mix
    {α : Type*} [MeasurableSpace α] {μ : Measure α}
    {q r : α → ℝ} (hqMeas : Measurable q) (hrMeas : Measurable r)
    (hq : 0 ≤ᵐ[μ] q) (hr : 0 ≤ᵐ[μ] r) (hqr : ¬ q =ᵐ[μ] r)
    {a b : ℝ} (ha : 0 < a) (hb : 0 < b) (hab : a + b = 1)
    (hqInt : Integrable (fun x ↦ klFun (q x)) μ)
    (hrInt : Integrable (fun x ↦ klFun (r x)) μ) :
    finiteDensityEntropy μ (fun x ↦ a * q x + b * r x) <
      a * finiteDensityEntropy μ q + b * finiteDensityEntropy μ r := by
  have hmixInt : Integrable (fun x ↦ klFun (a * q x + b * r x)) μ := by
    exact integrable_klFun_mix hqMeas hrMeas hq hr ha hb hab hqInt hrInt
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
  unfold finiteDensityEntropy
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
      finiteDensityEntropy μ (halfMix q r) <
        (1 / 2 : ℝ) * finiteDensityEntropy μ q +
          (1 / 2 : ℝ) * finiteDensityEntropy μ r := by
    change finiteDensityEntropy μ (fun x ↦
      (1 / 2 : ℝ) * q x + (1 / 2 : ℝ) * r x) < _
    exact finiteDensityEntropy_strict_mix hqMeas hrMeas hqNonneg hrNonneg hqr
      (a := 1 / 2) (b := 1 / 2) (by norm_num) (by norm_num) (by norm_num) hqEnt hrEnt
  have hmidMeas : Measurable (halfMix q r) := by unfold halfMix; fun_prop
  have hmidNonneg : 0 ≤ᵐ[μ] halfMix q r := by
    filter_upwards [hqNonneg, hrNonneg] with x hxq hxr
    exact add_nonneg (mul_nonneg (by norm_num) hxq) (mul_nonneg (by norm_num) hxr)
  have hmidEnt : Integrable (fun x ↦ klFun (halfMix q r x)) μ :=
    integrable_klFun_mix hqMeas hrMeas hqNonneg hrNonneg
      (by norm_num : (0 : ℝ) < 1 / 2) (by norm_num) (by norm_num) hqEnt hrEnt
  have hqObj := densityObjective_of_integrable μ welfare ρ hqMeas hqNonneg hqEnt
  have hrObj := densityObjective_of_integrable μ welfare ρ hrMeas hrNonneg hrEnt
  have hmidObj := densityObjective_of_integrable μ welfare ρ hmidMeas hmidNonneg hmidEnt
  have hqrMax := hqMax r hrFeas
  have hrqMax := hrMax q hqFeas
  have hmidMax := hqMax _ hmidFeas
  rw [hqObj, hrObj, WithBot.coe_le_coe] at hqrMax hrqMax
  rw [hqObj, hmidObj, WithBot.coe_le_coe] at hmidMax
  nlinarith

/-- Uniqueness on the full feasible domain, which may contain infinite-entropy densities.
Finite entropy of the maximizers is derived from one finite feasible point. -/
theorem ae_eq_of_two_density_maximizers_of_finite_feasible
    {α : Type*} [MeasurableSpace α] {μ : Measure α}
    (feasible : (α → ℝ) → Prop) (welfare : (α → ℝ) → ℝ) (ρ : ℝ)
    (hρ : 0 < ρ)
    (hFeas : ∀ s, feasible s → Measurable s ∧ 0 ≤ᵐ[μ] s)
    {bar q r : α → ℝ}
    (hbarFeas : feasible bar) (hbarEnt : densityEntropy μ bar ≠ ∞)
    (hqFeas : feasible q) (hrFeas : feasible r)
    (hmidFeas : feasible (halfMix q r))
    (hWelfareConcave :
      (1 / 2 : ℝ) * welfare q + (1 / 2 : ℝ) * welfare r ≤ welfare (halfMix q r))
    (hqMax : ∀ s, feasible s → densityObjective μ welfare ρ s ≤ densityObjective μ welfare ρ q)
    (hrMax : ∀ s, feasible s → densityObjective μ welfare ρ s ≤ densityObjective μ welfare ρ r) :
    q =ᵐ[μ] r := by
  obtain ⟨hqMeas, hqNonneg⟩ := hFeas q hqFeas
  obtain ⟨hrMeas, hrNonneg⟩ := hFeas r hrFeas
  have hqEnt := (densityEntropy_ne_top_iff hqMeas hqNonneg).mp
    (finite_entropy_of_density_maximizer feasible welfare ρ hbarFeas hbarEnt hqMax)
  have hrEnt := (densityEntropy_ne_top_iff hrMeas hrNonneg).mp
    (finite_entropy_of_density_maximizer feasible welfare ρ hbarFeas hbarEnt hrMax)
  exact ae_eq_of_two_density_maximizers feasible welfare ρ hρ
    hqMeas hrMeas hqNonneg hrNonneg hqEnt hrEnt hqFeas hrFeas hmidFeas
    hWelfareConcave hqMax hrMax

namespace DemandSystem

variable {I α : Type*} [Fintype I] [MeasurableSpace α]

/-- The abstract linear-moment demand model with concavity only on attainable moment images.
Infinite-entropy feasible points are allowed; only one finite feasible witness is required. -/
theorem ae_eq_of_two_regularized_density_maximizers
    (system : DemandSystem I (α → ℝ)) {μ : Measure α}
    {K : Set (α → ℝ)} {ρ : ℝ}
    (hK : Convex ℝ K) (hρ : 0 < ρ)
    (hValueConcave : ∀ i, ConcaveOn ℝ (system.moment i '' K) (system.value i))
    (hFeas : ∀ s ∈ K, Measurable s ∧ 0 ≤ᵐ[μ] s)
    {bar q r : α → ℝ}
    (hbarFeas : bar ∈ K) (hbarEnt : densityEntropy μ bar ≠ ∞)
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
  apply ae_eq_of_two_density_maximizers_of_finite_feasible
    (fun s ↦ s ∈ K) system.welfare ρ hρ
    hFeas hbarFeas hbarEnt hqFeas hrFeas
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
