import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchCategories, Category } from "../api/reference.js";
import { fetchQueue, fetchAssignableUsers, ForbiddenError, QueueResult } from "../api/staffQueue.js";
import { formatDateTime } from "../lib/format.js";
import { Select } from "../components/ui/Select.js";
import { Button } from "../components/ui/Button.js";
import { Alert } from "../components/ui/Alert.js";
import { Spinner } from "../components/ui/Spinner.js";
import { EmptyState } from "../components/ui/EmptyState.js";
import { Badge, PriorityBadge, StatusBadge } from "../components/ui/Badge.js";

const STATUS_OPTIONS = [
  { value: "NEW", label: "New" },
  { value: "OPEN", label: "Open" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "WAITING_FOR_REQUESTER", label: "Waiting for Requester" },
  { value: "RESOLVED", label: "Resolved" },
  { value: "CLOSED", label: "Closed" },
  { value: "REOPENED", label: "Reopened" },
  { value: "CANCELLED", label: "Cancelled" },
];

const PRIORITY_OPTIONS = [
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
  { value: "URGENT", label: "Urgent" },
];

const SORT_OPTIONS = [
  { value: "createdAt:desc", label: "Newest first" },
  { value: "createdAt:asc", label: "Oldest first" },
  { value: "updatedAt:desc", label: "Recently updated" },
  { value: "ticketNumber:asc", label: "Ticket Number (A-Z)" },
  { value: "itPriority:desc", label: "IT Priority (High to Low)" },
  { value: "currentStatus:asc", label: "Status" },
];

const PAGE_SIZE_OPTIONS = [
  { value: "10", label: "10 per page" },
  { value: "20", label: "20 per page" },
  { value: "50", label: "50 per page" },
];

type ListState = "loading" | "loaded" | "error" | "forbidden";

