import { describe, it, expect, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { http, HttpResponse } from "msw";
import { server } from "../msw/server.js";
import { AuthProvider } from "../../src/context/AuthContext.js";
import { CreateTicketPage } from "../../src/pages/CreateTicketPage.js";
import { EntryThread } from "../../src/components/tickets/EntryThread.js";

const API_URL = "http://localhost:3000";

// Two submits that reach the handler in the same tick, before React has re-rendered. A button that is only
// disabled on the next render would let both through; the single-flight guard turns the second one away.
function submitTwiceInOneTick(form: HTMLFormElement) {
  act(() => {
    form.requestSubmit();
    form.requestSubmit();
  });
}

// docs/lab-04/tests.md UI-24 - specification.md BR-38, FR-19, AC-33, AC-34. Create Ticket, Public Comment and
// Internal Note forms: one request per submit however it arrives, and nothing typed is lost after a failure.
describe("Create form hardening", () => {
  it("UI-24: the Public Comment and Internal Note forms post once for a double submit and keep the text after a failure", async () => {
    for (const kind of ["public", "internal"] as const) {
      const label = kind === "public" ? /add public comment/i : /add internal note/i;
      const button = kind === "public" ? /post comment/i : /save internal note/i;
      let release: () => void = () => undefined;
      let fail = true;
      const onPost = vi.fn(
        () =>
          new Promise<void>((resolve, reject) => {
            release = () => (fail ? reject(new Error("Unable to post. Please try again.")) : resolve());
          }),
      );
      const user = userEvent.setup();
      const { container, unmount } = render(<EntryThread kind={kind} entries={[]} canPost onPost={onPost} />);

      await user.type(screen.getByLabelText(label), "The printer is still offline.");
      submitTwiceInOneTick(container.querySelector("form") as HTMLFormElement);
      expect(onPost, `${kind}: two submits in one tick`).toHaveBeenCalledTimes(1);
      expect(screen.getByRole("button", { name: /posting/i })).toBeDisabled();

      await act(async () => release());
      expect(await screen.findByText("Unable to post. Please try again.")).toBeInTheDocument();
      expect(screen.getByLabelText(label)).toHaveValue("The printer is still offline."); // nothing typed is lost

      fail = false;
      await user.click(screen.getByRole("button", { name: button }));
      expect(onPost).toHaveBeenCalledTimes(2); // the retry is a new, single request
      await act(async () => release());
      await waitFor(() => expect(screen.getByLabelText(label)).toHaveValue(""));
      unmount();
    }
  });

  it("UI-24: the Create Ticket form sends one request for a double submit and keeps every value after a failure", async () => {
    let posts = 0;
    let respondWith: "fail" | "ok" = "fail";
    let open: () => void = () => undefined;
    let gate = new Promise<void>((resolve) => (open = resolve));
    server.use(
      http.post(`${API_URL}/api/tickets`, async () => {
        posts += 1;
        await gate; // the response is held until the test lets it go, so "in flight" is deterministic
        return respondWith === "fail"
          ? HttpResponse.json({ error: "INTERNAL_ERROR", message: "Something went wrong. Please try again." }, { status: 500 })
          : HttpResponse.json({ id: 9, ticketNumber: "TKT-2026-000009", attachments: [], attachmentErrors: [] }, { status: 201 });
      }),
    );
    const user = userEvent.setup();
    const { container } = render(
      <MemoryRouter>
        <AuthProvider>
          <CreateTicketPage />
        </AuthProvider>
      </MemoryRouter>,
    );

    await screen.findByLabelText(/category/i);
    await user.type(screen.getByLabelText(/ticket summary/i), "Laptop battery drains quickly");
    await user.type(screen.getByLabelText(/description/i), "The battery on my corporate laptop drains from full to empty within two hours.");
    await user.selectOptions(screen.getByLabelText(/category/i), "2");
    await user.selectOptions(screen.getByLabelText(/related system/i), "2");
    await user.selectOptions(screen.getByLabelText(/requested priority/i), "MEDIUM");

    submitTwiceInOneTick(container.querySelector("form") as HTMLFormElement);
    await waitFor(() => expect(posts).toBe(1));
    expect(screen.getByRole("button", { name: /submitting/i })).toBeDisabled();
    open();

    // The failure leaves the form as it was.
    await screen.findByText(/something went wrong|unable to create/i);
    expect(posts).toBe(1);
    expect(screen.getByLabelText(/ticket summary/i)).toHaveValue("Laptop battery drains quickly");
    expect(screen.getByLabelText(/category/i)).toHaveValue("2");

    respondWith = "ok";
    gate = Promise.resolve();
    await user.click(screen.getByRole("button", { name: /submit ticket/i }));
    expect(await screen.findByText("TKT-2026-000009")).toBeInTheDocument();
    expect(posts).toBe(2); // exactly one request per submit
  });
});
