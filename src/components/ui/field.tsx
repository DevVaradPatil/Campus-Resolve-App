"use client";

import clsx from "clsx";
import { ChevronDown } from "lucide-react";
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";

type FieldCtx = { id: string; describedBy?: string; invalid: boolean; required?: boolean };
const Ctx = createContext<FieldCtx | null>(null);

/** Label + hint + error wrapper. Wires id/aria-* into the Input/Textarea/Select inside it. */
export function Field({
  label,
  hint,
  error,
  required,
  children,
  className,
}: {
  label: string;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;
  return (
    <div className={clsx("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="font-semibold">
        {label}
        {!required && <span className="font-normal text-muted"> (optional)</span>}
      </label>
      {hint && (
        <p id={hintId} className="text-sm text-muted">
          {hint}
        </p>
      )}
      <Ctx.Provider value={{ id, describedBy, invalid: !!error, required }}>
        {children}
      </Ctx.Provider>
      {error && (
        <p id={errorId} className="text-sm font-semibold text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

function useField() {
  const f = useContext(Ctx);
  return f
    ? {
        id: f.id,
        "aria-describedby": f.describedBy,
        "aria-invalid": f.invalid || undefined,
        required: f.required,
      }
    : {};
}

const control =
  "w-full rounded-control border border-line-strong bg-sheet px-3 text-base text-text " +
  "placeholder:text-muted aria-invalid:border-danger aria-invalid:border-2 " +
  "disabled:bg-sheet-sunk disabled:text-muted";

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={clsx(control, "h-11", className)} {...useField()} {...rest} />;
}

/** Textarea with a live character count. `maxLength` is required: every free-text field is capped. */
export function Textarea({
  className,
  maxLength,
  onChange,
  defaultValue,
  value,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { maxLength: number }) {
  const field = useField();
  const [count, setCount] = useState(String(value ?? defaultValue ?? "").length);
  const near = count > maxLength * 0.9;
  return (
    <div className="flex flex-col gap-1">
      <textarea
        className={clsx(control, "min-h-28 py-2.5", className)}
        maxLength={maxLength}
        defaultValue={defaultValue}
        value={value}
        onChange={(e) => {
          setCount(e.target.value.length);
          onChange?.(e);
        }}
        {...field}
        {...rest}
      />
      <p className={clsx("self-end text-xs tabular-nums", near ? "text-warning" : "text-muted")}>
        <span className="sr-only">Characters used: </span>
        {count} / {maxLength}
      </p>
    </div>
  );
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select
        className={clsx(control, "h-11 appearance-none pr-10", className)}
        {...useField()}
        {...rest}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-3 size-5 -translate-y-1/2 text-muted"
      />
    </div>
  );
}

type CheckProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label: ReactNode;
  description?: ReactNode;
};

function Check({ type, label, description, className, ...rest }: CheckProps & { type: string }) {
  return (
    <label className={clsx("flex min-h-11 cursor-pointer items-start gap-3 py-2", className)}>
      <input type={type} className="mt-0.5 size-5 shrink-0 accent-ink" {...rest} />
      <span className="flex flex-col">
        <span>{label}</span>
        {description && <span className="text-sm text-muted">{description}</span>}
      </span>
    </label>
  );
}

export const Checkbox = (p: CheckProps) => <Check type="checkbox" {...p} />;
export const Radio = (p: CheckProps) => <Check type="radio" {...p} />;

/** Large tappable radio card, used for category pickers in the guided form. */
export function OptionCard({
  label,
  description,
  icon,
  className,
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label: string;
  description?: string;
  icon?: ReactNode;
}) {
  return (
    <label
      className={clsx(
        "flex cursor-pointer items-start gap-3 rounded-control border border-rule bg-sheet p-3",
        "has-checked:border-2 has-checked:border-ink has-checked:bg-ink-soft",
        "has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-ink",
        className,
      )}
    >
      <input type="radio" className="sr-only" {...rest} />
      {icon && <span className="mt-0.5 text-ink">{icon}</span>}
      <span className="flex flex-col">
        <span className="font-semibold">{label}</span>
        {description && <span className="text-sm text-muted">{description}</span>}
      </span>
    </label>
  );
}

export function Switch({
  checked,
  onCheckedChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex min-h-11 items-center justify-between gap-4 py-2">
      <span className="flex flex-col">
        <span id={id}>{label}</span>
        {description && <span className="text-sm text-muted">{description}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={id}
        disabled={disabled}
        onClick={() => onCheckedChange(!checked)}
        className="grid h-11 w-14 shrink-0 place-items-center rounded-full disabled:opacity-50"
      >
        {/* 44px hit area around a 28px track */}
        <span
          className={clsx(
            "relative h-7 w-12 rounded-full transition-colors",
            checked ? "bg-ink" : "bg-line-strong",
          )}
        >
          <span
            className={clsx(
              "absolute top-1 left-1 size-5 rounded-full bg-sheet transition-transform",
              checked && "translate-x-5",
            )}
          />
        </span>
      </button>
    </div>
  );
}

/** Shown at the top of a form after a failed submit. Takes focus when the set of errors changes. */
export function FormErrorSummary({
  errors,
  focusOnChange = true,
}: {
  errors: { fieldId: string; message: string }[];
  focusOnChange?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const key = errors.map((e) => e.fieldId).join();
  useEffect(() => {
    if (focusOnChange && key) ref.current?.focus();
  }, [key, focusOnChange]);
  if (!errors.length) return null;
  return (
    <div
      role="alert"
      tabIndex={-1}
      ref={ref}
      className="rounded-control border-2 border-danger bg-danger-soft p-4"
    >
      <p className="font-semibold text-danger">
        Fix {errors.length === 1 ? "this problem" : `these ${errors.length} problems`} to continue
      </p>
      <ul className="mt-2 list-disc pl-5">
        {errors.map((e) => (
          <li key={e.fieldId}>
            <a href={`#${e.fieldId}`} className="text-ink underline underline-offset-2">
              {e.message}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
