import Formal.PossibilityAllocation
import Mathlib.Analysis.Convex.Function
import Mathlib.Topology.Semicontinuity.Basic

set_option linter.style.header false

open Real MeasureTheory Set

namespace DynamicAttention

universe u v

/-! ## Abstract constrained Bellman recursion -/

/-- A finite-horizon Bellman model. The state type can encode a posterior belief,
history, budgets, candidate sets, and public rules. -/
structure Model (State : Type u) (Action : Type v) where
  feasible : Nat → State → Set Action
  stagePayoff : Nat → State → Action → ℝ
  continuation : Nat → (State → ℝ) → State → Action → ℝ
  discount : ℝ
  terminalValue : State → ℝ

namespace Model

variable {State : Type u} {Action : Type v}
variable [TopologicalSpace Action] [AddCommMonoid Action] [Module ℝ Action]

/-- Current payoff plus discounted expected continuation value. -/
def bellmanPayoff (model : Model State Action) (n : Nat)
    (nextValue : State → ℝ) (state : State) (action : Action) : ℝ :=
  model.stagePayoff n state action +
    model.discount * model.continuation n nextValue state action

/-- Pointwise conditions sufficient for a unique Bellman action. -/
structure Regular (model : Model State Action) : Prop where
  feasible_nonempty : ∀ n state, (model.feasible n state).Nonempty
  feasible_compact : ∀ n state, IsCompact (model.feasible n state)
  payoff_upperSemicontinuous :
    ∀ n nextValue state,
      UpperSemicontinuousOn
        (model.bellmanPayoff n nextValue state) (model.feasible n state)
  payoff_strictConcave :
    ∀ n nextValue state,
      StrictConcaveOn ℝ
        (model.feasible n state) (model.bellmanPayoff n nextValue state)

/-- At one Bellman step, the maximizing feasible action exists and is unique. -/
theorem existsUnique_bellmanAction (model : Model State Action)
    (regular : model.Regular) (n : Nat) (nextValue : State → ℝ) (state : State) :
    ∃! action : Action,
      action ∈ model.feasible n state ∧
        IsMaxOn (model.bellmanPayoff n nextValue state)
          (model.feasible n state) action := by
  obtain ⟨action, hFeasible, hMax⟩ :=
    (regular.payoff_upperSemicontinuous n nextValue state).exists_isMaxOn
      (regular.feasible_nonempty n state) (regular.feasible_compact n state)
  refine ⟨action, ⟨hFeasible, hMax⟩, ?_⟩
  intro other hOther
  exact (regular.payoff_strictConcave n nextValue state).eq_of_isMaxOn
    hOther.2 hMax hOther.1 hFeasible

/-- The unique maximizing action for a supplied continuation value. -/
noncomputable def chooseBellmanAction (model : Model State Action)
    (regular : model.Regular) (n : Nat) (nextValue : State → ℝ) (state : State) :
    Action :=
  Classical.choose (model.existsUnique_bellmanAction regular n nextValue state)

/-- The selected Bellman action is feasible and globally optimal. -/
theorem chooseBellmanAction_spec (model : Model State Action)
    (regular : model.Regular) (n : Nat) (nextValue : State → ℝ) (state : State) :
    model.chooseBellmanAction regular n nextValue state ∈ model.feasible n state ∧
      IsMaxOn (model.bellmanPayoff n nextValue state) (model.feasible n state)
        (model.chooseBellmanAction regular n nextValue state) :=
  (Classical.choose_spec
    (model.existsUnique_bellmanAction regular n nextValue state)).1

/-- Values for every finite number of Bellman steps, defined by backward recursion. -/
noncomputable def value (model : Model State Action) (regular : model.Regular) :
    Nat → State → ℝ
  | 0 => model.terminalValue
  | n + 1 => fun state ↦
      model.bellmanPayoff n (model.value regular n) state
        (model.chooseBellmanAction regular n (model.value regular n) state)

/-- The state-feedback selector at reverse-time stage n. -/
noncomputable def policy (model : Model State Action) (regular : model.Regular)
    (n : Nat) (state : State) : Action :=
  model.chooseBellmanAction regular n (model.value regular n) state

