import Mathlib.Analysis.SpecialFunctions.Log.Basic
import Mathlib.Tactic

set_option linter.style.header false

/-!
# Three-seat allocation model

This file formalizes the finite combinatorial and Gibbs-algebraic core of the
three-seat example. The reference measure is uniform, so its common factor
`1 / 6` cancels from every normalized Gibbs probability.
-/

namespace SeatAllocation

/-- The six left-to-right seatings of three distinct people `A`, `B`, and `C`. -/
inductive Seating where
  | abc | acb | bac | bca | cab | cba
  deriving DecidableEq, Repr

open Seating

def allSeatings : List Seating := [abc, acb, bac, bca, cab, cba]

def adjacentSeatings : List Seating := [abc, bac, cab, cba]

def middleSeatings : List Seating := [acb, bca]

/-- Claim `D_AB`: `A` and `B` occupy adjacent seats. -/
def adjacentAB : Seating → Bool
  | abc | bac | cab | cba => true
  | acb | bca => false

/-- Claim `D_C`: `C` occupies the middle seat. -/
def cInMiddle : Seating → Bool
  | acb | bca => true
  | abc | bac | cab | cba => false

theorem claims_are_complements (s : Seating) :
    cInMiddle s = !adjacentAB s := by
  cases s <;> rfl

theorem all_seatings_complete (s : Seating) : s ∈ allSeatings := by
  cases s <;> simp [allSeatings]

theorem adjacent_iff_mem (s : Seating) :
    adjacentAB s = true ↔ s ∈ adjacentSeatings := by
  cases s <;> decide

theorem middle_iff_mem (s : Seating) :
    cInMiddle s = true ↔ s ∈ middleSeatings := by
  cases s <;> decide

theorem all_seatings_nodup : allSeatings.Nodup := by
  decide

theorem adjacent_seatings_nodup : adjacentSeatings.Nodup := by
  decide

theorem middle_seatings_nodup : middleSeatings.Nodup := by
  decide

theorem six_seatings : allSeatings.length = 6 := by
  rfl

theorem adjacent_count : adjacentSeatings.length = 4 := by
  rfl

theorem middle_count : middleSeatings.length = 2 := by
  rfl

/-- Uniform reference probability of `D_AB`. -/
def uniformAdjacent : ℚ :=
  (adjacentSeatings.length : ℚ) / allSeatings.length

/-- Uniform reference probability of `D_C`. -/
def uniformMiddle : ℚ :=
  (middleSeatings.length : ℚ) / allSeatings.length

theorem uniform_adjacent : uniformAdjacent = 2 / 3 := by
  norm_num [uniformAdjacent, adjacentSeatings, allSeatings]

theorem uniform_middle : uniformMiddle = 1 / 3 := by
  norm_num [uniformMiddle, middleSeatings, allSeatings]

/-- Unnormalized Gibbs weight after removing the common uniform factor `1 / 6`. -/
noncomputable def stateWeight (γAB γC : ℝ) (s : Seating) : ℝ :=
  Real.exp (if adjacentAB s then γAB else γC)

noncomputable def partitionMass (γAB γC : ℝ) : ℝ :=
  (allSeatings.map (stateWeight γAB γC)).sum

noncomputable def adjacentMass (γAB γC : ℝ) : ℝ :=
  (adjacentSeatings.map (stateWeight γAB γC)).sum

noncomputable def middleMass (γAB γC : ℝ) : ℝ :=
  (middleSeatings.map (stateWeight γAB γC)).sum

theorem partition_mass_formula (γAB γC : ℝ) :
    partitionMass γAB γC = 4 * Real.exp γAB + 2 * Real.exp γC := by
  simp [partitionMass, allSeatings, stateWeight, adjacentAB]
  ring

theorem adjacent_mass_formula (γAB γC : ℝ) :
    adjacentMass γAB γC = 4 * Real.exp γAB := by
  simp [adjacentMass, adjacentSeatings, stateWeight, adjacentAB]
  ring

theorem middle_mass_formula (γAB γC : ℝ) :
    middleMass γAB γC = 2 * Real.exp γC := by
  simp [middleMass, middleSeatings, stateWeight, adjacentAB]
  ring

theorem partition_mass_pos (γAB γC : ℝ) : 0 < partitionMass γAB γC := by
  rw [partition_mass_formula]
  positivity

/-- Normalized probability of one concrete seating. -/
noncomputable def gibbsStateProbability (γAB γC : ℝ) (s : Seating) : ℝ :=
  stateWeight γAB γC s / partitionMass γAB γC

/-- Gibbs probability of the claim that `A` and `B` are adjacent. -/
noncomputable def gibbsAdjacent (γAB γC : ℝ) : ℝ :=
  adjacentMass γAB γC / partitionMass γAB γC

/-- Gibbs probability of the complementary claim that `C` is in the middle. -/
noncomputable def gibbsMiddle (γAB γC : ℝ) : ℝ :=
  middleMass γAB γC / partitionMass γAB γC

theorem gibbs_state_probability_pos (γAB γC : ℝ) (s : Seating) :
    0 < gibbsStateProbability γAB γC s := by
  exact div_pos (Real.exp_pos _) (partition_mass_pos γAB γC)

theorem gibbs_state_probabilities_sum_to_one (γAB γC : ℝ) :
    (allSeatings.map (gibbsStateProbability γAB γC)).sum = 1 := by
  have hp : partitionMass γAB γC ≠ 0 :=
    ne_of_gt (partition_mass_pos γAB γC)
  simp [allSeatings, gibbsStateProbability, stateWeight, adjacentAB]
  field_simp
  rw [partition_mass_formula]
  ring

