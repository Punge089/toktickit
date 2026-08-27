import { ChangeEvent, useState } from "react";
import { useRequester } from "../../context/RequesterContext.js";
import { TicketDetailAttachment } from "../../api/ticketDetail.js";
import { addAttachment, removeAttachment, downloadAttachment } from "../../api/attachments.js";
import { checkAttachmentFile, MAX_ACTIVE_ATTACHMENTS } from "../../lib/attachmentRules.js";
import { formatDateTime, formatSize } from "../../lib/format.js";
import { TextField } from "../ui/TextField.js";
import { Button } from "../ui/Button.js";
import { Alert } from "../ui/Alert.js";
import { Spinner } from "../ui/Spinner.js";
import { AttachmentStateBadge } from "../ui/Badge.js";

interface AttachmentSectionProps {
  ticketId: number;
  attachments: TicketDetailAttachment[];
  /** Re-fetches the parent Ticket Detail after a successful add/remove. */
  onChange: () => void;
}

// Issue 31 — attachment lifecycle UI (ui-spec.md §8): add, download, and
// soft-remove-with-reason, on top of the read-only metadata list Issue 30
// already renders (BR-23: metadata never disappears, active or removed).
export function AttachmentSection({ ticketId, attachments, onChange }: AttachmentSectionProps) {
  const { requester } = useRequester();

  const [pickerError, setPickerError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [removingId, setRemovingId] = useState<number | null>(null);
  const [removalReason, setRemovalReason] = useState("");
  const [removeFieldError, setRemoveFieldError] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const [downloadError, setDownloadError] = useState<string | null>(null);

  const activeCount = attachments.filter((a) => a.removedAt === null).length;
  const atLimit = activeCount >= MAX_ACTIVE_ATTACHMENTS;

  async function handleFileSelected(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !requester) return;

    setPickerError(null);
    setUploadError(null);

    const check = checkAttachmentFile(file);
    if (!check.ok) {
      setPickerError(check.message);
      return;
    }
    if (atLimit) {
      setPickerError(`This ticket already has ${MAX_ACTIVE_ATTACHMENTS} active attachments.`);
      return;
    }

    setUploading(true);
    try {
      await addAttachment(requester.id, ticketId, file);
      onChange();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Unable to add this attachment.");
    } finally {
      setUploading(false);
    }
  }

  function startRemoving(id: number) {
    setRemovingId(id);
    setRemovalReason("");
    setRemoveFieldError(null);
    setRemoveError(null);
  }

  async function confirmRemove(id: number) {
    if (!requester) return;
    const trimmed = removalReason.trim();
    if (trimmed.length < 5 || trimmed.length > 200) {
      setRemoveFieldError("Reason must be 5-200 characters.");
      return;
    }
    setRemoveFieldError(null);
    setRemoveError(null);
    setRemoving(true);
    try {
      await removeAttachment(requester.id, id, trimmed);
      setRemovingId(null);
      onChange();
    } catch (err) {
      setRemoveError(err instanceof Error ? err.message : "Unable to remove this attachment.");
    } finally {
      setRemoving(false);
    }
  }

  async function handleDownload(a: TicketDetailAttachment) {
    if (!requester) return;
    setDownloadError(null);
    try {
      await downloadAttachment(requester.id, a.id, a.originalFilename);
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : "Unable to download this attachment.");
    }
  }

  return (
    <div>
      <div className="zen-field">
        <label className="zen-field-label" htmlFor="add-attachment-input">
          Add attachment
        </label>
        <p className="zen-field-caption">
          JPG, PNG, WEBP, or PDF. Max 5MB. {activeCount}/{MAX_ACTIVE_ATTACHMENTS} active.
        </p>
        <input
          id="add-attachment-input"
          type="file"
          accept=".jpg,.jpeg,.png,.webp,.pdf"
          onChange={handleFileSelected}
          disabled={uploading || atLimit}
        />
        {pickerError && (
          <p className="zen-field-error" role="alert">
            {pickerError}
          </p>
        )}
        {uploading && <Spinner label="Uploading…" />}
      </div>

      {uploadError && <Alert tone="error">{uploadError}</Alert>}
      {downloadError && <Alert tone="error">{downloadError}</Alert>}

      {attachments.length === 0 ? (
        <p style={{ color: "var(--zen-text-muted)" }}>No attachments on this ticket yet.</p>
      ) : (
        <div>
          {attachments.map((a) => {
            const removed = a.removedAt !== null;
            return (
              <div key={a.id} className="zen-attachment-row">
                <span className="zen-attachment-name" title={a.originalFilename}>
                  {a.originalFilename}
                </span>
                <AttachmentStateBadge removed={removed} />
                <span className="zen-attachment-meta">
                  {formatSize(a.sizeBytes)} · uploaded {formatDateTime(a.uploadedAt)}
                </span>

                {!removed && (
                  <>
                    <Button variant="secondary" onClick={() => handleDownload(a)}>
                      Download
                    </Button>
                    <Button variant="destructive" onClick={() => startRemoving(a.id)}>
                      Remove
                    </Button>
                  </>
                )}
                {removed && a.removalReason && (
                  <span className="zen-attachment-meta">Removed: {a.removalReason}</span>
                )}

                {removingId === a.id && (
                  <div style={{ flexBasis: "100%", marginTop: "var(--zen-space-2)" }}>
                    <TextField
                      label="Reason for removal"
                      required
                      value={removalReason}
                      onChange={(e) => setRemovalReason(e.target.value)}
                      error={removeFieldError ?? undefined}
                    />
                    {removeError && <Alert tone="error">{removeError}</Alert>}
                    <div style={{ display: "flex", gap: "var(--zen-space-3)" }}>
                      <Button
                        variant="destructive"
                        busy={removing}
                        busyText="Removing…"
                        onClick={() => confirmRemove(a.id)}
                      >
                        Confirm removal
                      </Button>
                      <Button variant="tertiary" onClick={() => setRemovingId(null)} disabled={removing}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
