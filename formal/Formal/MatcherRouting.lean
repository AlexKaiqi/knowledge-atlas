import Formal.PossibilityAllocation
import Mathlib.Analysis.Calculus.Deriv.Mul
import Mathlib.Tactic

set_option linter.style.header false

open Real MeasureTheory Set
open scoped BigOperators

namespace AttentionMarket.MatcherRouting

section Softmax

variable {ι : Type*}

noncomputable def unnormalizedWeight
    (prior score : ι → ℝ) (τ : ℝ) (i : ι) : ℝ :=
  prior i * exp (score i / τ)

theorem unnormalizedWeight_pos
    (prior score : ι → ℝ) {τ : ℝ} (hprior : ∀ i, 0 < prior i)
    (i : ι) :
    0 < unnormalizedWeight prior score τ i := by
  exact mul_pos (hprior i) (exp_pos _)

variable [Fintype ι]

noncomputable def partition
    (prior score : ι → ℝ) (τ : ℝ) : ℝ :=
  ∑ i, unnormalizedWeight prior score τ i

noncomputable def softmax
    (prior score : ι → ℝ) (τ : ℝ) (i : ι) : ℝ :=
  unnormalizedWeight prior score τ i / partition prior score τ

theorem partition_pos [Nonempty ι]
    (prior score : ι → ℝ) {τ : ℝ} (hprior : ∀ i, 0 < prior i) :
    0 < partition prior score τ := by
  unfold partition
  apply Finset.sum_pos
  · intro i hi
    exact unnormalizedWeight_pos prior score hprior i
  · exact Finset.univ_nonempty

theorem softmax_pos [Nonempty ι]
    (prior score : ι → ℝ) {τ : ℝ} (hprior : ∀ i, 0 < prior i)
    (i : ι) :
    0 < softmax prior score τ i := by
  exact div_pos (unnormalizedWeight_pos prior score hprior i)
    (partition_pos prior score hprior)

theorem sum_softmax_eq_one [Nonempty ι]
    (prior score : ι → ℝ) {τ : ℝ} (hprior : ∀ i, 0 < prior i) :
    ∑ i, softmax prior score τ i = 1 := by
  unfold softmax
  rw [← Finset.sum_div]
  change partition prior score τ / partition prior score τ = 1
  exact div_self (ne_of_gt (partition_pos prior score hprior))

theorem softmax_lt_one [Nontrivial ι]
    (prior score : ι → ℝ) {τ : ℝ} (hprior : ∀ i, 0 < prior i)
    (i : ι) :
    softmax prior score τ i < 1 := by
  classical
  obtain ⟨k, hki⟩ := exists_ne i
  have hk : 0 < softmax prior score τ k :=
    softmax_pos prior score hprior k
  have hsum : ∑ j, softmax prior score τ j = 1 :=
    sum_softmax_eq_one (τ := τ) prior score hprior
  have hik :
      softmax prior score τ i + softmax prior score τ k ≤
        ∑ j, softmax prior score τ j := by
    simpa [hki, Ne.symm hki] using
      (Finset.sum_le_sum_of_subset_of_nonneg
        (f := fun j ↦ softmax prior score τ j)
        (s := {i, k}) (t := Finset.univ)
        (Finset.subset_univ _)
        (fun j hj hjnot ↦ (softmax_pos prior score hprior j).le))
  rw [hsum] at hik
  linarith

/-- The leading share in a two-Matcher market with score gap scoreGap. -/
noncomputable def binaryLeaderShare (τ scoreGap : ℝ) : ℝ :=
  exp (scoreGap / τ) / (exp (scoreGap / τ) + 1)

/-- Positive temperature does not impose a uniform anti-concentration cap: every target
share strictly between zero and one is produced by a finite score gap. -/
theorem binaryLeaderShare_surjective_interior
    {τ p : ℝ} (hτ : 0 < τ) (hp0 : 0 < p) (hp1 : p < 1) :
    binaryLeaderShare τ (τ * log (p / (1 - p))) = p := by
  unfold binaryLeaderShare
  have hτ0 : τ ≠ 0 := ne_of_gt hτ
  have hOne : 1 - p ≠ 0 := ne_of_gt (sub_pos.mpr hp1)
  have hratio : 0 < p / (1 - p) := div_pos hp0 (sub_pos.mpr hp1)
  rw [mul_div_cancel_left₀ _ hτ0, exp_log hratio]
  field_simp [hOne]
  ring

