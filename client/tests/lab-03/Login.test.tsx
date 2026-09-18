import { describe, it, expect } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { http, HttpResponse, delay } from "msw";
import { server } from "../msw/server.js";
import { AuthProvider } from "../../src/context/AuthContext.js";
import { AppRouter } from "../../src/AppRouter.js";

const API_URL = "http://localhost:3000";

// Every test here starts unauthenticated, matching Login's real entry
// condition; a mocked-authenticated /me would redirect straight past it.
function renderLoggedOut(initialPath = "/login") {
  server.use(http.get(`${API_URL}/api/auth/me`, () => HttpResponse.json(null, { status: 401 })));
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <AuthProvider>
        <AppRouter />
      </AuthProvider>
    </MemoryRouter>,
  );
}

// docs/lab-03/tests.md UI-01, UI-02, UI-03 — specification.md AC-05,
// AC-06, AC-07.
describe("Login screen", () => {
  it("has no 'Forgot your password?' link (specification.md §11 — out of scope)", async () => {
    renderLoggedOut();
    await screen.findByLabelText(/email address/i);
    expect(screen.queryByText(/forgot your password/i)).not.toBeInTheDocument();
  });

  // UI-01, AC-05
  it("shows a generic error and clears the password field on invalid credentials", async () => {
    server.use(
      http.post(`${API_URL}/api/auth/login`, () =>
        HttpResponse.json({ error: "INVALID_CREDENTIALS", message: "Invalid email or password." }, { status: 401 }),
      ),
    );
    const user = userEvent.setup();
    renderLoggedOut();

    await user.type(screen.getByLabelText(/email address/i), "someone@example.dev");
    await user.type(screen.getByLabelText(/^password/i), "wrong-password");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByText(/invalid email or password/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password/i)).toHaveValue("");
  });

  // UI-02, AC-06
  it("shows the inactive-account message distinctly from invalid credentials", async () => {
    server.use(
      http.post(`${API_URL}/api/auth/login`, () =>
        HttpResponse.json(
          { error: "ACCOUNT_INACTIVE", message: "This account is inactive. Contact your administrator." },
          { status: 403 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderLoggedOut();

    await user.type(screen.getByLabelText(/email address/i), "someone@example.dev");
    await user.type(screen.getByLabelText(/^password/i), "Correct-Pass1!");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByText(/this account is inactive/i)).toBeInTheDocument();
  });

  // UI-02, AC-07
  it("shows the rate-limit message on 429", async () => {
    server.use(
      http.post(`${API_URL}/api/auth/login`, () =>
        HttpResponse.json({ error: "TOO_MANY_ATTEMPTS", message: "Too many failed attempts. Try again later." }, { status: 429 }),
      ),
    );
    const user = userEvent.setup();
    renderLoggedOut();

    await user.type(screen.getByLabelText(/email address/i), "someone@example.dev");
    await user.type(screen.getByLabelText(/^password/i), "Correct-Pass1!");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByText(/too many attempts/i)).toBeInTheDocument();
  });

  // UI-03 — Submitting state
  it("shows a busy state on Sign In and disables the fields while the request is in flight", async () => {
    server.use(
      http.post(`${API_URL}/api/auth/login`, async () => {
        await delay(50);
        return HttpResponse.json({ user: { id: 1, fullName: "Aran Suksawat", email: "aran.suksawat@example.dev", role: "REQUESTER", mustChangePassword: false } });
      }),
    );
    const user = userEvent.setup();
    renderLoggedOut();

    await user.type(screen.getByLabelText(/email address/i), "aran.suksawat@example.dev");
    await user.type(screen.getByLabelText(/^password/i), "Correct-Pass1!");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    expect(screen.getByRole("button", { name: /signing in/i })).toBeDisabled();
    await waitFor(() => expect(screen.getByLabelText(/email address/i)).toBeDisabled());
  });

  it("signs in successfully and lands on the Requester's home route", async () => {
    server.use(
      http.post(`${API_URL}/api/auth/login`, () =>
        HttpResponse.json({ user: { id: 1, fullName: "Aran Suksawat", email: "aran.suksawat@example.dev", role: "REQUESTER", mustChangePassword: false } }),
      ),
      http.get(`${API_URL}/api/auth/me`, () =>
        HttpResponse.json({ id: 1, fullName: "Aran Suksawat", email: "aran.suksawat@example.dev", role: "REQUESTER", mustChangePassword: false }),
      ),
    );
    const user = userEvent.setup();
    renderLoggedOut();

    await user.type(screen.getByLabelText(/email address/i), "aran.suksawat@example.dev");
    await user.type(screen.getByLabelText(/^password/i), "Correct-Pass1!");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByRole("heading", { name: /my tickets/i })).toBeInTheDocument();
  });
});