// Issue 65 — IT Staff Ticket Queue (docs/lab-03/ui-spec.md §7): search,
// Status / IT Priority / Category / Owner filters, sorting, pagination,
// ownership and status visibility, an Open action per row, and
// loading/empty/no-results/forbidden/failure feedback. One set of DOM rows
// is a table at >=992px and cards below, purely via CSS.
export function StaffTicketQueuePage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [staff, setStaff] = useState<{ id: number; fullName: string }[]>([]);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState("");
  const [itPriority, setItPriority] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [owner, setOwner] = useState("");
  const [sort, setSort] = useState("createdAt:desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [listState, setListState] = useState<ListState>("loading");
  const [result, setResult] = useState<QueueResult | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    fetchCategories().then(setCategories).catch(() => setCategories([]));
    fetchAssignableUsers().then(setStaff).catch(() => setStaff([]));
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    setListState("loading");
    fetchQueue({
      search: debouncedSearch || undefined,
      status: status || undefined,
      itPriority: itPriority || undefined,
      categoryId: categoryId || undefined,
      owner: owner || undefined,
      sort,
      page,
      pageSize,
    })
      .then((res) => {
        if (cancelled) return;
        setResult(res);
        setListState("loaded");
      })
      .catch((err) => {
        if (cancelled) return;
        setListState(err instanceof ForbiddenError ? "forbidden" : "error");
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedSearch, status, itPriority, categoryId, owner, sort, page, pageSize, reloadKey]);

  const hasActiveFilters = Boolean(search || status || itPriority || categoryId || owner || sort !== "createdAt:desc");

  function clearFilters() {
    setSearch("");
    setDebouncedSearch("");
    setStatus("");
    setItPriority("");
    setCategoryId("");
    setOwner("");
    setSort("createdAt:desc");
    setPage(1);
  }

  const isEmptyQueue =
    listState === "loaded" &&
    result !== null &&
    result.items.length === 0 &&
    !result.appliedFilters.search &&
    !result.appliedFilters.status &&
    !result.appliedFilters.itPriority &&
    !result.appliedFilters.categoryId &&
    !result.appliedFilters.owner;
  const isNoResults = listState === "loaded" && result !== null && result.items.length === 0 && !isEmptyQueue;

  function onFilter(setter: (v: string) => void) {
    return (e: { target: { value: string } }) => {
      setter(e.target.value);
      setPage(1);
    };
  }

  return (
    <div>
      <h1 style={{ fontSize: "var(--zen-fs-h1)", marginTop: 0 }}>Ticket Queue</h1>

      {listState === "forbidden" ? (
        <Alert tone="error">You don't have access to the ticket queue.</Alert>
      ) : (
        <>
          <div className="zen-queue-search-row">
            <div className="zen-field" style={{ marginBottom: 0, flex: "1 1 240px" }}>
              <label className="zen-field-label" htmlFor="queue-search">
                Search
              </label>
              <input
                id="queue-search"
                className="zen-field-control"
                type="search"
                placeholder="Number, summary, requester"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <Button
              variant="secondary"
              className="zen-queue-filters-toggle"
              aria-expanded={filtersOpen}
              onClick={() => setFiltersOpen((open) => !open)}
            >
              Filters
            </Button>
          </div>

          <div className={["zen-tickets-controls", "zen-queue-filters", filtersOpen ? "zen-queue-filters-open" : ""].join(" ")}>
            <Select
              label="Status"
              value={status}
              onChange={onFilter(setStatus)}
              options={[{ value: "", label: "All statuses" }, ...STATUS_OPTIONS]}
            />
            <Select
              label="IT Priority"
              value={itPriority}
              onChange={onFilter(setItPriority)}
              options={[{ value: "", label: "All priorities" }, ...PRIORITY_OPTIONS]}
            />
            <Select
              label="Category"
              value={categoryId}
              onChange={onFilter(setCategoryId)}
              options={[{ value: "", label: "All categories" }, ...categories.map((c) => ({ value: String(c.id), label: c.name }))]}
            />
            <Select
              label="Owner"
              value={owner}
              onChange={onFilter(setOwner)}
              options={[
                { value: "", label: "All owners" },
                { value: "me", label: "Me" },
                { value: "unassigned", label: "Unassigned" },
                ...staff.map((u) => ({ value: String(u.id), label: u.fullName })),
              ]}
            />
            <Select label="Sort" value={sort} onChange={onFilter(setSort)} options={SORT_OPTIONS} />
            {hasActiveFilters && (
              <Button variant="tertiary" onClick={clearFilters}>
                Clear filters
              </Button>
            )}
          </div>

          {listState === "loading" && <Spinner label="Loading the ticket queue…" />}

          {listState === "error" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--zen-space-3)" }}>
              <Alert tone="error">Unable to load the ticket queue. Please try again.</Alert>
              <div>
                <Button variant="secondary" onClick={() => setReloadKey((k) => k + 1)}>
                  Retry
                </Button>
              </div>
            </div>
          )}

          {isEmptyQueue && <EmptyState title="No tickets yet" description="There are no tickets in the queue." />}

          {isNoResults && (
            <EmptyState
              title="No tickets match your filters"
              description="Try a different search term or clear your filters."
              action={
                <Button variant="secondary" onClick={clearFilters}>
                  Clear filters
                </Button>
              }
            />
          )}

          {listState === "loaded" && result !== null && result.items.length > 0 && (
            <>
              <p style={{ color: "var(--zen-text-muted)", fontSize: "var(--zen-fs-caption)" }}>
                Showing {(result.page - 1) * result.pageSize + 1}-
                {Math.min(result.page * result.pageSize, result.totalItems)} of {result.totalItems} tickets
              </p>

              <div className="zen-tickets-list">
                <div className="zen-queue-header" aria-hidden="true">
                  <span>Ticket No.</span>
                  <span>Created</span>
                  <span>Summary</span>
                  <span>Category</span>
                  <span>Req. Priority</span>
                  <span>IT Priority</span>
                  <span>Status</span>
                  <span>Owner</span>
                  <span>Last Updated</span>
                  <span />
                </div>
                {result.items.map((t) => (
                  <Link key={t.id} to={`/staff/tickets/${t.id}`} className="zen-queue-row">
                    <span className="zen-queue-cell-number">{t.ticketNumber}</span>
                    <span className="zen-queue-cell-created">{formatDateTime(t.createdAt)}</span>
                    <span className="zen-queue-cell-summary" title={t.summary}>
                      {t.summary}
                    </span>
                    <span className="zen-queue-cell-category">{t.categoryName}</span>
                    <span className="zen-queue-cell-req">
                      <span className="zen-queue-mini-label">Req: </span>
                      <PriorityBadge priority={t.requestedPriority} />
                    </span>
                    <span className="zen-queue-cell-it">
                      <span className="zen-queue-mini-label">IT: </span>
                      <PriorityBadge priority={t.itPriority} />
                    </span>
                    <span className="zen-queue-cell-status">
                      <StatusBadge status={t.currentStatus} />
                      {t.requesterResolvedAt && <Badge tone="success">✓ Requester reports resolved</Badge>}
                    </span>
                    <span className="zen-queue-cell-owner">
                      {t.owner ? (
                        <>
                          {t.owner.fullName}
                          {!t.owner.isActive && " (inactive)"}
                        </>
                      ) : (
                        <em style={{ color: "var(--zen-text-muted)" }}>Unassigned</em>
                      )}
                    </span>
                    <span className="zen-queue-cell-updated">{formatDateTime(t.updatedAt)}</span>
                    <span className="zen-queue-cell-open">Open</span>
                  </Link>
                ))}
              </div>

              <div className="zen-queue-pager">
                <Select
                  label="Page size"
                  value={String(pageSize)}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                  options={PAGE_SIZE_OPTIONS}
                />
                <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                  Prev
                </Button>
                <span>
                  Page {result.page} of {result.totalPages}
                </span>
                <Button
                  variant="secondary"
                  disabled={page >= result.totalPages}
                  onClick={() => setPage((p) => Math.min(result.totalPages, p + 1))}
                >
                  Next
                </Button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
