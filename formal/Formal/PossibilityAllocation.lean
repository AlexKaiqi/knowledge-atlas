import Mathlib.Analysis.Convex.Function
import Mathlib.InformationTheory.KullbackLeibler.Basic
import Mathlib.MeasureTheory.Measure.ProbabilityMeasure
import Mathlib.MeasureTheory.Measure.Tilted
import Mathlib.Tactic.Linarith
import Mathlib.Topology.Semicontinuity.Basic

set_option linter.style.header false

/-!
# General static possibility allocation

This file is independent of any finite seating model. It proves two layers:

1. an abstract compact/strictly-concave existence-and-uniqueness theorem;
2. the Gibbs variational theorem on an arbitrary measurable space.

In the Gibbs layer, `f` is the dimensionless potential `score / ρ`. Thus maximizing
`E[score] - ρ KL` is equivalent, for `ρ > 0`, to maximizing `E[f] - KL`.
-/

open Real MeasureTheory Set
open scoped ENNReal NNReal

namespace PossibilityAllocation

open InformationTheory

/-! ## Abstract regularized allocation problem -/

/-- An abstract static allocation problem. In the intended model, `E` is a space of probability
distributions, `welfare` is aggregate demand value, and `resistance` is `ρ` times KL divergence. -/
structure StaticProblem (E : Type*) where
  feasible : Set E
  welfare : E → ℝ
  resistance : E → ℝ

namespace StaticProblem

variable {E : Type*}

def objective (problem : StaticProblem E) (x : E) : ℝ :=
  problem.welfare x - problem.resistance x

def IsSolution (problem : StaticProblem E) (x : E) : Prop :=
  x ∈ problem.feasible ∧ IsMaxOn problem.objective problem.feasible x

/-- Concave welfare minus strictly convex resistance is strictly concave. -/
theorem objective_strictConcaveOn [AddCommMonoid E] [Module ℝ E]
    (problem : StaticProblem E)
    (hW : ConcaveOn ℝ problem.feasible problem.welfare)
    (hR : StrictConvexOn ℝ problem.feasible problem.resistance) :
    StrictConcaveOn ℝ problem.feasible problem.objective := by
  change StrictConcaveOn ℝ problem.feasible (problem.welfare - problem.resistance)
  exact hW.sub_strictConvexOn hR

/-- A nonempty compact feasible set, an upper-semicontinuous objective, concave welfare, and
strictly convex resistance give exactly one optimal allocation. -/
theorem existsUnique_solution [TopologicalSpace E] [AddCommMonoid E] [Module ℝ E]
    (problem : StaticProblem E)
    (hKne : problem.feasible.Nonempty) (hKcompact : IsCompact problem.feasible)
    (hObjectiveUsc : UpperSemicontinuousOn problem.objective problem.feasible)
    (hW : ConcaveOn ℝ problem.feasible problem.welfare)
    (hR : StrictConvexOn ℝ problem.feasible problem.resistance) :
    ∃! x : E, problem.IsSolution x := by
  have hJstrict := problem.objective_strictConcaveOn hW hR
  obtain ⟨x, hxK, hxmax⟩ := hObjectiveUsc.exists_isMaxOn hKne hKcompact
  refine ⟨x, ⟨hxK, hxmax⟩, ?_⟩
  intro y hy
  exact hJstrict.eq_of_isMaxOn hy.2 hxmax hy.1 hxK

end StaticProblem

/-! ## Gibbs variational theorem on an arbitrary measurable space -/

/-- The finite-real domain on which the normalized objective `E_Q[f] - KL(Q ‖ P)` is used. -/
def gibbsAdmissible
    {α : Type*} [MeasurableSpace α] (P : Measure α) (f : α → ℝ)
    (Q : ProbabilityMeasure α) : Prop :=
  (Q : Measure α) ≪ P ∧ Integrable f (Q : Measure α) ∧
    Integrable (llr (Q : Measure α) P) (Q : Measure α)

