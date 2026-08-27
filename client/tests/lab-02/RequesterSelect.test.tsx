import { describe, it, expect, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { http, HttpResponse } from "msw";
import { server } from "../msw/server.js";
import { RequesterProvider } from "../../src/context/RequesterContext.js";
import { AppRouter } from "../../src/AppRouter.js";

const API_URL = "http://localhost:3000";

function renderApp(initialPath = "/tickets") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <RequesterProvider>
        <AppRouter />
      </RequesterProvider>
    </MemoryRouter>,
  );
}

describe("Development Requester Selection", () => {
  afterEach(() => {
    sessionStorage.clear();
  });

  // UI-01
  it("redirects to /select-requester when no Requester is selected and a guarded route is visited", async () => {
    renderApp("/tickets");
    expect(
      await screen.findByText(/select a development requester to test requester-specific/i),
    ).toBeInTheDocument();
  });

  it("does not redirect once a Requester is already stored (guard passes through)", async () => {
    sessionStorage.setItem(
      "toktickit:lab2:selectedRequester",
      JSON.stringify({ id: 1, fullName: "Aran Suksawat" }),
    );
    renderApp("/tickets");
    expect(await screen.findByRole("heading", { name: /my tickets/i })).toBeInTheDocument();
  });

  // UI-02
  it("shows an empty state (not an empty dropdown) when there are no active Requesters", async () => {
    server.use(http.get(`${API_URL}/api/dev-requesters`, () => HttpResponse.json([])));

    renderApp("/select-requester");

    expect(
      await screen.findByText(/no active development requesters are available/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /continue/i })).not.toBeInTheDocument();
  });

  // UI-03
  it("shows a safe failure state with a Retry action when the API call fails", async () => {
    server.use(
      http.get(`${API_URL}/api/dev-requesters`, () => HttpResponse.json(null, { status: 500 })),
    );

    renderApp("/select-requester");

    expect(await screen.findByText(/unable to load development requesters/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("lists active Requesters and enables Continue only once one is chosen", async () => {
    renderApp("/select-requester");

    const select = await screen.findByLabelText(/development requester/i);
    const continueButton = screen.getByRole("button", { name: /continue/i });
    expect(continueButton).toBeDisabled();

    await import("@testing-library/user-event").then(({ default: userEvent }) =>
      userEvent.setup().selectOptions(select, "1"),
    );

    expect(continueButton).toBeEnabled();
  });
});
