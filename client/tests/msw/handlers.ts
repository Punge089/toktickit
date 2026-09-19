import { http, HttpResponse } from "msw";

const API_URL = "http://localhost:3000";

// Issue 64 — default authenticated identity for every component test.
// Individual tests override this with server.use(...) for the
// unauthenticated/other-role/failure states they need to exercise.
export const DEFAULT_USER = {
  id: 1,
  fullName: "Aran Suksawat",
  email: "aran.suksawat@example.dev",
  role: "REQUESTER" as const,
  mustChangePassword: false,
};

// Default handlers — individual tests override these with server.use(...)
// for empty/failure/etc. states.
export const handlers = [
  // Issue 64 — GET /api/auth/me (api-spec.md §3). Every screen under
  // RequireAuth calls this on mount; tests override it with
  // HttpResponse.json(null, { status: 401 }) to exercise the
  // unauthenticated/redirect-to-login path.
  http.get(`${API_URL}/api/auth/me`, () => HttpResponse.json(DEFAULT_USER)),

  http.post(`${API_URL}/api/auth/login`, async ({ request }) => {
    const body = (await request.json()) as { email?: string; password?: string };
    if (body.email === DEFAULT_USER.email && body.password === "Correct-Pass1!") {
      return HttpResponse.json({ user: DEFAULT_USER });
    }
    return HttpResponse.json({ error: "INVALID_CREDENTIALS", message: "Invalid email or password." }, { status: 401 });
  }),

  http.post(`${API_URL}/api/auth/logout`, () => new HttpResponse(null, { status: 204 })),

  http.post(`${API_URL}/api/auth/change-password`, () => HttpResponse.json({ user: { ...DEFAULT_USER, mustChangePassword: false } })),

  // Issue 65 — IT Staff Ticket Queue (api-spec.md §8, §10). Default: an
  // empty queue, so tests that only need the page to mount don't have to
  // override anything.
  http.get(`${API_URL}/api/staff/tickets`, ({ request }) => {
    const url = new URL(request.url);
    return HttpResponse.json({
      items: [],
      page: 1,
      pageSize: Number(url.searchParams.get("pageSize") ?? "10"),
      totalItems: 0,
      totalPages: 1,
      sort: "createdAt:desc",
      appliedFilters: { search: null, status: null, itPriority: null, categoryId: null, owner: null },
    });
  }),
  http.get(`${API_URL}/api/staff/assignable-users`, () =>
    HttpResponse.json([
      { id: 8, fullName: "Jennifer Anderson" },
      { id: 9, fullName: "Michael Brown" },
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
        itPriority: "MEDIUM",
        currentStatus: "NEW",
        createdAt: "2026-08-24T10:15:00.000Z",
        updatedAt: "2026-08-24T10:15:00.000Z",
        attachments: [],
        attachmentErrors: [],
      },
      { status: 201 },
    ),
  ),

  // Issue 29/64 — GET /api/tickets. Ownership now comes from the session
  // (mocked as DEFAULT_USER above), not a per-request header.
  http.get(`${API_URL}/api/tickets`, ({ request }) => {
    const url = new URL(request.url);
    const page = Number(url.searchParams.get("page") ?? "1");
    const pageSize = Number(url.searchParams.get("pageSize") ?? "10");

    const rows = [
      { id: 1, ticketNumber: "TKT-2026-000001", summary: "Requester A ticket one" },
      { id: 2, ticketNumber: "TKT-2026-000002", summary: "Requester A ticket two" },
    ];

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

  // Issue 30/64 — GET /api/tickets/:id. id 1 exists and is owned by the
  // mocked session user; anything else 404s (BR-10/BR-28).
  http.get(`${API_URL}/api/tickets/:id`, ({ params }) => {
    if (params.id !== "1") {
      return HttpResponse.json({ error: "TICKET_NOT_FOUND", message: "Ticket not found." }, { status: 404 });
    }
    return HttpResponse.json({
      id: 1,
      ticketNumber: "TKT-2026-000001",
      requesterId: 1,
      requesterName: "Aran Suksawat",
      summary: "Laptop battery drains quickly",
      description: "The battery on my corporate laptop drains quickly.",
      categoryId: 1,
      categoryName: "Hardware",
      relatedSystemId: 1,
      relatedSystemName: "Corporate Laptop",
      requestedPriority: "MEDIUM",
      itPriority: "MEDIUM",
      currentStatus: "NEW",
      createdAt: "2026-08-24T10:00:00.000Z",
      updatedAt: "2026-08-24T10:00:00.000Z",
      attachments: [
        {
          id: 1,
          originalFilename: "battery-log.pdf",
          mimeType: "application/pdf",
          sizeBytes: 20480,
          uploadedAt: "2026-08-24T10:05:00.000Z",
          removedAt: null,
          removalReason: null,
        },
      ],
    });
  }),
];