theorem gibbs_claims_sum_to_one (γAB γC : ℝ) :
    gibbsAdjacent γAB γC + gibbsMiddle γAB γC = 1 := by
  rw [gibbsAdjacent, gibbsMiddle, adjacent_mass_formula, middle_mass_formula,
    partition_mass_formula]
  have hden : 4 * Real.exp γAB + 2 * Real.exp γC ≠ 0 := by
    positivity
  field_simp

theorem gibbs_adjacent_closed_form (γAB γC : ℝ) :
    gibbsAdjacent γAB γC =
      (2 * Real.exp γAB) / (2 * Real.exp γAB + Real.exp γC) := by
  rw [gibbsAdjacent, adjacent_mass_formula, partition_mass_formula]
  have hA : Real.exp γAB ≠ 0 := ne_of_gt (Real.exp_pos γAB)
  have hC : Real.exp γC ≠ 0 := ne_of_gt (Real.exp_pos γC)
  field_simp
  ring

/-- Finite Gibbs parameters never give a proper claim probability zero or one. -/
theorem gibbs_adjacent_interior (γAB γC : ℝ) :
    0 < gibbsAdjacent γAB γC ∧ gibbsAdjacent γAB γC < 1 := by
  rw [gibbs_adjacent_closed_form]
  have hden : 0 < 2 * Real.exp γAB + Real.exp γC := by
    positivity
  constructor
  · exact div_pos (by positivity) hden
  · rw [div_lt_one hden]
    nlinarith [Real.exp_pos γC]

theorem gibbs_adjacent_baseline : gibbsAdjacent 0 0 = 2 / 3 := by
  rw [gibbs_adjacent_closed_form]
  norm_num

/-- A common shift is unidentifiable: only `γAB - γC` affects the result. -/
theorem gibbs_adjacent_common_shift (γAB γC t : ℝ) :
    gibbsAdjacent (γAB + t) (γC + t) = gibbsAdjacent γAB γC := by
  rw [gibbs_adjacent_closed_form, gibbs_adjacent_closed_form]
  simp only [Real.exp_add]
  have ht : Real.exp t ≠ 0 := ne_of_gt (Real.exp_pos t)
  have hleft :
      2 * (Real.exp γAB * Real.exp t) + Real.exp γC * Real.exp t ≠ 0 := by
    positivity
  have hright : 2 * Real.exp γAB + Real.exp γC ≠ 0 := by
    positivity
  field_simp

noncomputable def sigmoid (x : ℝ) : ℝ :=
  1 / (1 + Real.exp (-x))

theorem gibbs_adjacent_sigmoid (γAB γC : ℝ) :
    gibbsAdjacent γAB γC = sigmoid (Real.log 2 + γAB - γC) := by
  rw [gibbs_adjacent_closed_form]
  unfold sigmoid
  rw [show -(Real.log 2 + γAB - γC) = γC - γAB - Real.log 2 by ring]
  rw [Real.exp_sub, Real.exp_sub, Real.exp_log (by norm_num : (0 : ℝ) < 2)]
  have hA : Real.exp γAB ≠ 0 := ne_of_gt (Real.exp_pos γAB)
  have hC : Real.exp γC ≠ 0 := ne_of_gt (Real.exp_pos γC)
  field_simp

/-- Uniformity is preserved inside `D_AB`; all four states retain equal probability. -/
theorem adjacent_state_probabilities_equal (γAB γC : ℝ) {s t : Seating}
    (hs : adjacentAB s = true) (ht : adjacentAB t = true) :
    gibbsStateProbability γAB γC s = gibbsStateProbability γAB γC t := by
  simp [gibbsStateProbability, stateWeight, hs, ht]

/-- Uniformity is preserved inside `D_C`; its two states retain equal probability. -/
theorem middle_state_probabilities_equal (γAB γC : ℝ) {s t : Seating}
    (hs : cInMiddle s = true) (ht : cInMiddle t = true) :
    gibbsStateProbability γAB γC s = gibbsStateProbability γAB γC t := by
  have hs' : adjacentAB s = false := by
    cases s <;> simp_all [adjacentAB, cInMiddle]
  have ht' : adjacentAB t = false := by
    cases t <;> simp_all [adjacentAB, cInMiddle]
  simp [gibbsStateProbability, stateWeight, hs', ht']

/-- The hard-implementation information cost of `D_AB`, expressed in nats. -/
theorem adjacent_information_cost :
    -Real.log ((2 : ℝ) / 3) = Real.log ((3 : ℝ) / 2) := by
  rw [show (2 : ℝ) / 3 = ((3 : ℝ) / 2)⁻¹ by norm_num, Real.log_inv]
  ring

/-- The hard-implementation information cost of `D_C`, expressed in nats. -/
theorem middle_information_cost :
    -Real.log ((1 : ℝ) / 3) = Real.log 3 := by
  rw [show (1 : ℝ) / 3 = (3 : ℝ)⁻¹ by norm_num, Real.log_inv]
  ring

/-- Locking one of the six states has finite cost `log 6`, not infinite cost. -/
theorem singleton_information_cost :
    -Real.log ((1 : ℝ) / 6) = Real.log 6 := by
  rw [show (1 : ℝ) / 6 = (6 : ℝ)⁻¹ by norm_num, Real.log_inv]
  ring

end SeatAllocation
