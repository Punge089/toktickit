import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { http, HttpResponse } from "msw";
import { server } from "../msw/server.js";
import { AuthProvider } from "../../src/context/AuthContext.js";
import { AppRouter } from "../../src/AppRouter.js";

const API_URL = "http://localhost:3000";

const FIRST_LOGIN_USER = {
  id: 6,
  fullName: "Ekkachai Mai",
  email: "ekkachai.mai@example.dev",
  role: "REQUESTER" as const,
  mustChangePassword: true,
};

function renderFirstLogin() {
  server.use(http.get(`${API_URL}/api/auth/me`, () => HttpResponse.json(FIRST_LOGIN_USER)));
  return render(
    <MemoryRouter initialEntries={["/tickets"]}>
      <AuthProvider>
        <AppRouter />
      </AuthProvider>
    </MemoryRouter>,
  );
}

// docs/lab-03/tests.md UI-04, UI-05 — specification.md BR-08, BR-09, AC-02.
describe("Change Password screen", () => {
  // AC-02 — mandatory first-login redirect
  it("is shown instead of the requested screen when mustChangePassword is true", async () => {
    renderFirstLogin();
    expect(await screen.findByRole("heading", { name: /change your password/i })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /my tickets/i })).not.toBeInTheDocument();
  });

  // UI-04 — each policy rule ticks independently
  it("ticks each password policy rule independently as it becomes true", async () => {
    const user = userEvent.setup();
    renderFirstLogin();
    await screen.findByRole("heading", { name: /change your password/i });

    const newPasswordField = screen.getByLabelText(/^new password/i);
    const list = screen.getByText(/password must have/i).closest("div")!;

    await user.type(newPasswordField, "alllowercase1!");
    expect(list.textContent).toMatch(/✓.*lowercase/i);
    expect(list.textContent).toMatch(/○.*uppercase/i);

    await user.type(newPasswordField, "A");
    expect(list.textContent).toMatch(/✓.*uppercase/i);
  });

  // UI-05 — confirm mismatch blocks submission
  it("disables Continue until the confirmation matches and every policy rule is met", async () => {
    const user = userEvent.setup();
    renderFirstLogin();
    await screen.findByRole("heading", { name: /change your password/i });

    const continueButton = screen.getByRole("button", { name: /continue/i });
    expect(continueButton).toBeDisabled();

    await user.type(screen.getByLabelText(/temporary\) password|^current password/i), "OldTemp1!");
    await user.type(screen.getByLabelText(/^new password/i), "Brand-New1!");
    await user.type(screen.getByLabelText(/^confirm new password/i), "Different1!");
    expect(continueButton).toBeDisabled();
    expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument();

    await user.clear(screen.getByLabelText(/^confirm new password/i));
    await user.type(screen.getByLabelText(/^confirm new password/i), "Brand-New1!");
    expect(continueButton).toBeEnabled();
  });

  it("shows a field-level error when the current password is wrong", async () => {
    server.use(
      http.post(`${API_URL}/api/auth/change-password`, () =>
        HttpResponse.json(
          {
            error: "VALIDATION_FAILED",
            message: "Fix the highlighted fields.",
            fieldErrors: { currentPassword: "Current password is incorrect." },
          },
          { status: 400 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderFirstLogin();
    await screen.findByRole("heading", { name: /change your password/i });

    await user.type(screen.getByLabelText(/temporary\) password|^current password/i), "WrongTemp1!");
    await user.type(screen.getByLabelText(/^new password/i), "Brand-New1!");
    await user.type(screen.getByLabelText(/^confirm new password/i), "Brand-New1!");
    await user.click(screen.getByRole("button", { name: /continue/i }));

    expect(await screen.findByText(/current password is incorrect/i)).toBeInTheDocument();
  });

  it("continues into the app after a successful first-login change", async () => {
    server.use(
      http.post(`${API_URL}/api/auth/change-password`, () =>
        HttpResponse.json({ user: { ...FIRST_LOGIN_USER, mustChangePassword: false } }),
      ),
    );
    const user = userEvent.setup();
    renderFirstLogin();
    await screen.findByRole("heading", { name: /change your password/i });

    // Once changed, /me is re-fetched (refresh()); reflect the update.
    server.use(http.get(`${API_URL}/api/auth/me`, () => HttpResponse.json({ ...FIRST_LOGIN_USER, mustChangePassword: false })));

    await user.type(screen.getByLabelText(/temporary\) password|^current password/i), "OldTemp1!");
    await user.type(screen.getByLabelText(/^new password/i), "Brand-New1!");
    await user.type(screen.getByLabelText(/^confirm new password/i), "Brand-New1!");
    await user.click(screen.getByRole("button", { name: /continue/i }));

    expect(await screen.findByRole("heading", { name: /my tickets/i })).toBeInTheDocument();
  });
});
