import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { TextField } from "../../src/components/ui/TextField.js";
import { Button } from "../../src/components/ui/Button.js";
import { AppShell } from "../../src/components/shell/AppShell.js";

// Covers STYLE-01 through STYLE-05 in docs/lab-02/tests.md: asserts on the
// required classes/tokens/attributes of the reusable Zen Green components,
// not on pixel values. Every Lab 2 screen reuses these components, so these
// tests are the single source of truth for the component-level rules in
// docs/lab-02/ui-spec.md §3.
describe("Zen Green component states", () => {
  // STYLE-01
  it("a required field shows the asterisk AND sets aria-required", () => {
    render(<TextField label="Summary" name="summary" required />);
    const input = screen.getByLabelText(/summary/i);
    expect(input).toHaveAttribute("aria-required", "true");
    expect(screen.getByText("*")).toBeInTheDocument();
  });

  // STYLE-02
  it("a read-only field is visually distinct from an editable field", () => {
    const { container: editableContainer } = render(<TextField label="Summary" name="summary" />);
    const { container: readOnlyContainer } = render(
      <TextField label="Ticket Number" name="ticketNumber" readOnly value="(assigned after submission)" />,
    );

    const editableWrapper = editableContainer.querySelector(".zen-field");
    const readOnlyWrapper = readOnlyContainer.querySelector(".zen-field");

    expect(editableWrapper).not.toHaveClass("zen-field-readonly");
    expect(readOnlyWrapper).toHaveClass("zen-field-readonly");
  });

  // STYLE-03
  it("a disabled button is visually distinct and does not fire its handler", async () => {
    const onClick = vi.fn();
    render(
      <Button variant="primary" disabled onClick={onClick}>
        Submit Ticket
      </Button>,
    );
    const button = screen.getByRole("button", { name: /submit ticket/i });
    expect(button).toBeDisabled();

    const user = userEvent.setup();
    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  // STYLE-04
  it("an icon-only control has both an accessible label and a tooltip", () => {
    render(
      <MemoryRouter>
        <AppShell>
          <div />
        </AppShell>
      </MemoryRouter>,
    );
    const hamburger = screen.getByRole("button", { name: /open navigation menu/i });
    expect(hamburger).toHaveAttribute("aria-label");
    expect(hamburger).toHaveAttribute("title");
  });

  // STYLE-05
  it("an invalid field's error message id matches the field's aria-describedby", () => {
    render(
      <TextField label="Summary" name="summary" required error="Summary must be 5-120 characters." />,
    );
    const input = screen.getByLabelText(/summary/i);
    const describedBy = input.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();

    const errorMessage = screen.getByRole("alert");
    expect(errorMessage).toHaveAttribute("id", describedBy);
    expect(errorMessage).toHaveTextContent("Summary must be 5-120 characters.");
  });

  it("a busy button replaces its label and disables itself", () => {
    render(
      <Button variant="primary" busy busyText="Submitting…">
        Submit Ticket
      </Button>,
    );
    expect(screen.queryByText("Submit Ticket")).not.toBeInTheDocument();
    expect(screen.getByText("Submitting…")).toBeInTheDocument();
    expect(screen.getByRole("button")).toBeDisabled();
  });
});
