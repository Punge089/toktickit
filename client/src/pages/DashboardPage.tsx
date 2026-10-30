import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext.js";
import { fetchRequesterDashboard, fetchStaffDashboard } from "../api/dashboard.js";
import { DashCard, DashSection, DashTicketList, DashboardFrame } from "../components/dashboard/DashboardParts.js";
import { useDashboard } from "../components/dashboard/useDashboard.js";
import { ActionStatusBadge } from "../components/ui/Badge.js";
import { formatDateTime } from "../lib/format.js";

// Lab 4 - Issue 83: /dashboard (docs/lab-04/ui-spec.md §3). The screen picks the
// view from the signed-in role; the API enforces the role again, so a Requester
// can never read the staff figures even by reaching the wrong view.
export function DashboardPage() {
  const { user } = useAuth();
  if (!user) return null;
  return user.role === "REQUESTER" ? <RequesterDashboardView name={user.fullName} /> : <StaffDashboardView name={user.fullName} admin={user.role === "ADMINISTRATOR"} />;
}

const firstNameOf = (fullName: string) => fullName.split(" ")[0] || fullName;

function RequesterDashboardView({ name }: { name: string }) {
  const { state, data, refreshing, refreshFailed, retry, refresh } = useDashboard(fetchRequesterDashboard);
  return (
    <DashboardFrame
      firstName={firstNameOf(name)}
      subtitle="Here is where your tickets stand."
      state={state}
      refreshing={refreshing}
      refreshFailed={refreshFailed}
      onRefresh={refresh}
      onRetry={retry}
      skeletonCards={4}
    >
      {data && (
        <>
          <div className="zen-dash-cards zen-dash-cards-4">
            <DashCard label="Open Tickets" value={data.metrics.openTickets} to="/tickets?active=true" />
            <DashCard label="Waiting for You" value={data.metrics.waitingForYou} to="/tickets?status=WAITING_FOR_REQUESTER" />
            <DashCard label="Resolved" value={data.metrics.resolved} to="/tickets?status=RESOLVED" />
            <DashCard label="Closed" value={data.metrics.closed} to="/tickets?status=CLOSED" />
          </div>

          <div className="zen-dash-lists">
            <DashSection title="Needs Your Attention">
              <DashTicketList rows={data.attention} hrefFor={(id) => `/tickets/${id}`} staff={false} empty="Nothing needs your attention right now." />
            </DashSection>
            <DashSection title="Recently Updated" viewAll={{ to: "/tickets", label: "View all" }}>
              <DashTicketList rows={data.recent} hrefFor={(id) => `/tickets/${id}`} staff={false} empty="You have no tickets yet. Create one to get started." />
            </DashSection>
          </div>

          <section className="zen-dash-quick" aria-label="Quick Actions">
            <h2 className="zen-dash-panel-title">Quick Actions</h2>
            <div className="zen-dash-quick-buttons">
              <Link to="/tickets/new" className="zen-btn zen-btn-primary">
                Create Ticket
              </Link>
              <Link to="/tickets" className="zen-btn zen-btn-secondary">
                View My Tickets
              </Link>
            </div>
          </section>
        </>
      )}
    </DashboardFrame>
  );
}

