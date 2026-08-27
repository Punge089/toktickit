import { TextareaHTMLAttributes, useId } from "react";

interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  error?: string;
  caption?: string;
}

// Same field-state rules as TextField (ui-spec.md §3), sized for
// Description: taller, vertically resizable only.
export function TextArea({
  label,
  error,
  caption,
  required,
  readOnly,
  id,
  className = "",
  ...rest
}: TextAreaProps) {
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
      <textarea
        id={fieldId}
        className="zen-field-control"
        required={required}
        aria-required={required || undefined}
        readOnly={readOnly}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : caption ? captionId : undefined}
        rows={6}
        {...rest}
      />
      {error ? (
        <p id={errorId} className="zen-field-error" role="alert">
          {error}
        </p>
      ) : (
        caption && (
          <p id={captionId} className="zen-field-caption">
            {caption}
          </p>
        )
      )}
    </div>
  );
}