end Softmax

section StaticRouting

variable {ι : Type*} [MeasurableSpace ι]

theorem absolutelyContinuous_of_singleton_pos
    (P : Measure ι) (hP : ∀ i, 0 < P {i}) (Q : Measure ι) :
    Q ≪ P := by
  apply Measure.AbsolutelyContinuous.mk
  intro s hs hPs
  have hsEmpty : s = ∅ := by
    apply Set.not_nonempty_iff_eq_empty.mp
    intro hsNonempty
    obtain ⟨i, hi⟩ := hsNonempty
    have hle : P {i} ≤ P s :=
      measure_mono (Set.singleton_subset_iff.mpr hi)
    rw [hPs] at hle
    exact (not_lt_of_ge hle) (hP i)
  rw [hsEmpty]
  simp

variable [Finite ι] [MeasurableSingletonClass ι]

theorem all_gibbsAdmissible_of_singleton_pos
    (P₀ : Measure ι) (hP₀ : ∀ i, 0 < P₀ {i})
    (f : ι → ℝ) (Q : ProbabilityMeasure ι) :
    PossibilityAllocation.gibbsAdmissible P₀ f Q := by
  refine ⟨absolutelyContinuous_of_singleton_pos P₀ hP₀ Q, ?_, ?_⟩
  · exact Integrable.of_finite
  · exact Integrable.of_finite

theorem existsUnique_finite_matcher_routing
    (P₀ : Measure ι) [IsProbabilityMeasure P₀]
    (hP₀ : ∀ i, 0 < P₀ {i})
    (netScore : ι → ℝ) {τ : ℝ} (hτ : 0 < τ) :
    (∀ Q : ProbabilityMeasure ι,
      PossibilityAllocation.regularizedMeasureObjective P₀ netScore τ Q ≤
        τ * log (∫ i, exp (netScore i / τ) ∂P₀)) ∧
    ∃! Q : ProbabilityMeasure ι,
      PossibilityAllocation.regularizedMeasureObjective P₀ netScore τ Q =
        τ * log (∫ i, exp (netScore i / τ) ∂P₀) := by
  have hcore :=
    PossibilityAllocation.existsUnique_regularized_gibbs_maximizer
      P₀ netScore hτ Integrable.of_finite Integrable.of_finite
  have hadm (Q : ProbabilityMeasure ι) :
      PossibilityAllocation.gibbsAdmissible P₀ (fun i ↦ netScore i / τ) Q :=
    all_gibbsAdmissible_of_singleton_pos P₀ hP₀ _ Q
  constructor
  · intro Q
    exact hcore.1 Q (hadm Q)
  · obtain ⟨Q, hQ, hUnique⟩ := hcore.2
    refine ⟨Q, hQ.2, ?_⟩
    intro R hR
    exact hUnique R ⟨hadm R, hR⟩

theorem finite_matcher_routing_eq_tilted_iff
    (P₀ : Measure ι) [IsProbabilityMeasure P₀]
    (hP₀ : ∀ i, 0 < P₀ {i})
    (netScore : ι → ℝ) {τ : ℝ} (hτ : 0 < τ)
    (Q : ProbabilityMeasure ι) :
    PossibilityAllocation.regularizedMeasureObjective P₀ netScore τ Q =
        τ * log (∫ i, exp (netScore i / τ) ∂P₀) ↔
      (Q : Measure ι) = P₀.tilted (fun i ↦ netScore i / τ) := by
  have hadm :
      PossibilityAllocation.gibbsAdmissible P₀ (fun i ↦ netScore i / τ) Q :=
    all_gibbsAdmissible_of_singleton_pos P₀ hP₀ _ Q
  have hiff :=
    (PossibilityAllocation.gibbs_variational_bound_eq_iff
      P₀ (Q : Measure ι) (fun i ↦ netScore i / τ)
      hadm.1 hadm.2.1 Integrable.of_finite hadm.2.2).2
  rw [PossibilityAllocation.regularizedMeasureObjective_eq_scaled
    P₀ netScore hτ Q]
  constructor
  · intro h
    apply hiff.mp
    unfold PossibilityAllocation.normalizedObjective at h
    nlinarith
  · intro h
    have hn := hiff.mpr h
    unfold PossibilityAllocation.normalizedObjective
    rw [hn]

end StaticRouting

section Replicator

variable {ι : Type*}

