export const RATINGS = [1, 2, 3, 4, 5] as const;
export type Rating = (typeof RATINGS)[number];

export type QuestionId = "q1" | "q2" | "q3";

export const QUESTIONS: readonly { id: QuestionId; title: string; short: string; hint: string }[] =
  [
    {
      id: "q1",
      title: "Rate your experience with our product",
      short: "Product experience",
      hint: "Coverage, finish, colour",
    },
    { id: "q2", title: "Rate our customer care", short: "Customer care", hint: "Advice, delivery, support" },
    {
      id: "q3",
      title: "Are you happy with the product?",
      short: "Happy with product",
      hint: "Would you paint with it again?",
    },
  ];

// Each rating is a paint swatch, from Brick Red (1) to Emerald (5).
export const SWATCHES: Record<Rating, { label: string; paint: string; color: string }> = {
  1: { label: "Terrible", paint: "Brick Red", color: "#d64545" },
  2: { label: "Poor", paint: "Burnt Orange", color: "#e8833a" },
  3: { label: "Okay", paint: "Mustard", color: "#e2b33c" },
  4: { label: "Good", paint: "Sage", color: "#6fae5a" },
  5: { label: "Excellent", paint: "Emerald", color: "#2f9e6b" },
};