/-- The objective divided by a positive KL coefficient `ρ`; `f` represents `score / ρ`. -/
noncomputable def normalizedObjective
    {α : Type*} [MeasurableSpace α] (P : Measure α) (f : α → ℝ)
    (Q : ProbabilityMeasure α) : ℝ :=
  (∫ x, f x ∂(Q : Measure α)) - (klDiv (Q : Measure α) P).toReal

/-- The unscaled objective `E_Q[score] - ρ KL(Q ‖ P)`. -/
noncomputable def regularizedMeasureObjective
    {α : Type*} [MeasurableSpace α] (P : Measure α) (score : α → ℝ)
    (ρ : ℝ) (Q : ProbabilityMeasure α) : ℝ :=
  (∫ x, score x ∂(Q : Measure α)) - ρ * (klDiv (Q : Measure α) P).toReal

/-- For positive `ρ`, maximizing the regularized objective is equivalent to maximizing the
dimensionless objective with potential `score / ρ`. -/
theorem regularizedMeasureObjective_eq_scaled
    {α : Type*} [MeasurableSpace α] (P : Measure α) (score : α → ℝ)
    {ρ : ℝ} (hρ : 0 < ρ) (Q : ProbabilityMeasure α) :
    regularizedMeasureObjective P score ρ Q =
      ρ * normalizedObjective P (fun x ↦ score x / ρ) Q := by
  rw [regularizedMeasureObjective, normalizedObjective, integral_div]
  field_simp

/-- Changing the reference measure from `P` to its exponential tilt converts the optimization
gap into KL divergence from the tilted measure. -/
theorem gibbs_variational_identity
    {α : Type*} {mα : MeasurableSpace α} (P Q : Measure α)
    [IsProbabilityMeasure P] [IsProbabilityMeasure Q] (f : α → ℝ)
    (hQP : Q ≪ P) (hfQ : Integrable f Q)
    (hexpP : Integrable (fun x ↦ exp (f x)) P)
    (hllr : Integrable (llr Q P) Q) :
    (klDiv Q (P.tilted f)).toReal =
      (klDiv Q P).toReal - ∫ x, f x ∂Q + log (∫ x, exp (f x) ∂P) := by
  let _ : IsProbabilityMeasure (P.tilted f) := isProbabilityMeasure_tilted hexpP
  have hPt : P ≪ P.tilted f := absolutelyContinuous_tilted hexpP
  have hQt : Q ≪ P.tilted f := hQP.trans hPt
  have hllrt : Integrable (llr Q (P.tilted f)) Q :=
    integrable_llr_tilted_right hQP hfQ hllr hexpP
  rw [toReal_klDiv hQt hllrt, toReal_klDiv hQP hllr]
  simpa using integral_llr_tilted_right hQP hfQ hexpP hllr

/-- Gibbs' inequality gives the variational upper bound, and equality holds exactly at the
exponentially tilted probability measure. -/
theorem gibbs_variational_bound_eq_iff
    {α : Type*} {mα : MeasurableSpace α} (P Q : Measure α)
    [IsProbabilityMeasure P] [IsProbabilityMeasure Q] (f : α → ℝ)
    (hQP : Q ≪ P) (hfQ : Integrable f Q)
    (hexpP : Integrable (fun x ↦ exp (f x)) P)
    (hllr : Integrable (llr Q P) Q) :
    (∫ x, f x ∂Q) - (klDiv Q P).toReal ≤ log (∫ x, exp (f x) ∂P) ∧
      ((∫ x, f x ∂Q) - (klDiv Q P).toReal = log (∫ x, exp (f x) ∂P) ↔
        Q = P.tilted f) := by
  let _ : IsProbabilityMeasure (P.tilted f) := isProbabilityMeasure_tilted hexpP
  have hPt : P ≪ P.tilted f := absolutelyContinuous_tilted hexpP
  have hQt : Q ≪ P.tilted f := hQP.trans hPt
  have hllrt : Integrable (llr Q (P.tilted f)) Q :=
    integrable_llr_tilted_right hQP hfQ hllr hexpP
  have hid := gibbs_variational_identity P Q f hQP hfQ hexpP hllr
  have hnonneg : 0 ≤ (klDiv Q (P.tilted f)).toReal := ENNReal.toReal_nonneg
  constructor
  · linarith
  · constructor
    · intro hEq
      have hzeroReal : (klDiv Q (P.tilted f)).toReal = 0 := by
        linarith
      have hneTop : klDiv Q (P.tilted f) ≠ ∞ := klDiv_ne_top hQt hllrt
      have hzero : klDiv Q (P.tilted f) = 0 := by
        rw [ENNReal.toReal_eq_zero_iff] at hzeroReal
        exact hzeroReal.resolve_right hneTop
      exact klDiv_eq_zero_iff.mp hzero
    · intro hEq
      subst Q
      simp at hid
      linarith

