import { http, HttpResponse } from "msw";

const API_URL = "http://localhost:3000";

// Default handlers — individual tests override these with server.use(...)
// for empty/failure/etc. states. Issue 25 covers /api/dev-requesters only;
// later issues add handlers for tickets/attachments here.
export const handlers = [
  http.get(`${API_URL}/api/dev-requesters`, () =>
    HttpResponse.json([
      { id: 1, fullName: "Aran Suksawat", email: "aran.suksawat@example.dev" },
      { id: 2, fullName: "Buppha Ratanakorn", email: "buppha.ratanakorn@example.dev" },
    ]),
  ),
];
