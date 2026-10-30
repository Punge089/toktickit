import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { http, HttpResponse } from "msw";
import { server } from "../msw/server.js";
import { AuthProvider } from "../../src/context/AuthContext.js";
import { AppRouter } from "../../src/AppRouter.js";
import userEvent from "@testing-library/user-event";
import { ActionForm } from "../../src/components/actions/ActionForm.js";
import { EntryThread } from "../../src/components/tickets/EntryThread.js";
import { ActionStatusBadge, FollowUpMarker } from "../../src/components/ui/Badge.js";

// docs/lab-04/tests.md STY-01 to STY-04 - specification.md BR-10, BR-40; ui-spec.md sections 1, 4.1.
// Asserts on the class and attribute contract of the Lab 4 components, not pixels.
describe("Lab 4 style contract", () => {
  it("STY-01: the four Action statuses and the follow-up marker each have their own class and visible text", () => {
    const { container } = render(
      <>
        <ActionStatusBadge status="PLANNED" />
        <ActionStatusBadge status="IN_PROGRESS" />
        <ActionStatusBadge status="COMPLETED" />
        <ActionStatusBadge status="CANCELLED" />
        <FollowUpMarker />
      </>,
    );
    const badges = Array.from(container.querySelectorAll(".zen-badge"));
    expect(badges.map((b) => b.textContent?.replace("✓", "").trim())).toEqual(["Planned", "In Progress", "Completed", "Cancelled"]);
    expect(new Set(badges.map((b) => b.className)).size).toBe(4);
    for (const b of badges) expect(b.textContent?.trim().length).toBeGreaterThan(0); // text, never colour alone
    expect(badges[2].textContent).toContain("✓"); // Completed also carries a check
    expect(container.querySelector(".zen-followup-marker")).toHaveTextContent("Follow-up needed");
  });

  it("STY-02: the Lab 4 stylesheet sections use only --zen-* tokens, never a colour literal", () => {
    const css = readFileSync(path.resolve(process.cwd(), "src/styles/zen-green.css"), "utf-8");
    const start = css.indexOf("(Lab 4,");
    expect(start, "the Lab 4 section marker is missing").toBeGreaterThan(-1);
    const lab4 = css.slice(start);
    expect(lab4.length).toBeGreaterThan(500);
    expect(lab4.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([]);
    expect(lab4.match(/\b(rgb|rgba|hsl|hsla)\(/g) ?? []).toEqual([]);
    expect(lab4).toContain("var(--zen-");
  });

  it("STY-03: the Action form is labelled as visible to the Requester, and Internal Notes keep their own lock label", () => {
    const noop = async () => {};
    render(
      <>
        <ActionForm
          ticketId={5}
          mode="create"
          staff={[{ id: 8, fullName: "Jennifer Anderson" }]}
          defaultAssigneeId={8}
          loadLatest={async () => null}
          onSaved={() => undefined}
          onCancel={() => undefined}
          onOutOfDate={() => undefined}
        />
        <EntryThread kind="internal" entries={[]} canPost onPost={noop} />
      </>,
    );
    const shared = screen.getByRole("img", { name: "Visible to requester" });
    expect(shared.parentElement).toHaveTextContent("Everything in an Action is visible to the Requester.");
    const lock = screen.getByRole("img", { name: /internal note, not visible to requester/i });
    expect(lock.parentElement).toHaveTextContent("Internal - not visible to requester");
    expect(shared).not.toBe(lock);
  });

  it("STY-04: invalid Action fields carry aria-invalid and aria-describedby, and the form is not a dialog", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <ActionForm
        ticketId={5}
        mode="create"
        staff={[{ id: 8, fullName: "Jennifer Anderson" }]}
        defaultAssigneeId={8}
        loadLatest={async () => null}
        onSaved={() => undefined}
        onCancel={() => undefined}
        onOutOfDate={() => undefined}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Save action" }));

    const description = screen.getByLabelText(/action description/i);
    expect(description).toHaveAttribute("aria-invalid", "true");
    const describedBy = description.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)).toHaveTextContent("Action Description is required.");
    expect(description).toHaveAttribute("aria-required", "true");

    expect(container.querySelector('[role="dialog"], [aria-modal="true"], dialog')).toBeNull();
    expect(screen.getByRole("form", { name: "Add action" })).toBeInTheDocument();
  });

  it("STY-04: the navigation marks exactly one current page and every dashboard card has an accessible name with its figure", async () => {
    server.use(
      http.get("http://localhost:3000/api/auth/me", () =>
        HttpResponse.json({ id: 1, fullName: "Aran Suksawat", email: "a@example.dev", role: "REQUESTER", mustChangePassword: false }),
      ),
    );
    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <AuthProvider>
          <AppRouter />
        </AuthProvider>
      </MemoryRouter>,
    );
    const nav = await screen.findByRole("navigation", { name: "Primary" });
    const current = within(nav).getAllByRole("link").filter((l) => l.hasAttribute("aria-current"));
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveAttribute("aria-current", "page");
    expect(current[0]).toHaveTextContent("Dashboard");

    const cards = await screen.findAllByRole("link", { name: /, view tickets$/ });
    expect(cards.length).toBeGreaterThanOrEqual(4);
    for (const c of cards) expect(c.getAttribute("aria-label")).toMatch(/^.+: \d+, view tickets$/);
  });
});
