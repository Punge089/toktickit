import { apiFetch } from "./http.js";
import { TicketStatus } from "../components/ui/Badge.js";

export interface TicketListItem {
  id: number;
  ticketNumber: string;
  summary: string;
  categoryId: number;
  categoryName: string;
  requestedPriority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  currentStatus: TicketStatus;
  createdAt: string;
  updatedAt: string;
}

export interface TicketListMeta {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  sort: string;
  appliedFilters: {
    search: string | null;
    categoryId: number | null;
    relatedSystemId: number | null;
    requestedPriority: string | null;
    status: string | null;
  };
}

export interface MyTicketsResult {
  data: TicketListItem[];
  meta: TicketListMeta;
}

export interface MyTicketsQuery {
  search?: string;
  categoryId?: string;
  relatedSystemId?: string;
  requestedPriority?: string;
  sort?: string;
  page?: number;
  pageSize?: number;
}

// Issue 29/64 — GET /api/tickets (api-spec.md §5), owned + paginated.
// Ownership now comes from the session (BR-03); no requesterId is sent.
export async function fetchMyTickets(query: MyTicketsQuery): Promise<MyTicketsResult> {
  const params = new URLSearchParams();
  if (query.search) params.set("search", query.search);
  if (query.categoryId) params.set("categoryId", query.categoryId);
  if (query.relatedSystemId) params.set("relatedSystemId", query.relatedSystemId);
  if (query.requestedPriority) params.set("requestedPriority", query.requestedPriority);
  if (query.sort) params.set("sort", query.sort);
  if (query.page) params.set("page", String(query.page));
  if (query.pageSize) params.set("pageSize", String(query.pageSize));

  const res = await apiFetch(`/api/tickets?${params.toString()}`);
  if (!res.ok) throw new Error("Unable to load your tickets. Please try again.");
  return res.json();
}
