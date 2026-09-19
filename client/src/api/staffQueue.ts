import { apiFetch } from "./http.js";
import { TicketStatus } from "../components/ui/Badge.js";

export type Priority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

export interface QueueItem {
  id: number;
  ticketNumber: string;
  createdAt: string;
  updatedAt: string;
  summary: string;
  categoryName: string;
  requestedPriority: Priority;
  itPriority: Priority;
  currentStatus: TicketStatus;
  owner: { id: number; fullName: string; isActive: boolean } | null;
  requesterName: string;
  requesterResolvedAt: string | null;
}

export interface QueueResult {
  items: QueueItem[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  sort: string;
  appliedFilters: {
    search: string | null;
    status: string | null;
    itPriority: string | null;
    categoryId: number | null;
    owner: string | null;
  };
}

export interface QueueQuery {
  search?: string;
  status?: string;
  itPriority?: string;
  categoryId?: string;
  owner?: string;
  sort?: string;
  page?: number;
  pageSize?: number;
}

// Thrown on 403 so the page can show the Forbidden state instead of a
// generic failure (docs/lab-03/ui-spec.md §7).
export class ForbiddenError extends Error {}

// Issue 65 — GET /api/staff/tickets (api-spec.md §8).
export async function fetchQueue(query: QueueQuery): Promise<QueueResult> {
  const params = new URLSearchParams();
  if (query.search) params.set("search", query.search);
  if (query.status) params.set("status", query.status);
  if (query.itPriority) params.set("itPriority", query.itPriority);
  if (query.categoryId) params.set("categoryId", query.categoryId);
  if (query.owner) params.set("owner", query.owner);
  if (query.sort) params.set("sort", query.sort);
  if (query.page) params.set("page", String(query.page));
  if (query.pageSize) params.set("pageSize", String(query.pageSize));

  const res = await apiFetch(`/api/staff/tickets?${params.toString()}`);
  if (res.status === 403) throw new ForbiddenError("Forbidden");
  if (!res.ok) throw new Error("Unable to load the ticket queue. Please try again.");
  return res.json();
}

// Issue 65 — GET /api/staff/assignable-users (api-spec.md §10); feeds the
// Owner filter.
export async function fetchAssignableUsers(): Promise<{ id: number; fullName: string }[]> {
  const res = await apiFetch("/api/staff/assignable-users");
  if (!res.ok) throw new Error("Unable to load IT Staff.");
  return res.json();
}
