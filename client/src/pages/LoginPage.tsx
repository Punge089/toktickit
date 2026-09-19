import { FormEvent, useState } from "react";
import { Location, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext.js";
import { TextField } from "../components/ui/TextField.js";
import { Button } from "../components/ui/Button.js";
import { Alert } from "../components/ui/Alert.js";

// Issue 64 — Login screen (ui-spec.md §3). Deliberately has no "Forgot
// your password?" link: password-reset email is out of scope (labsheet
// §4.2; specification.md §11 Assumptions).
export function LoginPage() {
  const { status, login } = useAuth();
  const location = useLocation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status === "authenticated") {
    const from = (location.state as { from?: Location } | null)?.from;
    return <Navigate to={from?.pathname ?? "/"} replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to sign in. Please try again.");
      setPassword(""); // AC-05/AC-06 — never leave a rejected password in the DOM
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="zen-auth-page">
      <form className="zen-auth-card" onSubmit={handleSubmit} noValidate>
        <h1 className="zen-auth-title">TokTickIT</h1>

        {error && <Alert tone="error">{error}</Alert>}

        <TextField
          label="Email address"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={submitting}
        />
        <TextField
          label="Password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={submitting}
        />

        <Button type="submit" variant="primary" busy={submitting} busyText="Signing in…">
          Sign In
        </Button>
      </form>
    </div>
  );
}