/-- The recursive value is the Bellman payoff of the selected action. -/
theorem value_succ (model : Model State Action) (regular : model.Regular)
    (n : Nat) (state : State) :
    model.value regular (n + 1) state =
      model.bellmanPayoff n (model.value regular n) state
        (model.policy regular n state) :=
  rfl

/-- The recursive selector is feasible and Bellman optimal at every stage and state. -/
theorem policy_spec (model : Model State Action) (regular : model.Regular)
    (n : Nat) (state : State) :
    model.policy regular n state ∈ model.feasible n state ∧
      IsMaxOn (model.bellmanPayoff n (model.value regular n) state)
        (model.feasible n state) (model.policy regular n state) :=
  model.chooseBellmanAction_spec regular n (model.value regular n) state

/-- A candidate solution of the backward Bellman equations. -/
structure BellmanSolution (model : Model State Action) where
  candidateValue : Nat → State → ℝ
  candidatePolicy : Nat → State → Action
  value_zero : candidateValue 0 = model.terminalValue
  policy_optimal : ∀ n state,
    candidatePolicy n state ∈ model.feasible n state ∧
      IsMaxOn (model.bellmanPayoff n (candidateValue n) state)
        (model.feasible n state) (candidatePolicy n state)
  value_succ : ∀ n state,
    candidateValue (n + 1) state =
      model.bellmanPayoff n (candidateValue n) state (candidatePolicy n state)

/-- The Bellman value sequence and its state-feedback selector are jointly unique. -/
theorem bellmanSolution_unique (model : Model State Action) (regular : model.Regular)
    (solution : model.BellmanSolution) :
    solution.candidateValue = model.value regular ∧
      solution.candidatePolicy = model.policy regular := by
  have hValue : ∀ n, solution.candidateValue n = model.value regular n := by
    intro n
    induction n with
    | zero =>
        exact solution.value_zero
    | succ n ih =>
        funext state
        have hOptimal := solution.policy_optimal n state
        rw [ih] at hOptimal
        have hAction :
            solution.candidatePolicy n state = model.policy regular n state :=
          (model.existsUnique_bellmanAction regular n (model.value regular n) state).unique
            hOptimal (model.policy_spec regular n state)
        rw [solution.value_succ, model.value_succ, ih, hAction]
  refine ⟨funext hValue, ?_⟩
  funext n state
  have hOptimal := solution.policy_optimal n state
  rw [hValue n] at hOptimal
  exact (model.existsUnique_bellmanAction regular n (model.value regular n) state).unique
    hOptimal (model.policy_spec regular n state)

end Model

/-! ## Unconstrained KL-control and its exact Gibbs kernel -/

/-- An unconstrained finite-horizon KL-control model. -/
structure GibbsModel (State : Type u) (Config : Type v) [MeasurableSpace Config] where
  reference : Nat → State → Measure Config
  stagePayoff : Nat → State → Config → ℝ
  continuation : Nat → (State → ℝ) → State → Config → ℝ
  discount : ℝ
  rho : ℝ
  terminalValue : State → ℝ

namespace GibbsModel

variable {State : Type u} {Config : Type v} [MeasurableSpace Config]

/-- Current expected welfare plus discounted continuation value. -/
def bellmanScore (model : GibbsModel State Config) (n : Nat)
    (nextValue : State → ℝ) (state : State) (config : Config) : ℝ :=
  model.stagePayoff n state config +
    model.discount * model.continuation n nextValue state config

/-- Integrability and positivity assumptions for every pointwise Gibbs step. -/
structure Regular (model : GibbsModel State Config) : Prop where
  rho_pos : 0 < model.rho
  reference_probability : ∀ n state, IsProbabilityMeasure (model.reference n state)
  exp_integrable : ∀ n nextValue state,
    Integrable
      (fun config ↦ exp (model.bellmanScore n nextValue state config / model.rho))
      (model.reference n state)
  exp_mul_integrable : ∀ n nextValue state,
    Integrable
      (fun config ↦
        exp (model.bellmanScore n nextValue state config / model.rho) *
          (model.bellmanScore n nextValue state config / model.rho))
      (model.reference n state)

