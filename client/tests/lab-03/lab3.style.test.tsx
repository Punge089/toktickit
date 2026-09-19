import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { EntryThread } from "../../src/components/tickets/EntryThread.js";
import { RoleBadge, StatusBadge, TicketStatus } from "../../src/components/ui/Badge.js";

// docs/lab-03/tests.md STY-01..STY-03 - ui-spec.md section 1, 8. Asserts on
// the class/attribute contract of the Lab 3 components, not pixels.
describe("Lab 3 style contract", () => {
  const noop = async () => {};

  // STY-01
  it("gives Internal Notes a different panel class and a labelled lock, and Public Comments neither", () => {
    const { container } = render(
      <>
        <div data-testid="pub">
          <EntryThread kind="public" entries={[]} canPost onPost={noop} />
        </div>
        <div data-testid="int">
          <EntryThread kind="internal" entries={[]} canPost onPost={noop} />
        </div>
      </>,
    );
    const pub = screen.getByTestId("pub").firstElementChild!;
    const int = screen.getByTestId("int").firstElementChild!;
    expect(int).toHaveClass("zen-entry-internal");
    expect(pub).not.toHaveClass("zen-entry-internal");
    expect(screen.getByRole("img", { name: /internal note, not visible to requester/i })).toBeInTheDocument();
    expect(container.querySelectorAll('[role="img"]')).toHaveLength(1);

    // the two composers use different button treatments and labels
    expect(screen.getByRole("button", { name: /post comment/i })).toHaveClass("zen-btn-primary");
    expect(screen.getByRole("button", { name: /save internal note/i })).toHaveClass("zen-btn-secondary");
  });

  // STY-02
  it("renders a role badge with visible text and a distinct tone for each of the 3 roles", () => {
    const { container } = render(
      <>
        <RoleBadge role="REQUESTER" />
        <RoleBadge role="IT_STAFF" />
        <RoleBadge role="ADMINISTRATOR" />
      </>,
    );
    const badges = Array.from(container.querySelectorAll(".zen-badge"));
    expect(badges.map((b) => b.textContent)).toEqual(["Requester", "IT Staff", "Administrator"]);
    expect(new Set(badges.map((b) => b.className)).size).toBe(3);
  });

  // STY-03
  it("renders all 8 Ticket statuses with their own label and a known tone class, never unstyled", () => {
    const statuses: TicketStatus[] = [
      "NEW",
      "OPEN",
      "IN_PROGRESS",
      "WAITING_FOR_REQUESTER",
      "RESOLVED",
      "CLOSED",
      "REOPENED",
      "CANCELLED",
    ];
    const { container } = render(
      <>
        {statuses.map((s) => (
          <StatusBadge key={s} status={s} />
        ))}
      </>,
    );
    const badges = Array.from(container.querySelectorAll(".zen-badge"));
    expect(badges).toHaveLength(8);
    expect(badges.map((b) => b.textContent)).toEqual([
      "New",
      "Open",
      "In Progress",
      "Waiting for Requester",
      "Resolved",
      "Closed",
      "Reopened",
      "Cancelled",
    ]);
    for (const b of badges) {
      expect(b.className).toMatch(/zen-badge-(neutral|secondary|warning|success|error|primary)\b/);
      expect(b.className).not.toContain("undefined");
    }
  });
});
