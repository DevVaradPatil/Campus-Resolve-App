import clsx from "clsx";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Spinner } from "./spinner";

const variants = {
  primary: "bg-ink text-on-ink hover:bg-ink-hover",
  secondary: "border border-line-strong bg-sheet text-ink hover:bg-ink-soft",
  ghost: "text-ink hover:bg-ink-soft",
  destructive: "bg-danger text-on-danger hover:opacity-90",
};

const sizes = {
  md: "h-11 px-4 text-base gap-2",
  sm: "h-11 px-3 text-sm gap-1.5",
};

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
  loading?: boolean;
  icon?: ReactNode;
};

export function buttonClass(
  variant: keyof typeof variants = "primary",
  size: keyof typeof sizes = "md",
) {
  return clsx(
    "inline-flex shrink-0 items-center justify-center rounded-control font-semibold transition-colors",
    "disabled:cursor-not-allowed disabled:opacity-50",
    variants[variant],
    sizes[size],
  );
}

export function Button({
  variant = "primary",
  size = "md",
  loading,
  icon,
  disabled,
  className,
  children,
  type = "button",
  ...rest
}: Props) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={clsx(buttonClass(variant, size), className)}
      {...rest}
    >
      {loading ? <Spinner className="size-4" /> : icon}
      {children}
    </button>
  );
}

/** Square icon-only button. `label` is required: it becomes the accessible name. */
export function IconButton({
  label,
  variant = "ghost",
  className,
  children,
  type = "button",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; variant?: keyof typeof variants }) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={clsx(buttonClass(variant), "size-11 px-0", className)}
      {...rest}
    >
      {children}
    </button>
  );
}
