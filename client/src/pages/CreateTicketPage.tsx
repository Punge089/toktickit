import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useRequester } from "../context/RequesterContext.js";
import { fetchCategories, fetchRelatedSystems, Category, RelatedSystem } from "../api/reference.js";
import { createTicket, CreateTicketResult, ValidationError } from "../api/tickets.js";
import { checkAttachmentFile, MAX_ACTIVE_ATTACHMENTS } from "../lib/attachmentRules.js";
import { TextField } from "../components/ui/TextField.js";
import { TextArea } from "../components/ui/TextArea.js";
import { Select } from "../components/ui/Select.js";
import { Button } from "../components/ui/Button.js";
import { Alert } from "../components/ui/Alert.js";
import { Spinner } from "../components/ui/Spinner.js";

const PRIORITY_OPTIONS = [
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
  { value: "URGENT", label: "Urgent" },
];

type ReferenceState = "loading" | "loaded" | "error";

// Issue 27 — Create Ticket screen (ui-spec.md §6). System-generated fields
// near the top (read-only), classification fields grouped, Summary/
// Description given room, Attachments below, primary/secondary actions at
// the bottom.
export function CreateTicketPage() {
  const { requester } = useRequester();

  const [categories, setCategories] = useState<Category[]>([]);
  const [relatedSystems, setRelatedSystems] = useState<RelatedSystem[]>([]);
  const [referenceState, setReferenceState] = useState<ReferenceState>("loading");

  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [relatedSystemId, setRelatedSystemId] = useState("");
  const [requestedPriority, setRequestedPriority] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [attachmentPickerErrors, setAttachmentPickerErrors] = useState<string[]>([]);

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<CreateTicketResult | null>(null);

  useEffect(() => {
    setReferenceState("loading");
    Promise.all([fetchCategories(), fetchRelatedSystems()])
      .then(([cats, systems]) => {
        setCategories(cats);
        setRelatedSystems(systems);
        setReferenceState("loaded");
      })
      .catch(() => setReferenceState("error"));
  }, []);

  function handleFilesSelected(e: ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = ""; // allow re-selecting a file with the same name later

    const errors: string[] = [];
    const accepted: File[] = [];

    for (const file of picked) {
      if (files.length + accepted.length >= MAX_ACTIVE_ATTACHMENTS) {
        errors.push(`${file.name} was not added: a Ticket allows at most ${MAX_ACTIVE_ATTACHMENTS} attachments.`);
        continue;
      }
      const check = checkAttachmentFile(file);
      if (!check.ok) {
        errors.push(check.message);
        continue;
      }
      accepted.push(file);
    }

    if (accepted.length > 0) setFiles((prev) => [...prev, ...accepted]);
    setAttachmentPickerErrors(errors);
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  function validate(): Record<string, string> {
    const errors: Record<string, string> = {};
    const trimmedSummary = summary.trim();
    if (trimmedSummary.length < 5 || trimmedSummary.length > 120) {
      errors.summary = "Summary must be 5-120 characters.";
    }
    const trimmedDescription = description.trim();
    if (trimmedDescription.length < 20 || trimmedDescription.length > 4000) {
      errors.description = "Description must be 20-4000 characters.";
    }
    if (!categoryId) errors.categoryId = "Select a category.";
    if (!relatedSystemId) errors.relatedSystemId = "Select a related system.";
    if (!requestedPriority) errors.requestedPriority = "Select a requested priority.";
    return errors;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!requester) return;

    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return; // AC-04 — no request sent on client-side validation failure

    setSubmitting(true);
    setSubmitError(null);
    try {
      const created = await createTicket({
        requesterId: requester.id,
        summary,
        description,
        categoryId,
        relatedSystemId,
        requestedPriority,
        files,
      });
      setResult(created);
    } catch (err) {
      if (err instanceof ValidationError) {
        setFieldErrors(err.fieldErrors); // BR-18 — entered values are untouched either way
      } else {
        setSubmitError(err instanceof Error ? err.message : "Unable to create the ticket. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  function resetForm() {
    setSummary("");
    setDescription("");
    setCategoryId("");
    setRelatedSystemId("");
    setRequestedPriority("");
    setFiles([]);
    setAttachmentPickerErrors([]);
    setFieldErrors({});
    setSubmitError(null);
    setResult(null);
  }

  if (result) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--zen-space-4)", maxWidth: 560 }}>
        <Alert tone="success">
          <p style={{ margin: 0 }}>Ticket created. Your Ticket Number is:</p>
          <p style={{ margin: "4px 0 0", fontSize: "var(--zen-fs-h1)", fontWeight: 700 }}>
            {result.ticketNumber}
          </p>
        </Alert>

        {result.attachmentErrors.length > 0 && (
          <Alert tone="warning">
            {result.attachmentErrors.length} attachment(s) could not be added (
            {result.attachmentErrors.map((a) => a.originalFilename).join(", ")}). You can add them
            again from Ticket Detail.
          </Alert>
        )}

        <div style={{ display: "flex", gap: "var(--zen-space-3)" }}>
          <Link to={`/tickets/${result.id}`} className="zen-btn zen-btn-primary">
            View Ticket
          </Link>
          <Button variant="tertiary" onClick={resetForm}>
            Create Another
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={{ maxWidth: 720 }} noValidate>
      <h1 style={{ fontSize: "var(--zen-fs-h1)" }}>Create Ticket</h1>

      {submitError && <Alert tone="error">{submitError}</Alert>}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "var(--zen-space-3)",
        }}
      >
        <TextField
          label="Ticket Number"
          readOnly
          value="(assigned after submission)"
          readOnlyReason="System-generated after you submit."
        />
        <TextField
          label="Ticket Date"
          readOnly
          value="(set on submission)"
          readOnlyReason="System-generated after you submit."
        />
        <TextField
          label="Requester"
          readOnly
          value={requester?.fullName ?? ""}
          readOnlyReason="From your Development Requester selection."
        />
      </div>

      {referenceState === "loading" && <Spinner label="Loading categories and related systems…" />}
      {referenceState === "error" && (
        <Alert tone="error">Unable to load categories and related systems. Please reload the page.</Alert>
      )}

      {referenceState === "loaded" && (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: "var(--zen-space-3)",
            }}
          >
            <Select
              label="Category"
              required
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              placeholder="Select a category"
              error={fieldErrors.categoryId}
              options={categories.map((c) => ({ value: String(c.id), label: c.name }))}
              disabled={submitting}
            />
            <Select
              label="Related System"
              required
              value={relatedSystemId}
              onChange={(e) => setRelatedSystemId(e.target.value)}
              placeholder="Select a related system"
              error={fieldErrors.relatedSystemId}
              options={relatedSystems.map((s) => ({ value: String(s.id), label: s.name }))}
              disabled={submitting}
            />
            <Select
              label="Requested Priority"
              required
              value={requestedPriority}
              onChange={(e) => setRequestedPriority(e.target.value)}
              placeholder="Select a priority"
              error={fieldErrors.requestedPriority}
              options={PRIORITY_OPTIONS}
              disabled={submitting}
            />
          </div>

          <TextField
            label="Ticket Summary"
            required
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            error={fieldErrors.summary}
            caption={`${summary.length}/120`}
            disabled={submitting}
          />

          <TextArea
            label="Description"
            required
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            error={fieldErrors.description}
            caption={`${description.length}/4000`}
            disabled={submitting}
          />

          <div className="zen-field">
            <label className="zen-field-label" htmlFor="attachments-input">
              Attachments
            </label>
            <p className="zen-field-caption">
              JPG, PNG, WEBP, or PDF. Max 5MB each, up to {MAX_ACTIVE_ATTACHMENTS} files. {files.length}/
              {MAX_ACTIVE_ATTACHMENTS} attached.
            </p>
            <input
              id="attachments-input"
              type="file"
              multiple
              accept=".jpg,.jpeg,.png,.webp,.pdf"
              onChange={handleFilesSelected}
              disabled={submitting || files.length >= MAX_ACTIVE_ATTACHMENTS}
            />
            {attachmentPickerErrors.map((msg, i) => (
              <p key={i} className="zen-field-error" role="alert">
                {msg}
              </p>
            ))}
            {files.length > 0 && (
              <ul style={{ listStyle: "none", padding: 0, margin: "var(--zen-space-2) 0 0" }}>
                {files.map((file, i) => (
                  <li
                    key={`${file.name}-${i}`}
                    style={{ display: "flex", alignItems: "center", gap: "var(--zen-space-2)" }}
                  >
                    <span>{file.name}</span>
                    <button
                      type="button"
                      className="zen-btn zen-btn-tertiary"
                      aria-label={`Remove ${file.name}`}
                      title={`Remove ${file.name}`}
                      onClick={() => removeFile(i)}
                      disabled={submitting}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div style={{ display: "flex", gap: "var(--zen-space-3)", marginTop: "var(--zen-space-4)" }}>
            <Button type="submit" variant="primary" busy={submitting} busyText="Submitting…">
              Submit Ticket
            </Button>
            <Button type="button" variant="tertiary" onClick={resetForm} disabled={submitting}>
              Cancel
            </Button>
          </div>
        </>
      )}
    </form>
  );
}
