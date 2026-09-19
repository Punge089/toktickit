import { FormEvent, useState } from "react";
import { Entry } from "../../api/entries.js";
import { formatDateTime } from "../../lib/format.js";
import { Alert } from "../ui/Alert.js";
import { Button } from "../ui/Button.js";
import { RoleBadge } from "../ui/Badge.js";

interface EntryThreadProps {
  kind: "public" | "internal";
  entries: Entry[];
  /** When false the composer is replaced by `readOnlyNote` (terminal Ticket, Administrator). */
  canPost: boolean;
  readOnlyNote?: string;
  onPost: (body: string) => Promise<void>;
}

const MAX_LENGTH = 2000;

// Issue 66 - one thread renderer for Public Comments and Internal Notes
// (docs/lab-03/ui-spec.md section 6, 8). Internal Notes get a visibly
// different panel, a lock label, and a differently-styled button so private
// text cannot be posted publicly by mistake. Bodies render as plain text
// (BR-26): React escapes them and `pre-wrap` keeps line breaks.
export function EntryThread({ kind, entries, canPost, readOnlyNote, onPost }: EntryThreadProps) {
  const internal = kind === "internal";
  const [text, setText] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) {
      setError("Text cannot be empty.");
      return;
    }
    if (trimmed.length > MAX_LENGTH) {
      setError(`Text must be at most ${MAX_LENGTH} characters.`);
      return;
    }
    setPosting(true);
    setError(null);
    try {
      await onPost(trimmed);
      setText("");
    } catch (err) {
      // The text is kept so nothing typed is lost after a failed post.
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setPosting(false);
    }
  }

  const label = internal ? "Add Internal Note" : "Add Public Comment";

  return (
    <div className={internal ? "zen-entry-panel zen-entry-internal" : "zen-entry-panel"}>
      {internal && (
        <p className="zen-entry-lock">
          <span role="img" aria-label="Internal note, not visible to requester">
            🔒
          </span>{" "}
          Internal - not visible to requester
        </p>
      )}

      {canPost ? (
        <form onSubmit={handleSubmit} noValidate>
          <div className="zen-field">
            <label className="zen-field-label" htmlFor={`entry-${kind}`}>
              {label}
            </label>
            <textarea
              id={`entry-${kind}`}
              className="zen-field-control"
              rows={3}
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={posting}
              placeholder={internal ? "Write a private note for IT Staff…" : "Type your comment here…"}
            />
            <p className="zen-field-caption">{text.length}/{MAX_LENGTH}</p>
          </div>
          {error && <Alert tone="error">{error}</Alert>}
          <Button
            type="submit"
            variant={internal ? "secondary" : "primary"}
            busy={posting}
            busyText="Posting…"
            disabled={text.trim().length === 0}
          >
            {internal ? "Save Internal Note" : "Post Comment"}
          </Button>
        </form>
      ) : (
        readOnlyNote && <p style={{ color: "var(--zen-text-muted)" }}>{readOnlyNote}</p>
      )}

      {entries.length === 0 ? (
        <p style={{ color: "var(--zen-text-muted)" }}>{internal ? "No internal notes yet." : "No comments yet."}</p>
      ) : (
        <ul className="zen-entry-list">
          {entries.map((e) => (
            <li key={e.id} className="zen-entry">
              <div className="zen-entry-head">
                <strong>{e.authorName}</strong> <RoleBadge role={e.authorRole} />
                <span className="zen-entry-time">{formatDateTime(e.createdAt)}</span>
              </div>
              <div className="zen-entry-body">{e.body}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
