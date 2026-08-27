import { describe, it, expect, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { http, HttpResponse, delay } from "msw";
import { server } from "../msw/server.js";
import { RequesterProvider } from "../../src/context/RequesterContext.js";
import { CreateTicketPage } from "../../src/pages/CreateTicketPage.js";

const API_URL = "http://localhost:3000";

function renderPage() {
  sessionStorage.setItem(
    "toktickit:lab2:selectedRequester",
    JSON.stringify({ id: 1, fullName: "Aran Suksawat" }),
  );
  return render(
    <MemoryRouter>
      <RequesterProvider>
        <CreateTicketPage />
      </RequesterProvider>
    </MemoryRouter>,
  );
}

async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByLabelText(/category/i); // wait for reference data to load
  await user.type(screen.getByLabelText(/ticket summary/i), "Laptop battery drains quickly");
  await user.type(
    screen.getByLabelText(/description/i),
    "The battery on my corporate laptop drains from full to empty within about two hours.",
  );
  await user.selectOptions(screen.getByLabelText(/category/i), "2");
  await user.selectOptions(screen.getByLabelText(/related system/i), "2");
  await user.selectOptions(screen.getByLabelText(/requested priority/i), "MEDIUM");
}

describe("Create Ticket screen", () => {
  afterEach(() => {
    sessionStorage.clear();
  });

  // UI-04
  it("shows a field-level message and sends no request when Summary is empty", async () => {
    const user = userEvent.setup();
    let submitCalled = false;
    server.use(
      http.post(`${API_URL}/api/tickets`, () => {
        submitCalled = true;
        return HttpResponse.json({}, { status: 201 });
      }),
    );

    renderPage();
    await screen.findByLabelText(/category/i);
    await user.click(screen.getByRole("button", { name: /submit ticket/i }));

    expect(await screen.findByText(/summary must be 5-120 characters/i)).toBeInTheDocument();
    expect(submitCalled).toBe(false);
  });

  // UI-05
  it("shows a failure banner and keeps every entered value when the request fails", async () => {
    server.use(http.post(`${API_URL}/api/tickets`, () => HttpResponse.error()));

    const user = userEvent.setup();
    renderPage();
    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: /submit ticket/i }));

    expect(await screen.findByText(/unable to connect to toktickit api/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/ticket summary/i)).toHaveValue("Laptop battery drains quickly");
    expect(screen.getByLabelText(/category/i)).toHaveValue("2");
  });

  // UI-06
  it("shows a busy state on Submit and disables it while the request is in flight", async () => {
    server.use(
      http.post(`${API_URL}/api/tickets`, async () => {
        await delay(50);
        return HttpResponse.json(
          {
            id: 1,
            ticketNumber: "TKT-2026-000001",
            attachments: [],
            attachmentErrors: [],
          },
          { status: 201 },
        );
      }),
    );

    const user = userEvent.setup();
    renderPage();
    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: /submit ticket/i }));

    expect(screen.getByRole("button", { name: /submitting/i })).toBeDisabled();
    await waitFor(() => expect(screen.getByText("TKT-2026-000001")).toBeInTheDocument());
  });

  // UI-07
  it("shows the confirmation panel with the generated Ticket Number on success", async () => {
    const user = userEvent.setup();
    renderPage();
    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: /submit ticket/i }));

    expect(await screen.findByText("TKT-2026-000042")).toBeInTheDocument();
  });

  // UI-08
  it("rejects an oversized file client-side before any request is sent", async () => {
    let uploadAttempted = false;
    server.use(
      http.post(`${API_URL}/api/tickets`, () => {
        uploadAttempted = true;
        return HttpResponse.json({}, { status: 201 });
      }),
    );

    const user = userEvent.setup();
    renderPage();
    await screen.findByLabelText(/category/i);

    const oversized = new File([new Uint8Array(6 * 1024 * 1024)], "huge.jpg", { type: "image/jpeg" });
    const input = document.getElementById("attachments-input") as HTMLInputElement;
    await user.upload(input, oversized);

    expect(await screen.findByText(/huge\.jpg exceeds the 5mb limit/i)).toBeInTheDocument();
    expect(screen.queryByText("huge.jpg")).not.toBeInTheDocument(); // not added to the selected-files list
    expect(uploadAttempted).toBe(false);
  });
});
