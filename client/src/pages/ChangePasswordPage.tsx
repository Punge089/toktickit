import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.js";
import { changePassword, ValidationError } from "../api/auth.js";
import { TextField } from "../components/ui/TextField.js";
import { Button } from "../components/ui/Button.js";
import { Alert } from "../components/ui/Alert.js";

// docs/lab-03/specification.md BR-08 — kept identical to the server's
// validatePasswordPolicy so the live checklist never disagrees with what
// the backend will actually accept.
const POLICY_RULES: { key: string; label: string; test: (pw: string) => boolean }[] = [
  { key: "length", label: "8-72 characters", test: (pw) => pw.length >= 8 && pw.length <= 72 },
  { key: "upper", label: "An uppercase letter", test: (pw) => /[A-Z]/.test(pw) },
  { key: "lower", label: "A lowercase letter", test: (pw) => /[a-z]/.test(pw) },
  { key: "digit", label: "A digit", test: (pw) => /[0-9]/.test(pw) },
  { key: "special", label: "A special character", test: (pw) => /[^A-Za-z0-9]/.test(pw) },
];

// Issue 64 — Change Password screen (ui-spec.md §4). Reachable both as the
// mandatory first-login flow (mustChangePassword) and as a voluntary
// action from the shell's identity dropdown.
export function ChangePasswordPage() {
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const isFirstLogin = user?.mustChangePassword ?? false;

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const policyMet = POLICY_RULES.every((rule) => rule.test(newPassword));
  const confirmMatches = newPassword.length > 0 && newPassword === confirmPassword;
  const canSubmit = currentPassword.length > 0 && policyMet && confirmMatches;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    setError(null);
    setFieldErrors({});
    try {
      await changePassword(currentPassword, newPassword, confirmPassword);
      await refresh(); // updates mustChangePassword so RequireAuth stops redirecting here
      if (isFirstLogin) {
        navigate("/", { replace: true });
      } else {
        setSuccess(true);
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      }
    } catch (err) {
      if (err instanceof ValidationError) {
        setFieldErrors(err.fieldErrors);
      } else {
        setError(err instanceof Error ? err.message : "Unable to change your password. Please try again.");
      }
      setCurrentPassword("");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="zen-auth-page">
      <form className="zen-auth-card" onSubmit={handleSubmit} noValidate>
        <h1 className="zen-auth-title">Change Your Password</h1>
        {isFirstLogin && <p style={{ color: "var(--zen-text-muted)", margin: 0 }}>You must change your password to continue.</p>}

        {error && <Alert tone="error">{error}</Alert>}
        {success && <Alert tone="success">Your password has been changed.</Alert>}

        <TextField
          label={isFirstLogin ? "Current (temporary) password" : "Current password"}
          type="password"
          autoComplete="current-password"
          required
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          error={fieldErrors.currentPassword}
          disabled={submitting}
        />
        <TextField
          label="New password"
          type="password"
          autoComplete="new-password"
          required
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          error={fieldErrors.newPassword}
          disabled={submitting}
        />
        <TextField
          label="Confirm new password"
          type="password"
          autoComplete="new-password"
          required
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          error={fieldErrors.confirmPassword ?? (confirmPassword && !confirmMatches ? "Passwords do not match." : undefined)}
          disabled={submitting}
        />

        <div>
          <p className="zen-field-label" style={{ marginBottom: "var(--zen-space-1)" }}>
            Password must have:
          </p>
          <ul className="zen-password-checklist">
            {POLICY_RULES.map((rule) => {
              const met = rule.test(newPassword);
              return (
                <li
                  key={rule.key}
                  className={["zen-password-checklist-item", met ? "zen-password-checklist-item-met" : ""]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <span className="zen-password-checklist-icon" aria-hidden="true">
                    {met ? "✓" : "○"}
                  </span>
                  {rule.label}
                </li>
              );
            })}
          </ul>
        </div>

        <Button type="submit" variant="primary" disabled={!canSubmit} busy={submitting} busyText="Saving…">
          {isFirstLogin ? "Continue" : "Save"}
        </Button>
      </form>
    </div>
  );
}
