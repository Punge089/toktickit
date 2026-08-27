import { SelectHTMLAttributes, useId } from "react";

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  options: SelectOption[];
  placeholder?: string;
  error?: string;
}

// Native <select> deliberately (not a custom widget) so keyboard and
// screen-reader behavior come for free (ui-spec.md §5).
export function Select({
  label,
  options,
  placeholder,
  error,
  required,
  id,
  className = "",
  ...rest
}: SelectProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const errorId = `${fieldId}-error`;

  const wrapperClasses = ["zen-field", error ? "zen-field-invalid" : "", className]
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
      <select
        id={fieldId}
        className="zen-field-control"
        required={required}
        aria-required={required || undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        {...rest}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && (
        <p id={errorId} className="zen-field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