/-- A helper establishing that the tilted candidate itself lies in the finite-real KL domain. -/
theorem integrable_llr_tilted_self
    {α : Type*} {mα : MeasurableSpace α} (P : Measure α)
    [IsProbabilityMeasure P] (f : α → ℝ)
    (hexpP : Integrable (fun x ↦ exp (f x)) P)
    (hfTilt : Integrable f (P.tilted f)) :
    Integrable (llr (P.tilted f) P) (P.tilted f) := by
  have hfMeas : AEMeasurable f P :=
    aemeasurable_of_aemeasurable_exp hexpP.1.aemeasurable
  have heqP :
      llr (P.tilted f) P =ᵐ[P]
        fun x ↦ f x - log (∫ z, exp (f z) ∂P) + llr P P x :=
    llr_tilted_left Measure.AbsolutelyContinuous.rfl hexpP hfMeas
  have heqTilt := (tilted_absolutelyContinuous P f).ae_le heqP
  rw [integrable_congr heqTilt]
  have hselfP : llr P P =ᵐ[P] 0 := llr_self P
  have hselfTilt := (tilted_absolutelyContinuous P f).ae_le hselfP
  have hselfInt : Integrable (llr P P) (P.tilted f) := by
    rw [integrable_congr hselfTilt]
    exact integrable_zero _ _ _
  exact (hfTilt.sub (integrable_const _)).add hselfInt

/-- On any measurable state space, exponential integrability gives one and only one admissible
maximizer: the exponential tilt `P.tilted f`. No finiteness or discreteness of the state space is
assumed. -/
theorem existsUnique_gibbs_maximizer
    {α : Type*} {mα : MeasurableSpace α} (P : Measure α)
    [IsProbabilityMeasure P] (f : α → ℝ)
    (hexpP : Integrable (fun x ↦ exp (f x)) P)
    (hexpMulP : Integrable (fun x ↦ exp (f x) * f x) P) :
    (∀ Q : ProbabilityMeasure α, gibbsAdmissible P f Q →
      normalizedObjective P f Q ≤ log (∫ x, exp (f x) ∂P)) ∧
    ∃! Q : ProbabilityMeasure α,
      gibbsAdmissible P f Q ∧
        normalizedObjective P f Q = log (∫ x, exp (f x) ∂P) := by
  have hprob : IsProbabilityMeasure (P.tilted f) := isProbabilityMeasure_tilted hexpP
  let Qt : ProbabilityMeasure α := ⟨P.tilted f, hprob⟩
  have hfTilt : Integrable f (P.tilted f) := by
    rw [integrable_tilted_iff hexpP]
    simpa [smul_eq_mul] using hexpMulP
  have hllrTilt : Integrable (llr (P.tilted f) P) (P.tilted f) :=
    integrable_llr_tilted_self P f hexpP hfTilt
  have hQtAdm : gibbsAdmissible P f Qt :=
    ⟨tilted_absolutelyContinuous P f, hfTilt, hllrTilt⟩
  have hbound (Q : ProbabilityMeasure α) (hQ : gibbsAdmissible P f Q) :=
    gibbs_variational_bound_eq_iff P (Q : Measure α) f hQ.1 hQ.2.1 hexpP hQ.2.2
  constructor
  · intro Q hQ
    exact (hbound Q hQ).1
  · refine ⟨Qt, ⟨hQtAdm, ?_⟩, ?_⟩
    · exact (hbound Qt hQtAdm).2.mpr rfl
    · intro Q hQ
      apply ProbabilityMeasure.toMeasure_injective
      exact (hbound Q hQ.1).2.mp hQ.2

