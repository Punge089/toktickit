const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export interface TicketListItem {
  id: number;
  ticketNumber: string;
  summary: string;
  categoryId: number;
  categoryName: string;
  requestedPriority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  currentStatus: "NEW";
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

// Issue 29 — GET /api/tickets (api-spec.md §5), owned + paginated.
export async function fetchMyTickets(requesterId: number, query: MyTicketsQuery): Promise<MyTicketsResult> {
  const params = new URLSearchParams();
  if (query.search) params.set("search", query.search);
  if (query.categoryId) params.set("categoryId", query.categoryId);
  if (query.relatedSystemId) params.set("relatedSystemId", query.relatedSystemId);
  if (query.requestedPriority) params.set("requestedPriority", query.requestedPriority);
  if (query.sort) params.set("sort", query.sort);
  if (query.page) params.set("page", String(query.page));
  if (query.pageSize) params.set("pageSize", String(query.pageSize));

  const res = await fetch(`${API_URL}/api/tickets?${params.toString()}`, {
    headers: { "X-Dev-Requester-Id": String(requesterId) },
  });
  if (!res.ok) throw new Error("Unable to load your tickets. Please try again.");
  return res.json();
}
