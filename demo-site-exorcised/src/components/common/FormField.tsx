import styles from './FormField.module.css';

export interface FormFieldProps {
  id: string;
  label: string;
  type: string;
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  /** Properly announced error message. */
  error?: string;
  /** For fields whose error is rendered elsewhere: marks the input invalid. */
  invalid?: boolean;
  /** For fields whose error is rendered elsewhere: id of that error element. */
  describedBy?: string;
  required?: boolean;
  placeholder?: string;
  autoComplete?: string;
  inputMode?: 'text' | 'numeric';
  maxLength?: number;
}

/**
 * Generic accessible form field. The card fields render their errors with
 * SilentCardErrors and link to them through `invalid` and `describedBy`.
 */
export function FormField({
  id,
  label,
  type,
  value,
  onChange,
  onBlur,
  error,
  invalid,
  describedBy,
  required = false,
  placeholder,
  autoComplete,
  inputMode,
  maxLength,
}: FormFieldProps) {
  const errorId = `${id}-error`;
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        className={styles.input}
        value={value}
        onChange={e => onChange(e.target.value)}
        onBlur={onBlur}
        required={required}
        placeholder={placeholder}
        autoComplete={autoComplete}
        inputMode={inputMode}
        maxLength={maxLength}
        aria-invalid={error || invalid ? true : undefined}
        aria-describedby={error ? errorId : describedBy}
      />
      {error ? (
        <div id={errorId} role="alert" className={styles.error}>
          {error}
        </div>
      ) : null}
    </div>
  );
}

export default FormField;