/-- With the KL coefficient shown explicitly, the unique optimizer is the exponential tilt by
`score / ρ`, and its optimal value is `ρ log E_P[exp (score / ρ)]`. -/
theorem existsUnique_regularized_gibbs_maximizer
    {α : Type*} {mα : MeasurableSpace α} (P : Measure α)
    [IsProbabilityMeasure P] (score : α → ℝ) {ρ : ℝ} (hρ : 0 < ρ)
    (hexpP : Integrable (fun x ↦ exp (score x / ρ)) P)
    (hexpMulP : Integrable (fun x ↦ exp (score x / ρ) * (score x / ρ)) P) :
    (∀ Q : ProbabilityMeasure α, gibbsAdmissible P (fun x ↦ score x / ρ) Q →
      regularizedMeasureObjective P score ρ Q ≤
        ρ * log (∫ x, exp (score x / ρ) ∂P)) ∧
    ∃! Q : ProbabilityMeasure α,
      gibbsAdmissible P (fun x ↦ score x / ρ) Q ∧
        regularizedMeasureObjective P score ρ Q =
          ρ * log (∫ x, exp (score x / ρ) ∂P) := by
  have hcore := existsUnique_gibbs_maximizer P (fun x ↦ score x / ρ) hexpP hexpMulP
  constructor
  · intro Q hQ
    rw [regularizedMeasureObjective_eq_scaled P score hρ Q]
    exact mul_le_mul_of_nonneg_left (hcore.1 Q hQ) hρ.le
  · obtain ⟨Q, hQ, hUnique⟩ := hcore.2
    refine ⟨Q, ⟨hQ.1, ?_⟩, ?_⟩
    · rw [regularizedMeasureObjective_eq_scaled P score hρ Q, hQ.2]
    · intro R hR
      apply hUnique R
      refine ⟨hR.1, ?_⟩
      rw [regularizedMeasureObjective_eq_scaled P score hρ R] at hR
      nlinarith [hR.2]

/-! ## A familiar sufficient condition: compact state space and continuous potential -/

theorem compact_continuous_gibbs_moments
    {α : Type*} [TopologicalSpace α] [CompactSpace α]
    [MeasurableSpace α] [OpensMeasurableSpace α]
    (P : Measure α) [IsProbabilityMeasure P] (f : α → ℝ)
    (hf : Continuous f) :
    Integrable (fun x ↦ exp (f x)) P ∧
      Integrable (fun x ↦ exp (f x) * f x) P := by
  constructor
  · exact (continuous_exp.comp hf).integrable_of_hasCompactSupport
      (HasCompactSupport.of_compactSpace _)
  · exact ((continuous_exp.comp hf).mul hf).integrable_of_hasCompactSupport
      (HasCompactSupport.of_compactSpace _)

/-- The standard compact-and-continuous condition package implies the general Gibbs uniqueness
theorem. -/
theorem existsUnique_gibbs_maximizer_of_compact_continuous
    {α : Type*} [TopologicalSpace α] [CompactSpace α]
    [MeasurableSpace α] [OpensMeasurableSpace α]
    (P : Measure α) [IsProbabilityMeasure P] (f : α → ℝ)
    (hf : Continuous f) :
    (∀ Q : ProbabilityMeasure α, gibbsAdmissible P f Q →
      normalizedObjective P f Q ≤ log (∫ x, exp (f x) ∂P)) ∧
    ∃! Q : ProbabilityMeasure α,
      gibbsAdmissible P f Q ∧
        normalizedObjective P f Q = log (∫ x, exp (f x) ∂P) := by
  obtain ⟨hexpP, hexpMulP⟩ := compact_continuous_gibbs_moments P f hf
  exact existsUnique_gibbs_maximizer P f hexpP hexpMulP

end PossibilityAllocation
