import { InputHTMLAttributes, useId } from "react";

// Issue 23 — reusable field per ui-spec.md §3: label above control, red
// asterisk + aria-required on required fields (never the asterisk alone),
// read-only fields visually distinct, error message anchored under the
// field via aria-describedby (AC-18).
interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  caption?: string;
  readOnlyReason?: string;
}

export function TextField({
  label,
  error,
  caption,
  readOnlyReason,
  required,
  readOnly,
  id,
  className = "",
  ...rest
}: TextFieldProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const errorId = `${fieldId}-error`;
  const captionId = `${fieldId}-caption`;

  const wrapperClasses = [
    "zen-field",
    readOnly ? "zen-field-readonly" : "",
    error ? "zen-field-invalid" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={wrapperClasses}>
      <label htmlFor={fieldId} className="zen-field-label">
        {label}
        {required && (
          <span className="zen-field-required-marker" aria-hidden="true">
            {" "}
            *
          </span>
        )}
      </label>
      <input
        id={fieldId}
        className="zen-field-control"
        required={required}
        aria-required={required || undefined}
        readOnly={readOnly}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : caption || readOnlyReason ? captionId : undefined}
        {...rest}
      />
      {error ? (
        <p id={errorId} className="zen-field-error" role="alert">
          {error}
        </p>
      ) : (
        (caption || readOnlyReason) && (
          <p id={captionId} className="zen-field-caption">
            {readOnlyReason ?? caption}
          </p>
        )
      )}
    </div>
  );
}
