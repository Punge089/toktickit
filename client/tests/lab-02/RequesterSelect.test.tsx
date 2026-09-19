import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { http, HttpResponse } from "msw";
import { server } from "../msw/server.js";
import { AuthProvider } from "../../src/context/AuthContext.js";
import { AppRouter } from "../../src/AppRouter.js";

const API_URL = "http://localhost:3000";

function renderApp(initialPath = "/tickets") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <AuthProvider>
        <AppRouter />
      </AuthProvider>
    </MemoryRouter>,
  );
}

// docs/lab-03/tests.md REG-05 — the Development Requester Selection
// screen and its sessionStorage-based identity are removed entirely
// (BR-39). This file, kept at its Lab 2 path/name, now proves the
// removal and its real Lab 3 replacement instead of testing the removed
// selector's own behavior (UI-01..03 below no longer apply to anything
// that exists).
describe("Development Requester Selection (removed in Issue 64)", () => {
  it("/select-requester no longer exists — direct navigation lands on Login instead", async () => {
    server.use(http.get(`${API_URL}/api/auth/me`, () => HttpResponse.json(null, { status: 401 })));
    renderApp("/select-requester");
    // The old selector heading/copy is gone; the catch-all route renders
    // Not Found rather than the removed screen.
    expect(await screen.findByText(/page not found/i)).toBeInTheDocument();
  });

  it("redirects to /login (not the removed selector) when no session exists and a guarded route is visited", async () => {
    server.use(http.get(`${API_URL}/api/auth/me`, () => HttpResponse.json(null, { status: 401 })));
    renderApp("/tickets");
    expect(await screen.findByRole("heading", { name: /toktickit/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
  });

  it("no longer stores anything under the old sessionStorage key", async () => {
    renderApp("/tickets");
    await screen.findByRole("heading", { name: /my tickets/i });
    expect(sessionStorage.getItem("toktickit:lab2:selectedRequester")).toBeNull();
  });

  it("passes an authenticated session straight through to the requested screen (replaces the old guard-passes-through case)", async () => {
    renderApp("/tickets");
    expect(await screen.findByRole("heading", { name: /my tickets/i })).toBeInTheDocument();
  });
});
