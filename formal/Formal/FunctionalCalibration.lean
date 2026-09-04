import Mathlib.Analysis.SpecialFunctions.Log.Basic
import Mathlib.Topology.Instances.RealVectorSpace
import Mathlib.Tactic

set_option linter.style.header false

/-!
# Continuous information and impact scales

Continuity eliminates pathological solutions of the two Cauchy-type functional equations used in
the allocation model. It leaves one free scale parameter. A value at one nonzero point is therefore
needed to select a unique logarithm or exponential from the resulting family.
-/

namespace PossibilityAllocation

private theorem continuous_additive_linear
    (f : ℝ → ℝ)
    (hf : Continuous f)
    (hadd : ∀ x y : ℝ, f (x + y) = f x + f y) :
    ∀ x : ℝ, f x = x * f 1 := by
  have hzero : f 0 = 0 := by
    have h : f 0 = f 0 + f 0 := by simpa using hadd 0 0
    linarith
  let F : ℝ →+ ℝ :=
    { toFun := f
      map_zero' := hzero
      map_add' := hadd }
  intro x
  simpa [F, smul_eq_mul] using map_real_smul F hf x (1 : ℝ)

private theorem continuous_nonnegative_additive_linear
    (f : ℝ → ℝ)
    (hf : ContinuousOn f (Set.Ici 0))
    (hadd : ∀ x y : ℝ, 0 ≤ x → 0 ≤ y → f (x + y) = f x + f y) :
    ∀ x : ℝ, 0 ≤ x → f x = x * f 1 := by
  have hzero : f 0 = 0 := by
    have h : f 0 = f 0 + f 0 := by simpa using hadd 0 0 le_rfl le_rfl
    linarith
  let g : ℝ → ℝ := fun x ↦ if 0 ≤ x then f x else -f (-x)
  have hg_cont : Continuous g := by
    dsimp [g]
    apply continuous_if_le continuous_const continuous_id
    · exact hf
    · apply ContinuousOn.neg
      apply hf.comp (Continuous.continuousOn continuous_id.neg)
      intro x hx
      change 0 ≤ -x
      change x ≤ 0 at hx
      linarith
    · intro x hx
      change 0 = x at hx
      subst x
      simp [hzero]
  have hg_add : ∀ x y : ℝ, g (x + y) = g x + g y := by
    intro x y
    by_cases hx : 0 ≤ x
    · by_cases hy : 0 ≤ y
      · have hxy : 0 ≤ x + y := add_nonneg hx hy
        simp only [g, hx, hy, hxy, ↓reduceIte]
        exact hadd x y hx hy
      · by_cases hxy : 0 ≤ x + y
        · simp only [g, hx, hy, hxy, ↓reduceIte]
          have h := hadd (x + y) (-y) hxy (by linarith)
          rw [show x + y + -y = x by ring] at h
          linarith
        · simp only [g, hx, hy, hxy, ↓reduceIte]
          have h := hadd (-(x + y)) x (by linarith) hx
          rw [show -(x + y) + x = -y by ring] at h
          linarith
    · by_cases hy : 0 ≤ y
      · by_cases hxy : 0 ≤ x + y
        · simp only [g, hx, hy, hxy, ↓reduceIte]
          have h := hadd (x + y) (-x) hxy (by linarith)
          rw [show x + y + -x = y by ring] at h
          linarith
        · simp only [g, hx, hy, hxy, ↓reduceIte]
          have h := hadd (-(x + y)) y (by linarith) hy
          rw [show -(x + y) + y = -x by ring] at h
          linarith
      · have hxy : ¬ 0 ≤ x + y := by linarith
        simp only [g, hx, hy, hxy, ↓reduceIte]
        have h := hadd (-x) (-y) (by linarith) (by linarith)
        rw [show -x + -y = -(x + y) by ring] at h
        linarith
  have hg_linear : ∀ x : ℝ, g x = x * g 1 := by
    have hgzero : g 0 = 0 := by simp [g, hzero]
    let G : ℝ →+ ℝ :=
      { toFun := g
        map_zero' := hgzero
        map_add' := hg_add }
    intro x
    simpa [G, smul_eq_mul] using map_real_smul G hg_cont x (1 : ℝ)
  intro x hx
  have h := hg_linear x
  simp only [g, hx, show (0 : ℝ) ≤ 1 by norm_num, ↓reduceIte] at h
  exact h

/-- A continuous information function that is additive under independent conjunction is a scalar
multiple of negative logarithmic information on its exact probability domain `(0, 1]`. -/
theorem probability_information_is_logarithmic
    (u : ℝ → ℝ)
    (huCont : ContinuousOn u (Set.Ioc 0 1))
    (huMul :
      ∀ p q : ℝ, p ∈ Set.Ioc 0 1 → q ∈ Set.Ioc 0 1 →
        u (p * q) = u p + u q) :
    ∃ c : ℝ, ∀ p : ℝ, p ∈ Set.Ioc 0 1 →
      u p = -c * Real.log p := by
  let f : ℝ → ℝ := fun x ↦ u (Real.exp (-x))
  have hfCont : ContinuousOn f (Set.Ici 0) := by
    apply huCont.comp (Real.continuous_exp.comp continuous_id.neg).continuousOn
    intro x hx
    exact ⟨Real.exp_pos _, (Real.exp_le_one_iff).2 (neg_nonpos.mpr hx)⟩
  have hfAdd : ∀ x y : ℝ, 0 ≤ x → 0 ≤ y → f (x + y) = f x + f y := by
    intro x y hx hy
    dsimp [f]
    rw [neg_add, Real.exp_add]
    apply huMul
    · exact ⟨Real.exp_pos _, (Real.exp_le_one_iff).2 (neg_nonpos.mpr hx)⟩
    · exact ⟨Real.exp_pos _, (Real.exp_le_one_iff).2 (neg_nonpos.mpr hy)⟩
  have hfLinear := continuous_nonnegative_additive_linear f hfCont hfAdd
  refine ⟨u (Real.exp (-1)), ?_⟩
  intro p hp
  have hlog : 0 ≤ -Real.log p := neg_nonneg.mpr (Real.log_nonpos hp.1.le hp.2)
  have h := hfLinear (-Real.log p) hlog
  dsimp [f] at h
  rw [neg_neg, Real.exp_log hp.1] at h
  simpa [mul_comm] using h

/-- Strict decrease fixes the sign of the still-free logarithmic scale: information about a less
likely event is larger, so the coefficient of `-log` is positive. -/
theorem probability_information_has_positive_log_scale
    (u : ℝ → ℝ)
    (huCont : ContinuousOn u (Set.Ioc 0 1))
    (huMul :
      ∀ p q : ℝ, p ∈ Set.Ioc 0 1 → q ∈ Set.Ioc 0 1 →
        u (p * q) = u p + u q)
    (huStrictAnti : StrictAntiOn u (Set.Ioc 0 1)) :
    ∃ c : ℝ, 0 < c ∧ ∀ p : ℝ, p ∈ Set.Ioc 0 1 →
      u p = -c * Real.log p := by
  obtain ⟨c, hc⟩ := probability_information_is_logarithmic u huCont huMul
  have hone : (1 : ℝ) ∈ Set.Ioc 0 1 := by constructor <;> norm_num
  have huOne : u 1 = 0 := by
    have h := huMul 1 1 hone hone
    norm_num at h
    linarith
  have he : Real.exp (-1) ∈ Set.Ioc (0 : ℝ) 1 := by
    constructor
    · exact Real.exp_pos _
    · exact (Real.exp_le_one_iff).2 (by norm_num)
  have helt : Real.exp (-1) < (1 : ℝ) :=
    (Real.exp_lt_one_iff).2 (by norm_num)
  have hanti : u 1 < u (Real.exp (-1)) :=
    huStrictAnti he hone helt
  have hce := hc (Real.exp (-1)) he
  have hcPos : 0 < c := by
    rw [huOne] at hanti
    rw [Real.log_exp] at hce
    linarith
  exact ⟨c, hcPos, hc⟩

/-- The calibration `u(1/2) = 1` selects bits as the unique unit from the logarithmic family. -/
theorem bit_normalized_probability_information
    (u : ℝ → ℝ)
    (huCont : ContinuousOn u (Set.Ioc 0 1))
    (huMul :
      ∀ p q : ℝ, p ∈ Set.Ioc 0 1 → q ∈ Set.Ioc 0 1 →
        u (p * q) = u p + u q)
    (huHalf : u ((2 : ℝ)⁻¹) = 1) :
    ∀ p : ℝ, p ∈ Set.Ioc 0 1 →
      u p = -Real.log p / Real.log 2 := by
  obtain ⟨c, hc⟩ := probability_information_is_logarithmic u huCont huMul
  have hhalf := hc ((2 : ℝ)⁻¹) (by constructor <;> norm_num)
  rw [huHalf, Real.log_inv] at hhalf
  have hlog : Real.log (2 : ℝ) ≠ 0 := ne_of_gt (Real.log_pos (by norm_num))
  have hprod : c * Real.log 2 = 1 := by
    calc
      c * Real.log 2 = -c * -Real.log 2 := by ring
      _ = 1 := hhalf.symm
  have hcval : c = 1 / Real.log 2 := (eq_div_iff hlog).2 hprod
  intro p hp
  rw [hc p hp, hcval]
  field_simp

/-- A continuous nonzero action law that converts additive input into multiplicative impact must
be an exponential with one free real scale parameter. -/
theorem continuous_multiplicative_is_exponential
    (v : ℝ → ℝ)
    (hvCont : Continuous v)
    (hvMul : ∀ x y : ℝ, v (x + y) = v x * v y)
    (hvZero : v 0 = 1) :
    ∃ β : ℝ, ∀ x : ℝ, v x = Real.exp (β * x) := by
  have hvNe : ∀ x : ℝ, v x ≠ 0 := by
    intro x hx
    have h := hvMul x (-x)
    rw [add_neg_cancel, hvZero, hx, zero_mul] at h
    norm_num at h
  have hvPos : ∀ x : ℝ, 0 < v x := by
    intro x
    have h := hvMul (x / 2) (x / 2)
    have hsq : 0 < v (x / 2) ^ 2 := sq_pos_of_ne_zero (hvNe (x / 2))
    rw [show x / 2 + x / 2 = x by ring] at h
    rw [h]
    simpa [pow_two] using hsq
  let f : ℝ → ℝ := fun x ↦ Real.log (v x)
  have hfCont : Continuous f := hvCont.log hvNe
  have hfAdd : ∀ x y : ℝ, f (x + y) = f x + f y := by
    intro x y
    dsimp [f]
    rw [hvMul]
    exact Real.log_mul (hvNe x) (hvNe y)
  have hfLinear := continuous_additive_linear f hfCont hfAdd
  refine ⟨Real.log (v 1), ?_⟩
  intro x
  have h := hfLinear x
  dsimp [f] at h
  calc
    v x = Real.exp (Real.log (v x)) := (Real.exp_log (hvPos x)).symm
    _ = Real.exp (Real.log (v 1) * x) := by rw [h, mul_comm]

/-- If the continuous multiplicative action law is also strictly increasing, its free exponential
scale is positive. -/
theorem continuous_increasing_multiplicative_is_exponential
    (v : ℝ → ℝ)
    (hvCont : Continuous v)
    (hvMul : ∀ x y : ℝ, v (x + y) = v x * v y)
    (hvZero : v 0 = 1)
    (hvStrictMono : StrictMono v) :
    ∃ β : ℝ, 0 < β ∧ ∀ x : ℝ, v x = Real.exp (β * x) := by
  obtain ⟨β, hβ⟩ :=
    continuous_multiplicative_is_exponential v hvCont hvMul hvZero
  have hinc : v 0 < v 1 := hvStrictMono (by norm_num)
  have hβPos : 0 < β := by
    rw [hvZero, hβ 1] at hinc
    norm_num at hinc ⊢
    exact hinc
  exact ⟨β, hβPos, hβ⟩

/-- The calibration `v(s) = e` at a positive input scale `s` removes the free exponential scale. -/
theorem scale_normalized_multiplicative
    (v : ℝ → ℝ)
    (s : ℝ)
    (hs : 0 < s)
    (hvCont : Continuous v)
    (hvMul : ∀ x y : ℝ, v (x + y) = v x * v y)
    (hvZero : v 0 = 1)
    (hvScale : v s = Real.exp 1) :
    ∀ x : ℝ, v x = Real.exp (x / s) := by
  obtain ⟨β, hβ⟩ :=
    continuous_multiplicative_is_exponential v hvCont hvMul hvZero
  have hexp : Real.exp (β * s) = Real.exp 1 := by
    rw [← hvScale]
    exact (hβ s).symm
  have hβs : β * s = 1 := Real.exp_injective hexp
  intro x
  rw [hβ x]
  congr 1
  apply (eq_div_iff hs.ne').2
  calc
    β * x * s = x * (β * s) := by ring
    _ = x := by rw [hβs, mul_one]

end PossibilityAllocation