/-- A stage policy is optimal when it is admissible and attains the log-partition value. -/
def IsStageOptimal (model : GibbsModel State Config) (n : Nat)
    (nextValue : State → ℝ) (state : State)
    (stagePolicy : ProbabilityMeasure Config) : Prop :=
  PossibilityAllocation.gibbsAdmissible (model.reference n state)
      (fun config ↦ model.bellmanScore n nextValue state config / model.rho)
      stagePolicy ∧
    PossibilityAllocation.regularizedMeasureObjective
        (model.reference n state) (model.bellmanScore n nextValue state)
        model.rho stagePolicy =
      model.rho *
        log (∫ config,
          exp (model.bellmanScore n nextValue state config / model.rho)
            ∂(model.reference n state))

/-- Every supplied continuation value has exactly one pointwise optimal policy. -/
theorem existsUnique_stageOptimal (model : GibbsModel State Config)
    (regular : model.Regular) (n : Nat) (nextValue : State → ℝ) (state : State) :
    ∃! stagePolicy : ProbabilityMeasure Config,
      model.IsStageOptimal n nextValue state stagePolicy := by
  let _ : IsProbabilityMeasure (model.reference n state) :=
    regular.reference_probability n state
  exact (PossibilityAllocation.existsUnique_regularized_gibbs_maximizer
    (model.reference n state) (model.bellmanScore n nextValue state)
    regular.rho_pos (regular.exp_integrable n nextValue state)
    (regular.exp_mul_integrable n nextValue state)).2

/-- An optimal stage policy is the exponential tilt of its reference measure. -/
theorem stageOptimal_measure_eq_tilted (model : GibbsModel State Config)
    (regular : model.Regular) (n : Nat) (nextValue : State → ℝ) (state : State)
    (stagePolicy : ProbabilityMeasure Config)
    (hPolicy : model.IsStageOptimal n nextValue state stagePolicy) :
    (stagePolicy : Measure Config) =
      (model.reference n state).tilted
        (fun config ↦ model.bellmanScore n nextValue state config / model.rho) := by
  let _ : IsProbabilityMeasure (model.reference n state) :=
    regular.reference_probability n state
  let score := model.bellmanScore n nextValue state
  let potential := fun config ↦ score config / model.rho
  have hscaled :
      model.rho *
          PossibilityAllocation.normalizedObjective
            (model.reference n state) potential stagePolicy =
        model.rho *
          log (∫ config, exp (potential config) ∂(model.reference n state)) := by
    calc
      model.rho *
          PossibilityAllocation.normalizedObjective
            (model.reference n state) potential stagePolicy =
          PossibilityAllocation.regularizedMeasureObjective
            (model.reference n state) score model.rho stagePolicy := by
              symm
              exact PossibilityAllocation.regularizedMeasureObjective_eq_scaled
                (model.reference n state) score regular.rho_pos stagePolicy
      _ = model.rho *
          log (∫ config, exp (potential config) ∂(model.reference n state)) := by
            exact hPolicy.2
  have hnormalized :
      PossibilityAllocation.normalizedObjective
          (model.reference n state) potential stagePolicy =
        log (∫ config, exp (potential config) ∂(model.reference n state)) :=
    mul_left_cancel₀ regular.rho_pos.ne' hscaled
  exact
    (PossibilityAllocation.gibbs_variational_bound_eq_iff
      (model.reference n state) (stagePolicy : Measure Config) potential
      hPolicy.1.1 hPolicy.1.2.1 (regular.exp_integrable n nextValue state)
      hPolicy.1.2.2).2.mp hnormalized

/-- The unique stage policy selected by classical choice. -/
noncomputable def chooseStagePolicy (model : GibbsModel State Config)
    (regular : model.Regular) (n : Nat) (nextValue : State → ℝ) (state : State) :
    ProbabilityMeasure Config :=
  Classical.choose (model.existsUnique_stageOptimal regular n nextValue state)

/-- The chosen policy attains the unique stage optimum. -/
theorem chooseStagePolicy_spec (model : GibbsModel State Config)
    (regular : model.Regular) (n : Nat) (nextValue : State → ℝ) (state : State) :
    model.IsStageOptimal n nextValue state
      (model.chooseStagePolicy regular n nextValue state) :=
  (Classical.choose_spec
    (model.existsUnique_stageOptimal regular n nextValue state)).1

