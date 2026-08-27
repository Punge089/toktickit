import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useRequester } from "../context/RequesterContext.js";
import { fetchCategories, fetchRelatedSystems, Category, RelatedSystem } from "../api/reference.js";
import { fetchMyTickets, MyTicketsResult } from "../api/myTickets.js";
import { Select } from "../components/ui/Select.js";
import { Button } from "../components/ui/Button.js";
import { Alert } from "../components/ui/Alert.js";
import { Spinner } from "../components/ui/Spinner.js";
import { EmptyState } from "../components/ui/EmptyState.js";
import { PriorityBadge, StatusBadge } from "../components/ui/Badge.js";

const SORT_OPTIONS = [
  { value: "createdAt:desc", label: "Newest first" },
  { value: "createdAt:asc", label: "Oldest first" },
  { value: "ticketNumber:asc", label: "Ticket Number (A-Z)" },
  { value: "requestedPriority:desc", label: "Priority (High to Low)" },
];

const PAGE_SIZE_OPTIONS = [
  { value: "10", label: "10 per page" },
  { value: "20", label: "20 per page" },
  { value: "50", label: "50 per page" },
];

const PRIORITY_OPTIONS = [
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
  { value: "URGENT", label: "Urgent" },
];

type ListState = "loading" | "loaded" | "error";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

