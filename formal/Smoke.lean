import Mathlib

/- A tiny end-to-end check that Mathlib tactics elaborate and the Lean kernel
   accepts the resulting proof without `sorry`. -/
theorem square_expansion (a b : ℝ) :
    (a + b) ^ 2 = a ^ 2 + 2 * a * b + b ^ 2 := by
  ring

#print axioms square_expansion
