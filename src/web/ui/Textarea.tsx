import { TextareaHTMLAttributes, forwardRef, useId } from "react";

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  helper?: string;
  error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, helper, error, id, className, ...props }, ref) => {
    const autoId = useId();
    const fieldId = id ?? autoId;
    return (
      <div className={className}>
        {label && <label htmlFor={fieldId}>{label}</label>}
        <textarea ref={ref} id={fieldId} aria-invalid={!!error} {...props} />
        {error ? <div className="err">{error}</div> : helper ? <div className="lume-helper">{helper}</div> : null}
      </div>
    );
  }
);
Textarea.displayName = "Textarea";
