// Issue 66 — shared handling for Public Comments and Internal Notes
// (specification.md BR-24..BR-27): same body rules, same response shape.
export const MAX_ENTRY_LENGTH = 2000;

export function validateEntryBody(raw: unknown): { ok: true; body: string } | { ok: false; message: string } {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return { ok: false, message: "Text cannot be empty." };
  }
  const body = raw.trim();
  if (body.length > MAX_ENTRY_LENGTH) {
    return { ok: false, message: `Text must be at most ${MAX_ENTRY_LENGTH} characters.` };
  }
  return { ok: true, body };
}

export function serializeEntry(e: {
  id: number;
  authorId: number;
  body: string;
  createdAt: Date;
  author: { fullName: string; role: string };
}) {
  return {
    id: e.id,
    authorId: e.authorId,
    authorName: e.author.fullName,
    authorRole: e.author.role,
    body: e.body,
    createdAt: e.createdAt,
  };
}
