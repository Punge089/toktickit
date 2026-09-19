// Issue 65 — IT Staff Ticket Queue query parsing (docs/lab-03/api-spec.md
// §8, labsheet §6.3). Pure function so the validation rules can be unit
// tested without a database (docs/lab-03/tests.md UNIT-04).
export const QUEUE_STATUSES = [
  "NEW",
  "OPEN",
  "IN_PROGRESS",
  "WAITING_FOR_REQUESTER",
  "RESOLVED",
  "CLOSED",
  "REOPENED",
  "CANCELLED",
] as const;
export const QUEUE_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
export const QUEUE_SORT_FIELDS = ["createdAt", "updatedAt", "ticketNumber", "itPriority", "currentStatus"] as const;
export const QUEUE_PAGE_SIZES = [10, 20, 50] as const;
export const MAX_SEARCH_LENGTH = 100;

export type QueueStatus = (typeof QUEUE_STATUSES)[number];
export type QueuePriority = (typeof QUEUE_PRIORITIES)[number];
export type QueueSortField = (typeof QUEUE_SORT_FIELDS)[number];
export type QueueOwnerFilter = { kind: "me" } | { kind: "unassigned" } | { kind: "user"; id: number };

export interface QueueQuery {
  search: string | null;
  status: QueueStatus | null;
  itPriority: QueuePriority | null;
  categoryId: number | null;
  owner: QueueOwnerFilter | null;
  sortField: QueueSortField;
  sortDir: "asc" | "desc";
  page: number;
  pageSize: number;
}

export type QueueQueryResult =
  | { ok: true; value: QueueQuery }
  | { ok: false; fieldErrors: Record<string, string> };

function positiveInt(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

// Every invalid parameter is reported by name (BR-37, api-spec.md §8) —
// never silently ignored or clamped.
export function parseQueueQuery(q: Record<string, unknown>): QueueQueryResult {
  const fieldErrors: Record<string, string> = {};
  const single = (name: string): string | undefined => {
    const raw = q[name];
    if (raw === undefined) return undefined;
    if (typeof raw !== "string") {
      fieldErrors[name] = `${name} must be a single value.`;
      return undefined;
    }
    return raw;
  };

  const value: QueueQuery = {
    search: null,
    status: null,
    itPriority: null,
    categoryId: null,
    owner: null,
    sortField: "createdAt",
    sortDir: "desc",
    page: 1,
    pageSize: 10,
  };

  const search = single("search");
  if (search !== undefined) {
    const trimmed = search.trim();
    if (trimmed.length > MAX_SEARCH_LENGTH) {
      fieldErrors.search = `search must be at most ${MAX_SEARCH_LENGTH} characters.`;
    } else if (trimmed.length > 0) {
      value.search = trimmed;
    }
  }

  const status = single("status");
  if (status !== undefined) {
    if ((QUEUE_STATUSES as readonly string[]).includes(status)) value.status = status as QueueStatus;
    else fieldErrors.status = `status must be one of ${QUEUE_STATUSES.join(", ")}.`;
  }

  const itPriority = single("itPriority");
  if (itPriority !== undefined) {
    if ((QUEUE_PRIORITIES as readonly string[]).includes(itPriority)) value.itPriority = itPriority as QueuePriority;
    else fieldErrors.itPriority = `itPriority must be one of ${QUEUE_PRIORITIES.join(", ")}.`;
  }

  const categoryId = single("categoryId");
  if (categoryId !== undefined) {
    const n = positiveInt(categoryId);
    if (n === null) fieldErrors.categoryId = "categoryId must be a positive integer.";
    else value.categoryId = n;
  }

  const owner = single("owner");
  if (owner !== undefined) {
    if (owner === "me") value.owner = { kind: "me" };
    else if (owner === "unassigned") value.owner = { kind: "unassigned" };
    else {
      const n = positiveInt(owner);
      if (n === null) fieldErrors.owner = "owner must be me, unassigned, or a positive integer user id.";
      else value.owner = { kind: "user", id: n };
    }
  }

  const sort = single("sort");
  if (sort !== undefined) {
    const [field, dir, ...extra] = sort.split(":");
    const fieldOk = (QUEUE_SORT_FIELDS as readonly string[]).includes(field);
    const dirOk = dir === undefined || dir === "asc" || dir === "desc";
    if (!fieldOk || !dirOk || extra.length > 0) {
      fieldErrors.sort = `sort must be one of ${QUEUE_SORT_FIELDS.join(", ")}, optionally suffixed :asc or :desc.`;
    } else {
      value.sortField = field as QueueSortField;
      value.sortDir = (dir as "asc" | "desc" | undefined) ?? "desc";
    }
  }

  const page = single("page");
  if (page !== undefined) {
    const n = positiveInt(page);
    if (n === null) fieldErrors.page = "page must be a positive integer.";
    else value.page = n;
  }

  const pageSize = single("pageSize");
  if (pageSize !== undefined) {
    const n = positiveInt(pageSize);
    if (n === null || !(QUEUE_PAGE_SIZES as readonly number[]).includes(n)) {
      fieldErrors.pageSize = "pageSize must be 10, 20, or 50.";
    } else {
      value.pageSize = n;
    }
  }

  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };
  return { ok: true, value };
}
