import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { http, HttpResponse } from "msw";
import { server } from "../msw/server.js";
import { RequesterProvider } from "../../src/context/RequesterContext.js";
import { AttachmentSection } from "../../src/components/tickets/AttachmentSection.js";
import type { TicketDetailAttachment } from "../../src/api/ticketDetail.js";
import { formatDateTime } from "../../src/lib/format.js";

const API_URL = "http://localhost:3000";

const activeAttachment: TicketDetailAttachment = {
  id: 1,
  originalFilename: "evidence.pdf",
  mimeType: "application/pdf",
  sizeBytes: 20480,
  uploadedAt: "2026-08-24T10:00:00.000Z",
  uploadedByName: "Aran Suksawat",
  removedAt: null,
  removedByName: null,
  removalReason: null,
};

const removedAttachment: TicketDetailAttachment = {
  id: 2,
  originalFilename: "old.pdf",
  mimeType: "application/pdf",
  sizeBytes: 10240,
  uploadedAt: "2026-08-20T10:00:00.000Z",
  uploadedByName: "Aran Suksawat",
  removedAt: "2026-08-21T10:00:00.000Z",
  removedByName: "Aran Suksawat",
  removalReason: "Superseded by evidence.pdf",
};

// Stands in for the parent Ticket Detail page, which passes onChange to
// trigger a real refetch — here we just update local state the way that
// refetch eventually would, so the test observes the same re-render path.
function Harness({ initial }: { initial: TicketDetailAttachment[] }) {
  const [attachments, setAttachments] = useState(initial);
  return (
    <AttachmentSection
      ticketId={1}
      attachments={attachments}
      onChange={() =>
        setAttachments((prev) =>
          prev.map((a) =>
            a.id === 1
              ? { ...a, removedAt: "2026-08-24T11:00:00.000Z", removalReason: "Wrong file, replaced." }
              : a,
          ),
        )
      }
    />
  );
}

function renderSection(initial: TicketDetailAttachment[]) {
  sessionStorage.setItem(
    "toktickit:lab2:selectedRequester",
    JSON.stringify({ id: 1, fullName: "Aran Suksawat" }),
  );
  return render(
    <RequesterProvider>
      <Harness initial={initial} />
    </RequesterProvider>,
  );
}

describe("AttachmentSection", () => {
  beforeEach(() => {
    // jsdom doesn't implement the Blob URL APIs the real download flow uses.
    URL.createObjectURL = vi.fn(() => "blob:mock") as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  // UI-13
  it("shows a working Download button on the active row and the reason instead of actions on the removed row", () => {
    renderSection([activeAttachment, removedAttachment]);

    expect(screen.getByText("evidence.pdf")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^download$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^remove$/i })).toBeInTheDocument();

    expect(screen.getByText("old.pdf")).toBeInTheDocument();
    expect(screen.getByText(/superseded by evidence\.pdf/i)).toBeInTheDocument();
  });

  // UI-16 — BR-23 requires a removed attachment to keep showing filename,
  // size, uploader, removal reason AND removal time. The reason alone used to
  // be rendered, which met the wording of AC-08 but not BR-23.
  it("keeps filename, size, uploader, removal reason and removal time on a removed row", () => {
    renderSection([removedAttachment]);

    const row = screen.getByText("old.pdf").closest(".zen-attachment-row");
    expect(row).not.toBeNull();
    const text = row!.textContent ?? "";

    expect(text).toContain("old.pdf");
    expect(text).toMatch(/10(\.0)? KB/i);
    expect(text).toContain("Aran Suksawat");
    expect(text).toContain("Superseded by evidence.pdf");
    // the removal timestamp, not just the upload one
    expect(text).toContain(formatDateTime(removedAttachment.removedAt!));
    expect(formatDateTime(removedAttachment.removedAt!)).not.toBe(
      formatDateTime(removedAttachment.uploadedAt),
    );
  });

  // UI-17 — BR-23: an active row names its uploader too.
  it("names the uploader on an active row", () => {
    renderSection([activeAttachment]);
    const row = screen.getByText("evidence.pdf").closest(".zen-attachment-row");
    expect(row!.textContent ?? "").toMatch(/uploaded .* by Aran Suksawat/i);
  });

  // UI-14
  it("blocks removal without a reason and sends no DELETE request", async () => {
    let deleteCalled = false;
    server.use(
      http.delete(`${API_URL}/api/attachments/1`, () => {
        deleteCalled = true;
        return HttpResponse.json({});
      }),
    );

    const user = userEvent.setup();
    renderSection([activeAttachment]);

    await user.click(screen.getByRole("button", { name: /^remove$/i }));
    await user.click(screen.getByRole("button", { name: /confirm removal/i }));

    expect(await screen.findByText(/reason must be 5-200 characters/i)).toBeInTheDocument();
    expect(deleteCalled).toBe(false);
  });

  // UI-15
  it("removes an attachment with a valid reason and shows the Removed badge + reason", async () => {
    server.use(
      http.delete(`${API_URL}/api/attachments/1`, async ({ request }) => {
        const body = (await request.json()) as { removalReason: string };
        return HttpResponse.json({
          id: 1,
          removedAt: "2026-08-24T11:00:00.000Z",
          removalReason: body.removalReason,
        });
      }),
    );

    const user = userEvent.setup();
    renderSection([activeAttachment]);

    await user.click(screen.getByRole("button", { name: /^remove$/i }));
    await user.type(screen.getByLabelText(/reason for removal/i), "Wrong file, replaced by a better one.");
    await user.click(screen.getByRole("button", { name: /confirm removal/i }));

    expect(await screen.findByText("Removed")).toBeInTheDocument();
    expect(screen.getByText(/wrong file, replaced\./i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^download$/i })).not.toBeInTheDocument();
  });
});
