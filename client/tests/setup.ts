import "@testing-library/jest-dom";
import { afterAll, afterEach, beforeAll } from "vitest";
import { server } from "./msw/server.js";

// Issue 25 — msw intercepts fetch at the network boundary so component
// tests exercise the real fetch-based API client code, not a stubbed
// function. onUnhandledRequest "error" surfaces a forgotten handler loudly
// instead of letting a real network call slip through in tests.
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
