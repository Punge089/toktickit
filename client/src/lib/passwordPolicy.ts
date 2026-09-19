// docs/lab-03/specification.md BR-08 - kept identical to the server's
// validatePasswordPolicy so the live checklist never disagrees with what the
// backend will actually accept. Used by Change Password and by the
// Administrator's initial-password fields.
export const POLICY_RULES: { key: string; label: string; test: (pw: string) => boolean }[] = [
  { key: "length", label: "8-72 characters", test: (pw) => pw.length >= 8 && pw.length <= 72 },
  { key: "upper", label: "An uppercase letter", test: (pw) => /[A-Z]/.test(pw) },
  { key: "lower", label: "A lowercase letter", test: (pw) => /[a-z]/.test(pw) },
  { key: "digit", label: "A digit", test: (pw) => /[0-9]/.test(pw) },
  { key: "special", label: "A special character", test: (pw) => /[^A-Za-z0-9]/.test(pw) },
];

export function passwordPolicyMet(password: string): boolean {
  return POLICY_RULES.every((rule) => rule.test(password));
}