function StaffDashboardView({ name, admin }: { name: string; admin: boolean }) {
  const { state, data, refreshing, refreshFailed, retry, refresh } = useDashboard(fetchStaffDashboard);
  return (
    <DashboardFrame
      firstName={firstNameOf(name)}
      subtitle={admin ? "Read-only view of the IT Staff dashboard." : "Here is what needs the IT team today."}
      state={state}
      refreshing={refreshing}
      refreshFailed={refreshFailed}
      onRefresh={refresh}
      onRetry={retry}
      skeletonCards={4}
    >
      {data && (
        <>
          <div className="zen-dash-cards zen-dash-cards-4">
            <DashCard label="New" value={data.statusCounts.NEW} to="/staff/queue?status=NEW" />
            <DashCard label="Open" value={data.statusCounts.OPEN} to="/staff/queue?status=OPEN" />
            <DashCard label="In Progress" value={data.statusCounts.IN_PROGRESS} to="/staff/queue?status=IN_PROGRESS" />
            <DashCard label="Waiting for Requester" value={data.statusCounts.WAITING_FOR_REQUESTER} to="/staff/queue?status=WAITING_FOR_REQUESTER" />
          </div>

          <div className="zen-dash-cards zen-dash-cards-3">
            <DashCard label="Unassigned" value={data.unassigned} to="/staff/queue?owner=unassigned&active=true" />
            {data.personal && (
              <>
                <DashCard label="My Assigned" value={data.personal.myAssigned} to="/staff/queue?owner=me&active=true" />
                <DashCard label="My Open Actions" value={data.personal.myOpenActions} hint="listed below" />
              </>
            )}
            {data.accounts && (
              <Link to="/admin/users" className="zen-dash-card zen-dash-card-link" aria-label="Accounts: manage users">
                <span className="zen-dash-card-label">Accounts</span>
                <span className="zen-dash-account-lines">
                  <span>Active Requesters: {data.accounts.activeRequesters}</span>
                  <span>Active IT Staff: {data.accounts.activeItStaff}</span>
                  <span>Active Administrators: {data.accounts.activeAdministrators}</span>
                  <span>Inactive: {data.accounts.inactive}</span>
                </span>
              </Link>
            )}
          </div>

          <section className="zen-dash-panel" aria-label="By IT Priority">
            <h2 className="zen-dash-panel-title">By IT Priority (active tickets)</h2>
            <div className="zen-dash-priority">
              {(
                [
                  ["URGENT", "Urgent"],
                  ["HIGH", "High"],
                  ["MEDIUM", "Medium"],
                  ["LOW", "Low"],
                ] as const
              ).map(([key, label]) => (
                <Link
                  key={key}
                  to={`/staff/queue?itPriority=${key}&active=true`}
                  className="zen-dash-priority-link"
                  aria-label={`${label}: ${data.activeByPriority[key]}, view tickets`}
                >
                  <span>{label}</span>
                  <strong className={data.activeByPriority[key] === 0 ? "zen-dash-zero" : undefined}>{data.activeByPriority[key]}</strong>
                </Link>
              ))}
            </div>
          </section>

          <div className="zen-dash-lists">
            <DashSection title="Urgent and High Priority" viewAll={{ to: "/staff/queue?active=true", label: "View all" }}>
              <DashTicketList rows={data.urgentTickets} hrefFor={(id) => `/staff/tickets/${id}`} staff empty="No urgent tickets." />
            </DashSection>
            <DashSection title="Recently Updated" viewAll={{ to: "/staff/queue", label: "View all" }}>
              <DashTicketList rows={data.recentTickets} hrefFor={(id) => `/staff/tickets/${id}`} staff empty="No recent tickets." />
            </DashSection>
          </div>

          {data.myActions && (
            <DashSection title="My Open Actions">
              {data.myActions.length === 0 ? (
                <p className="zen-dash-empty">You have no open actions.</p>
              ) : (
                <ul className="zen-dash-rows">
                  {data.myActions.map((a) => (
                    <li key={a.id} className="zen-dash-row">
                      <div className="zen-dash-row-top">
                        <Link to={`/staff/tickets/${a.ticketId}?tab=actions`} className="zen-dash-row-number">
                          {a.ticketNumber}
                        </Link>
                        <ActionStatusBadge status={a.actionStatus} />
                        <span className="zen-dash-row-date">{formatDateTime(a.actionAt)}</span>
                      </div>
                      <div className="zen-dash-row-summary">{a.description}</div>
                    </li>
                  ))}
                </ul>
              )}
            </DashSection>
          )}

          <section className="zen-dash-quick" aria-label="Quick Actions">
            <h2 className="zen-dash-panel-title">Quick Actions</h2>
            <div className="zen-dash-quick-buttons">
              <Link to="/staff/queue" className="zen-btn zen-btn-primary">
                Open Ticket Queue
              </Link>
              {data.personal && (
                <Link to="/staff/queue?owner=me&active=true" className="zen-btn zen-btn-secondary">
                  My Queue
                </Link>
              )}
            </div>
          </section>
        </>
      )}
    </DashboardFrame>
  );
}
