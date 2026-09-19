import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext.js";
import { Role, ValidationError } from "../api/auth.js";
import { ForbiddenError } from "../api/staffQueue.js";
import {
  AdminUser,
  ConflictError,
  UserList,
  createUser,
  fetchUsers,
  setInitialPassword,
  updateUser,
} from "../api/adminUsers.js";
import { passwordPolicyMet } from "../lib/passwordPolicy.js";
import { TextField } from "../components/ui/TextField.js";
import { Select } from "../components/ui/Select.js";
import { Button } from "../components/ui/Button.js";
import { Alert } from "../components/ui/Alert.js";
import { Spinner } from "../components/ui/Spinner.js";
import { EmptyState } from "../components/ui/EmptyState.js";
import { Badge, RoleBadge } from "../components/ui/Badge.js";
import { PasswordChecklist } from "../components/ui/PasswordChecklist.js";

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: "REQUESTER", label: "Requester" },
  { value: "IT_STAFF", label: "IT Staff" },
  { value: "ADMINISTRATOR", label: "Administrator" },
];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type ListState = "loading" | "loaded" | "error" | "forbidden";
type Panel = { mode: "create" } | { mode: "edit"; user: AdminUser } | null;

// Issue 67 - Administrator User Management (docs/lab-03/ui-spec.md section 9).
// One screen: a user list (Name, Email, Role, Status, Edit) with search and an
// optional role filter, plus a create/edit side panel. Deliberately no
// pagination, sorting, bulk actions or deletion (labsheet 4.2 and 8.5).
export function UserManagementPage() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");

  const [listState, setListState] = useState<ListState>("loading");
  const [result, setResult] = useState<UserList | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [panel, setPanel] = useState<Panel>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    setListState("loading");
    fetchUsers({ search: debouncedSearch || undefined, role: roleFilter || undefined })
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
  }, [debouncedSearch, roleFilter, reloadKey]);

  const hasActiveFilters = Boolean(search || roleFilter);

  function clearFilters() {
    setSearch("");
    setDebouncedSearch("");
    setRoleFilter("");
  }

  function openPanel(next: Panel) {
    setNotice(null);
    setPanel(next);
  }

  function handleSaved(message: string) {
    setPanel(null);
    setNotice(message);
    setReloadKey((k) => k + 1);
  }

  const isEmpty = listState === "loaded" && result !== null && result.items.length === 0 && !hasActiveFilters;
  const isNoResults = listState === "loaded" && result !== null && result.items.length === 0 && hasActiveFilters;

  return (
    <div>
      <div className="zen-users-header">
        <h1 style={{ fontSize: "var(--zen-fs-h1)", margin: 0 }}>Users</h1>
        <Button variant="primary" onClick={() => openPanel({ mode: "create" })} disabled={listState === "forbidden"}>
          + Create User
        </Button>
      </div>

      {notice && <Alert tone="success">{notice}</Alert>}

      {listState === "forbidden" ? (
        <Alert tone="error">You don't have access to user management.</Alert>
      ) : (
        <div className={["zen-users-layout", panel ? "zen-users-layout-panel-open" : ""].filter(Boolean).join(" ")}>
          <div className="zen-users-list-pane">
            <div className="zen-users-controls">
              <div className="zen-field" style={{ marginBottom: 0, flex: "1 1 220px" }}>
                <label className="zen-field-label" htmlFor="user-search">
                  Search
                </label>
                <input
                  id="user-search"
                  className="zen-field-control"
                  type="search"
                  placeholder="Name or email"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Select
                label="Role"
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                options={[{ value: "", label: "All roles" }, ...ROLE_OPTIONS]}
                className="zen-users-role-filter"
              />
              {hasActiveFilters && (
                <Button variant="tertiary" onClick={clearFilters}>
                  Clear filters
                </Button>
              )}
            </div>

            {listState === "loading" && <Spinner label="Loading users…" />}

            {listState === "error" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--zen-space-3)" }}>
                <Alert tone="error">Unable to load users. Please try again.</Alert>
                <div>
                  <Button variant="secondary" onClick={() => setReloadKey((k) => k + 1)}>
                    Retry
                  </Button>
                </div>
              </div>
            )}

            {isEmpty && <EmptyState title="No users yet" description="Create the first user to get started." />}

            {isNoResults && (
              <EmptyState
                title="No users match your search"
                description="Try a different name or email, or clear your filters."
                action={
                  <Button variant="secondary" onClick={clearFilters}>
                    Clear filters
                  </Button>
                }
              />
            )}

            {listState === "loaded" && result !== null && result.items.length > 0 && (
              <div className="zen-tickets-list" role="table" aria-label="Users">
                <div className="zen-users-header-row" role="row">
                  <span role="columnheader">Name</span>
                  <span role="columnheader">Email</span>
                  <span role="columnheader">Role</span>
                  <span role="columnheader">Status</span>
                  <span role="columnheader">Action</span>
                </div>
                {result.items.map((u) => (
                  <div
                    key={u.id}
                    role="row"
                    className={[
                      "zen-users-row",
                      panel?.mode === "edit" && panel.user.id === u.id ? "zen-users-row-selected" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    <span role="cell" className="zen-users-cell-name" title={u.fullName}>
                      {u.fullName}
                    </span>
                    <span role="cell" className="zen-users-cell-email" title={u.email}>
                      {u.email}
                    </span>
                    <span role="cell" className="zen-users-cell-role">
                      <RoleBadge role={u.role} />
                    </span>
                    <span role="cell" className="zen-users-cell-status">
                      <Badge tone={u.isActive ? "success" : "error"}>{u.isActive ? "Active" : "Inactive"}</Badge>
                    </span>
                    <span role="cell" className="zen-users-cell-edit">
                      <Button variant="secondary" aria-label={`Edit ${u.fullName}`} onClick={() => openPanel({ mode: "edit", user: u })}>
                        Edit
                      </Button>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {panel && (
            <UserPanel
              key={panel.mode === "edit" ? `edit-${panel.user.id}` : "create"}
              panel={panel}
              activeAdministratorCount={result?.activeAdministratorCount ?? 0}
              onClose={() => setPanel(null)}
              onSaved={handleSaved}
            />
          )}
        </div>
      )}
    </div>
  );
}

interface UserPanelProps {
  panel: NonNullable<Panel>;
  activeAdministratorCount: number;
  onClose: () => void;
  onSaved: (message: string) => void;
}

// The create/edit side panel (ui-spec.md section 9). Edit mode disables Role and
// Active, with a visible reason, whenever the server would refuse the change
// anyway (own account, last active Administrator), so the rule is visible
// before it is tried. The API still enforces both independently.
function UserPanel({ panel, activeAdministratorCount, onClose, onSaved }: UserPanelProps) {
  const { user: me } = useAuth();
  const editing = panel.mode === "edit" ? panel.user : null;

  const isSelf = editing !== null && me?.id === editing.id;
  const isLastAdmin =
    editing !== null && editing.role === "ADMINISTRATOR" && editing.isActive && activeAdministratorCount <= 1;
  const safetyNote = isSelf
    ? "You cannot change your own role or active state."
    : isLastAdmin
      ? "At least one active Administrator must remain."
      : null;

  const [fullName, setFullName] = useState(editing?.fullName ?? "");
  const [email, setEmail] = useState(editing?.email ?? "");
  const [role, setRole] = useState<Role>(editing?.role ?? "REQUESTER");
  const [isActive, setIsActive] = useState(editing?.isActive ?? true);
  const [initialPassword, setInitialPasswordValue] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<{ tone: "error" | "warning"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const [resetOpen, setResetOpen] = useState(false);
  const [resetPassword, setResetPassword] = useState("");
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetDone, setResetDone] = useState(false);
  const [resetting, setResetting] = useState(false);

  function validate(): Record<string, string> {
    const errors: Record<string, string> = {};
    if (fullName.trim().length === 0) errors.fullName = "Full name is required.";
    else if (fullName.trim().length > 100) errors.fullName = "Full name must be at most 100 characters.";
    if (email.trim().length === 0) errors.email = "Email is required.";
    else if (!EMAIL_PATTERN.test(email.trim())) errors.email = "Enter a valid email address.";
    if (!editing && !passwordPolicyMet(initialPassword)) {
      errors.initialPassword = "Initial password must meet every rule below.";
    }
    return errors;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBanner(null);

    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSaving(true);
    try {
      if (editing) {
        const changes: Partial<Pick<AdminUser, "fullName" | "email" | "role" | "isActive">> = {};
        if (fullName.trim() !== editing.fullName) changes.fullName = fullName.trim();
        if (email.trim().toLowerCase() !== editing.email) changes.email = email.trim();
        if (role !== editing.role) changes.role = role;
        if (isActive !== editing.isActive) changes.isActive = isActive;
        if (Object.keys(changes).length === 0) {
          setBanner({ tone: "warning", text: "No changes to save." });
          return;
        }
        await updateUser(editing.id, changes);
      } else {
        await createUser({ fullName: fullName.trim(), email: email.trim(), role, isActive, initialPassword });
      }
      onSaved("User saved.");
    } catch (err) {
      if (err instanceof ValidationError) {
        setFieldErrors(err.fieldErrors);
      } else if (err instanceof ConflictError && err.code === "EMAIL_TAKEN") {
        setFieldErrors({ email: err.message });
      } else if (err instanceof ForbiddenError) {
        setBanner({ tone: "error", text: "You don't have permission to do that." });
      } else {
        setBanner({ tone: "error", text: err instanceof Error ? err.message : "Unable to save the user. Please try again." });
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleSetPassword() {
    if (!editing) return;
    setResetError(null);
    setResetDone(false);
    setResetting(true);
    try {
      await setInitialPassword(editing.id, resetPassword);
      setResetPassword("");
      setResetDone(true);
    } catch (err) {
      if (err instanceof ValidationError) setResetError(err.fieldErrors.initialPassword ?? "Enter a valid password.");
      else setResetError(err instanceof Error ? err.message : "Unable to set the new initial password. Please try again.");
    } finally {
      setResetting(false);
    }
  }

  const heading = editing ? "Edit User" : "Create New User";

  return (
    <section className="zen-users-panel" aria-labelledby="user-panel-heading">
      <div className="zen-users-panel-header">
        <h2 id="user-panel-heading" style={{ fontSize: "var(--zen-fs-h2)", margin: 0 }}>
          {heading}
        </h2>
        <Button variant="tertiary" className="zen-users-panel-close" aria-label="Close panel" onClick={onClose}>
          ✕
        </Button>
      </div>

      <form onSubmit={handleSubmit} noValidate>
        {banner && (
          <div style={{ marginBottom: "var(--zen-space-4)" }}>
            <Alert tone={banner.tone}>{banner.text}</Alert>
          </div>
        )}

        <TextField
          label="Full name"
          required
          autoFocus
          autoComplete="off"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          error={fieldErrors.fullName}
          disabled={saving}
        />
        <TextField
          label="Email address"
          type="email"
          required
          autoComplete="off"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={fieldErrors.email}
          disabled={saving}
        />
        <Select
          label="Role"
          required
          value={role}
          onChange={(e) => setRole(e.target.value as Role)}
          options={ROLE_OPTIONS}
          error={fieldErrors.role}
          disabled={saving || safetyNote !== null}
          aria-describedby={safetyNote ? "user-safety-note" : undefined}
        />

        <div className="zen-field">
          <label className="zen-field-label" htmlFor="user-active">
            Active
          </label>
          <span className="zen-switch">
            <input
              id="user-active"
              type="checkbox"
              role="switch"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              disabled={saving || safetyNote !== null}
              aria-describedby={safetyNote ? "user-safety-note" : undefined}
            />
            <span>{isActive ? "Yes" : "No"}</span>
          </span>
          {fieldErrors.isActive && (
            <p className="zen-field-error" role="alert">
              {fieldErrors.isActive}
            </p>
          )}
          {safetyNote && (
            <p id="user-safety-note" className="zen-field-caption">
              {safetyNote}
            </p>
          )}
        </div>

        {!editing && (
          <div className="zen-users-password-box">
            <TextField
              label="Initial password"
              type="password"
              required
              autoComplete="new-password"
              value={initialPassword}
              onChange={(e) => setInitialPasswordValue(e.target.value)}
              error={fieldErrors.initialPassword}
              caption="The user must choose a new password at first login."
              disabled={saving}
            />
            <PasswordChecklist password={initialPassword} />
          </div>
        )}

        <div className="zen-users-panel-actions">
          <Button type="submit" variant="primary" busy={saving} busyText="Saving…">
            Save User
          </Button>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
        </div>
      </form>

      {editing && (
        <div className="zen-users-password-box">
          <Button
            variant="tertiary"
            aria-expanded={resetOpen}
            aria-controls="user-reset-password"
            onClick={() => setResetOpen((open) => !open)}
          >
            Set new initial password
          </Button>
          {resetOpen && (
            <div id="user-reset-password">
              {resetDone && (
                <div style={{ marginBottom: "var(--zen-space-3)" }}>
                  <Alert tone="success">
                    New initial password set. {editing.fullName} must change it at the next login.
                  </Alert>
                </div>
              )}
              <TextField
                label="New initial password"
                type="password"
                autoComplete="new-password"
                value={resetPassword}
                onChange={(e) => {
                  setResetPassword(e.target.value);
                  setResetDone(false);
                }}
                error={resetError ?? undefined}
                caption={
                  isSelf
                    ? "This is your own account, so you will be signed out and asked to change it."
                    : "Any session this user has open is ended immediately."
                }
                disabled={resetting}
              />
              <PasswordChecklist password={resetPassword} />
              <div style={{ marginTop: "var(--zen-space-3)" }}>
                <Button
                  variant="secondary"
                  disabled={!passwordPolicyMet(resetPassword)}
                  busy={resetting}
                  busyText="Saving…"
                  onClick={handleSetPassword}
                >
                  Set password
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
