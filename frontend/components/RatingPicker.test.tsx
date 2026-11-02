import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { RatingPicker } from "./RatingPicker";

describe("RatingPicker", () => {
  it("offers five labelled choices inside a named group", () => {
    render(<RatingPicker name="q1" legend="Rate our product" value={null} onChange={() => {}} />);

    expect(screen.getByRole("radiogroup", { name: "Rate our product" })).toBeInTheDocument();
    const names = screen.getAllByRole("radio").map((r) => r.getAttribute("value"));
    expect(names).toEqual(["1", "2", "3", "4", "5"]);
    expect(screen.getByRole("radio", { name: "Excellent" })).toBeInTheDocument();
  });

  it("reports a tap as a pointer selection", async () => {
    const onChange = vi.fn();
    render(<RatingPicker name="q1" legend="Rate" value={null} onChange={onChange} />);

    await userEvent.click(screen.getByRole("radio", { name: "Good" }));
    expect(onChange).toHaveBeenCalledWith(4, true);
  });

  it("shows the chosen paint swatch name", () => {
    render(<RatingPicker name="q1" legend="Rate" value={5} onChange={() => {}} />);

    expect(screen.getByRole("radio", { name: "Excellent" })).toBeChecked();
    expect(screen.getByText("Emerald: Excellent")).toBeInTheDocument();
  });
});
