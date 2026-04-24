import { SelectHTMLAttributes, forwardRef, useId } from "react";

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  children: React.ReactNode;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, id, className, children, ...props }, ref) => {
    const autoId = useId();
    const fieldId = id ?? autoId;
    return (
      <div className={className}>
        {label && <label htmlFor={fieldId}>{label}</label>}
        <select ref={ref} id={fieldId} {...props}>{children}</select>
        {error && <div className="err">{error}</div>}
      </div>
    );
  }
);
Select.displayName = "Select";