// Issue 29 — My Tickets screen (ui-spec.md §7): search, filters, sort,
// pagination, Create Ticket action, and loading/empty/no-results/failure
// states, scoped to the currently selected Requester (BR-09).
export function MyTicketsPage() {
  const { requester } = useRequester();

  const [categories, setCategories] = useState<Category[]>([]);
  const [relatedSystems, setRelatedSystems] = useState<RelatedSystem[]>([]);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [relatedSystemId, setRelatedSystemId] = useState("");
  const [requestedPriority, setRequestedPriority] = useState("");
  const [sort, setSort] = useState("createdAt:desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [listState, setListState] = useState<ListState>("loading");
  const [result, setResult] = useState<MyTicketsResult | null>(null);

  useEffect(() => {
    fetchCategories().then(setCategories).catch(() => setCategories([]));
    fetchRelatedSystems().then(setRelatedSystems).catch(() => setRelatedSystems([]));
  }, []);

  // Search is debounced; every other control refetches immediately.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (!requester) return;
    let cancelled = false;
    setListState("loading");
    fetchMyTickets(requester.id, {
      search: debouncedSearch || undefined,
      categoryId: categoryId || undefined,
      relatedSystemId: relatedSystemId || undefined,
      requestedPriority: requestedPriority || undefined,
      sort,
      page,
      pageSize,
    })
      .then((res) => {
        if (cancelled) return;
        setResult(res);
        setListState("loaded");
      })
      .catch(() => {
        if (!cancelled) setListState("error");
      });
    return () => {
      cancelled = true;
    };
    // Re-fetches whenever the selected Requester changes (BR-07), not just
    // on mount.
  }, [requester?.id, debouncedSearch, categoryId, relatedSystemId, requestedPriority, sort, page, pageSize]);

  function resetToFirstPage() {
    setPage(1);
  }

  const hasActiveFilters = Boolean(
    search || categoryId || relatedSystemId || requestedPriority || sort !== "createdAt:desc",
  );

  function clearFilters() {
    setSearch("");
    setDebouncedSearch("");
    setCategoryId("");
    setRelatedSystemId("");
    setRequestedPriority("");
    setSort("createdAt:desc");
    setPage(1);
  }

  const isEmptyAccount =
    listState === "loaded" &&
    result !== null &&
    result.data.length === 0 &&
    !result.meta.appliedFilters.search &&
    !result.meta.appliedFilters.categoryId &&
    !result.meta.appliedFilters.relatedSystemId &&
    !result.meta.appliedFilters.requestedPriority;

  const isNoResults = listState === "loaded" && result !== null && result.data.length === 0 && !isEmptyAccount;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--zen-space-3)", marginBottom: "var(--zen-space-4)" }}>
        <h1 style={{ fontSize: "var(--zen-fs-h1)", margin: 0 }}>My Tickets</h1>
        <Link to="/tickets/new" className="zen-btn zen-btn-primary">
          Create Ticket
        </Link>
      </div>

      <div className="zen-tickets-controls">
        <div className="zen-field" style={{ marginBottom: 0, minWidth: 220, flex: "1 1 220px" }}>
          <label className="zen-field-label" htmlFor="my-tickets-search">
            Search
          </label>
          <input
            id="my-tickets-search"
            className="zen-field-control"
            type="search"
            placeholder="Ticket number or summary"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              resetToFirstPage();
            }}
          />
        </div>

        <Select
          label="Category"
          value={categoryId}
          onChange={(e) => {
            setCategoryId(e.target.value);
            resetToFirstPage();
          }}
          options={[
            { value: "", label: "All categories" },
            ...categories.map((c) => ({ value: String(c.id), label: c.name })),
          ]}
        />
        <Select
          label="Related System"
          value={relatedSystemId}
          onChange={(e) => {
            setRelatedSystemId(e.target.value);
            resetToFirstPage();
          }}
          options={[
            { value: "", label: "All related systems" },
            ...relatedSystems.map((s) => ({ value: String(s.id), label: s.name })),
          ]}
        />
        <Select
          label="Priority"
          value={requestedPriority}
          onChange={(e) => {
            setRequestedPriority(e.target.value);
            resetToFirstPage();
          }}
          options={[{ value: "", label: "All priorities" }, ...PRIORITY_OPTIONS]}
        />
        <Select
          label="Sort"
          value={sort}
          onChange={(e) => {
            setSort(e.target.value);
            resetToFirstPage();
          }}
          options={SORT_OPTIONS}
        />

        {hasActiveFilters && (
          <Button variant="tertiary" onClick={clearFilters}>
            Clear filters
          </Button>
        )}
      </div>

      {listState === "loading" && <Spinner label="Loading your tickets…" />}

      {listState === "error" && (
        <Alert tone="error">Unable to load your tickets. Please try again.</Alert>
      )}

      {isEmptyAccount && (
        <EmptyState
          title="No tickets yet"
          description="You haven't created any tickets."
          action={
            <Link to="/tickets/new" className="zen-btn zen-btn-primary">
              Create your first ticket
            </Link>
          }
        />
      )}

      {isNoResults && (
        <EmptyState
          title="No tickets match your search"
          description="Try a different search term or clear your filters."
          action={
            <Button variant="secondary" onClick={clearFilters}>
              Clear filters
            </Button>
          }
        />
      )}

      {listState === "loaded" && result !== null && result.data.length > 0 && (
        <>
          <div className="zen-tickets-list">
            <div className="zen-ticket-header" aria-hidden="true">
              <span>Ticket Number</span>
              <span>Summary</span>
              <span className="zen-ticket-cell-category">Category</span>
              <span>Priority</span>
              <span>Status</span>
              <span>Last Updated</span>
            </div>
            {result.data.map((ticket) => (
              <Link key={ticket.id} to={`/tickets/${ticket.id}`} className="zen-ticket-row">
                <span>{ticket.ticketNumber}</span>
                <span className="zen-ticket-cell-summary" title={ticket.summary}>
                  {ticket.summary}
                </span>
                <span className="zen-ticket-cell-category">{ticket.categoryName}</span>
                <span>
                  <PriorityBadge priority={ticket.requestedPriority} />
                </span>
                <span>
                  <StatusBadge status={ticket.currentStatus} />
                </span>
                <span>{formatDate(ticket.updatedAt)}</span>
              </Link>
            ))}
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--zen-space-3)", marginTop: "var(--zen-space-4)", flexWrap: "wrap" }}>
            <span style={{ color: "var(--zen-text-muted)", fontSize: "var(--zen-fs-caption)" }}>
              Showing {(result.meta.page - 1) * result.meta.pageSize + 1}
              -{Math.min(result.meta.page * result.meta.pageSize, result.meta.totalItems)} of{" "}
              {result.meta.totalItems}
            </span>

            <div style={{ display: "flex", alignItems: "center", gap: "var(--zen-space-3)" }}>
              <Select
                label="Page size"
                value={String(pageSize)}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  resetToFirstPage();
                }}
                options={PAGE_SIZE_OPTIONS}
              />
              <Button
                variant="secondary"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Prev
              </Button>
              <span>
                Page {result.meta.page} of {result.meta.totalPages}
              </span>
              <Button
                variant="secondary"
                disabled={page >= result.meta.totalPages}
                onClick={() => setPage((p) => Math.min(result.meta.totalPages, p + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
