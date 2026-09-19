import { POLICY_RULES } from "../../lib/passwordPolicy.js";

// ui-spec.md section 4 - the live "Password must have" checklist, shared by
// Change Password and the Administrator's Initial Password fields so the two
// screens can never describe different rules.
export function PasswordChecklist({ password }: { password: string }) {
  return (
    <div>
      <p className="zen-field-label" style={{ marginBottom: "var(--zen-space-1)" }}>
        Password must have:
      </p>
      <ul className="zen-password-checklist">
        {POLICY_RULES.map((rule) => {
          const met = rule.test(password);
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
  );
}
