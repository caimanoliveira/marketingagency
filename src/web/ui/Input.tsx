import { InputHTMLAttributes, forwardRef, useId } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  helper?: string;
  error?: string;
  leftAddon?: React.ReactNode;
  rightAddon?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, helper, error, leftAddon, rightAddon, id, className, ...props }, ref) => {
    const autoId = useId();
    const fieldId = id ?? autoId;
    const hasAddon = !!leftAddon || !!rightAddon;
    return (
      <div className={className}>
        {label && <label htmlFor={fieldId}>{label}</label>}
        {hasAddon ? (
          <div className="lume-input-wrap">
            {leftAddon && <span className="lume-input-addon">{leftAddon}</span>}
            <input ref={ref} id={fieldId} aria-invalid={!!error} {...props} />
            {rightAddon && <span className="lume-input-addon">{rightAddon}</span>}
          </div>
        ) : (
          <input ref={ref} id={fieldId} aria-invalid={!!error} {...props} />
        )}
        {error ? <div className="err">{error}</div> : helper ? <div className="lume-helper">{helper}</div> : null}
      </div>
    );
  }
);
Input.displayName = "Input";
