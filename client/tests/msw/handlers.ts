import { http, HttpResponse } from "msw";

const API_URL = "http://localhost:3000";

// Default handlers — individual tests override these with server.use(...)
// for empty/failure/etc. states.
export const handlers = [
  http.get(`${API_URL}/api/dev-requesters`, () =>
    HttpResponse.json([
      { id: 1, fullName: "Aran Suksawat", email: "aran.suksawat@example.dev" },
      { id: 2, fullName: "Buppha Ratanakorn", email: "buppha.ratanakorn@example.dev" },
    ]),
  ),

  // Issue 27
  http.get(`${API_URL}/api/categories`, () =>
    HttpResponse.json([
      { id: 1, name: "Account and Access" },
      { id: 2, name: "Hardware" },
    ]),
  ),
  http.get(`${API_URL}/api/related-systems`, () =>
    HttpResponse.json([
      { id: 1, name: "Email" },
      { id: 2, name: "Corporate Laptop" },
    ]),
  ),
  http.post(`${API_URL}/api/tickets`, () =>
    HttpResponse.json(
      {
        id: 42,
        ticketNumber: "TKT-2026-000042",
        requesterId: 1,
        summary: "Laptop battery drains quickly",
        description: "The battery on my corporate laptop drains quickly.",
        categoryId: 2,
        relatedSystemId: 2,
        requestedPriority: "MEDIUM",
        itPriority: null,
        currentStatus: "NEW",
        createdAt: "2026-08-24T10:15:00.000Z",
        updatedAt: "2026-08-24T10:15:00.000Z",
        attachments: [],
        attachmentErrors: [],
      },
      { status: 201 },
    ),
  ),

  // Issue 29 — GET /api/tickets. Returns different fixtures per requester
  // so the Requester-switch test doesn't need an override.
  http.get(`${API_URL}/api/tickets`, ({ request }) => {
    const url = new URL(request.url);
    const requesterId = request.headers.get("X-Dev-Requester-Id");
    const page = Number(url.searchParams.get("page") ?? "1");
    const pageSize = Number(url.searchParams.get("pageSize") ?? "10");

    const byRequester: Record<string, { id: number; ticketNumber: string; summary: string }[]> = {
      "1": [
        { id: 1, ticketNumber: "TKT-2026-000001", summary: "Requester A ticket one" },
        { id: 2, ticketNumber: "TKT-2026-000002", summary: "Requester A ticket two" },
      ],
      "2": [{ id: 3, ticketNumber: "TKT-2026-000003", summary: "Requester B ticket one" }],
    };
    const rows = byRequester[requesterId ?? ""] ?? [];

    return HttpResponse.json({
      data: rows.map((r) => ({
        ...r,
        categoryId: 1,
        categoryName: "Hardware",
        requestedPriority: "MEDIUM",
        currentStatus: "NEW",
        createdAt: "2026-08-24T10:00:00.000Z",
        updatedAt: "2026-08-24T10:00:00.000Z",
      })),
      meta: {
        page,
        pageSize,
        totalItems: rows.length,
        totalPages: 1,
        sort: "createdAt:desc",
        appliedFilters: {
          search: url.searchParams.get("search"),
          categoryId: null,
          relatedSystemId: null,
          requestedPriority: null,
          status: null,
        },
      },
    });
  }),
];