/-- Backward value recursion, where n counts remaining Bellman steps. -/
noncomputable def value (model : GibbsModel State Config) (regular : model.Regular) :
    Nat → State → ℝ
  | 0 => model.terminalValue
  | n + 1 => fun state ↦
      PossibilityAllocation.regularizedMeasureObjective
        (model.reference n state)
        (model.bellmanScore n (model.value regular n) state) model.rho
        (model.chooseStagePolicy regular n (model.value regular n) state)

/-- The pointwise state-feedback policy in the backward recursion. -/
noncomputable def policy (model : GibbsModel State Config) (regular : model.Regular)
    (n : Nat) (state : State) : ProbabilityMeasure Config :=
  model.chooseStagePolicy regular n (model.value regular n) state

theorem value_succ (model : GibbsModel State Config) (regular : model.Regular)
    (n : Nat) (state : State) :
    model.value regular (n + 1) state =
      PossibilityAllocation.regularizedMeasureObjective
        (model.reference n state)
        (model.bellmanScore n (model.value regular n) state) model.rho
        (model.policy regular n state) :=
  rfl

theorem policy_spec (model : GibbsModel State Config) (regular : model.Regular)
    (n : Nat) (state : State) :
    model.IsStageOptimal n (model.value regular n) state
      (model.policy regular n state) :=
  model.chooseStagePolicy_spec regular n (model.value regular n) state

/-- The Bellman value is the entropic log-partition transform of its soft Q-score. -/
theorem value_succ_eq_logPartition (model : GibbsModel State Config)
    (regular : model.Regular) (n : Nat) (state : State) :
    model.value regular (n + 1) state =
      model.rho *
        log (∫ config,
          exp
            (model.bellmanScore n (model.value regular n) state config /
              model.rho)
            ∂(model.reference n state)) := by
  rw [model.value_succ regular n state]
  exact (model.policy_spec regular n state).2

/-- Every selected Bellman policy has the exact Gibbs form. -/
theorem policy_measure_eq_tilted (model : GibbsModel State Config)
    (regular : model.Regular) (n : Nat) (state : State) :
    (model.policy regular n state : Measure Config) =
      (model.reference n state).tilted
        (fun config ↦
          model.bellmanScore n (model.value regular n) state config / model.rho) :=
  model.stageOptimal_measure_eq_tilted regular n (model.value regular n) state
    (model.policy regular n state) (model.policy_spec regular n state)

/-- A candidate solution of all finite-horizon Gibbs Bellman equations. -/
structure BellmanSolution (model : GibbsModel State Config) where
  candidateValue : Nat → State → ℝ
  candidatePolicy : Nat → State → ProbabilityMeasure Config
  value_zero : candidateValue 0 = model.terminalValue
  policy_optimal : ∀ n state,
    model.IsStageOptimal n (candidateValue n) state (candidatePolicy n state)
  value_succ : ∀ n state,
    candidateValue (n + 1) state =
      PossibilityAllocation.regularizedMeasureObjective
        (model.reference n state)
        (model.bellmanScore n (candidateValue n) state) model.rho
        (candidatePolicy n state)

/-- The Gibbs Bellman value sequence and pointwise Markov selector are jointly unique. -/
theorem bellmanSolution_unique (model : GibbsModel State Config)
    (regular : model.Regular) (solution : model.BellmanSolution) :
    solution.candidateValue = model.value regular ∧
      solution.candidatePolicy = model.policy regular := by
  have hValue : ∀ n, solution.candidateValue n = model.value regular n := by
    intro n
    induction n with
    | zero =>
        exact solution.value_zero
    | succ n ih =>
        funext state
        have hOptimal := solution.policy_optimal n state
        rw [ih] at hOptimal
        have hPolicy :
            solution.candidatePolicy n state = model.policy regular n state :=
          (model.existsUnique_stageOptimal regular n (model.value regular n) state).unique
            hOptimal (model.policy_spec regular n state)
        rw [solution.value_succ, model.value_succ, ih, hPolicy]
  refine ⟨funext hValue, ?_⟩
  funext n state
  have hOptimal := solution.policy_optimal n state
  rw [hValue n] at hOptimal
  exact (model.existsUnique_stageOptimal regular n (model.value regular n) state).unique
    hOptimal (model.policy_spec regular n state)

end GibbsModel

end DynamicAttention