noncomputable def pathWeight
    (prior : ι → ℝ) (z : ℝ → ι → ℝ) (τ t : ℝ) (i : ι) : ℝ :=
  prior i * exp (z t i / τ)

noncomputable def pathPartition [Fintype ι]
    (prior : ι → ℝ) (z : ℝ → ι → ℝ) (τ t : ℝ) : ℝ :=
  ∑ i, pathWeight prior z τ t i

noncomputable def pathShare [Fintype ι]
    (prior : ι → ℝ) (z : ℝ → ι → ℝ) (τ t : ℝ) (i : ι) : ℝ :=
  pathWeight prior z τ t i / pathPartition prior z τ t

theorem pathPartition_pos [Fintype ι] [Nonempty ι]
    (prior : ι → ℝ) (z : ℝ → ι → ℝ) {τ t : ℝ}
    (hprior : ∀ i, 0 < prior i) :
    0 < pathPartition prior z τ t := by
  unfold pathPartition
  apply Finset.sum_pos
  · intro i hi
    exact mul_pos (hprior i) (exp_pos _)
  · exact Finset.univ_nonempty

theorem hasDerivAt_pathWeight
    (prior : ι → ℝ) (z : ℝ → ι → ℝ) {τ t : ℝ}
    (W : ι → ℝ) (hz : ∀ i, HasDerivAt (fun s ↦ z s i) (W i) t)
    (i : ι) :
    HasDerivAt (fun s ↦ pathWeight prior z τ s i)
      (pathWeight prior z τ t i * (W i / τ)) t := by
  simpa [pathWeight, mul_assoc] using
    (((hz i).div_const τ).exp.const_mul (prior i))

theorem hasDerivAt_pathPartition [Fintype ι]
    (prior : ι → ℝ) (z : ℝ → ι → ℝ) {τ t : ℝ}
    (W : ι → ℝ) (hz : ∀ i, HasDerivAt (fun s ↦ z s i) (W i) t) :
    HasDerivAt (fun s ↦ pathPartition prior z τ s)
      (∑ i, pathWeight prior z τ t i * (W i / τ)) t := by
  unfold pathPartition
  exact HasDerivAt.fun_sum fun i hi ↦ hasDerivAt_pathWeight prior z W hz i

theorem replicator_identity [Fintype ι] [Nonempty ι]
    (prior : ι → ℝ) (z : ℝ → ι → ℝ) {τ t : ℝ}
    (hτ : 0 < τ) (hprior : ∀ i, 0 < prior i)
    (W : ι → ℝ) (hz : ∀ i, HasDerivAt (fun s ↦ z s i) (W i) t)
    (i : ι) :
    HasDerivAt (fun s ↦ pathShare prior z τ s i)
      ((pathShare prior z τ t i / τ) *
        (W i - ∑ k, pathShare prior z τ t k * W k)) t := by
  have hpart : pathPartition prior z τ t ≠ 0 :=
    ne_of_gt (pathPartition_pos prior z hprior)
  have hquot :=
    (hasDerivAt_pathWeight (τ := τ) prior z W hz i).div
      (hasDerivAt_pathPartition (τ := τ) prior z W hz) hpart
  have hsumTau :
      (∑ k, pathWeight prior z τ t k * (W k / τ)) =
        (∑ k, pathWeight prior z τ t k * W k) / τ := by
    rw [Finset.sum_div]
    apply Finset.sum_congr rfl
    intro k hk
    ring
  have hsumPart :
      (∑ k, pathWeight prior z τ t k / pathPartition prior z τ t * W k) =
        (∑ k, pathWeight prior z τ t k * W k) /
          pathPartition prior z τ t := by
    rw [Finset.sum_div]
    apply Finset.sum_congr rfl
    intro k hk
    ring
  have hcoef :
      (pathWeight prior z τ t i * (W i / τ) * pathPartition prior z τ t -
          pathWeight prior z τ t i *
            ∑ k, pathWeight prior z τ t k * (W k / τ)) /
          pathPartition prior z τ t ^ 2 =
        (pathWeight prior z τ t i / pathPartition prior z τ t / τ) *
          (W i -
            ∑ k, pathWeight prior z τ t k / pathPartition prior z τ t * W k) := by
    rw [hsumTau, hsumPart]
    field_simp [hpart, ne_of_gt hτ]
  unfold pathShare
  rw [← hcoef]
  exact hquot

end Replicator

end AttentionMarket.MatcherRouting
