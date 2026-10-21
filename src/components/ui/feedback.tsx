import clsx from "clsx";
import { CheckCircle2, CloudOff, Info, TriangleAlert, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

type Tone = "info" | "success" | "warning" | "danger";

const TONE: Record<Tone, { icon: LucideIcon; cls: string; iconCls: string }> = {
  info: { icon: Info, cls: "bg-info-soft", iconCls: "text-info" },
  success: { icon: CheckCircle2, cls: "bg-success-soft", iconCls: "text-success" },
  warning: { icon: TriangleAlert, cls: "bg-warning-soft", iconCls: "text-warning" },
  danger: { icon: TriangleAlert, cls: "bg-danger-soft", iconCls: "text-danger" },
};

/** Inline message block. `danger` is announced immediately; others politely. */
export function Banner({
  tone = "info",
  title,
  children,
  action,
  icon,
  className,
}: {
  tone?: Tone;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  icon?: LucideIcon;
  className?: string;
}) {
  const t = TONE[tone];
  const Icon = icon ?? t.icon;
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={clsx("flex gap-3 rounded-control p-4", t.cls, className)}
    >
      <Icon aria-hidden className={clsx("mt-0.5 size-5 shrink-0", t.iconCls)} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="font-semibold">{title}</p>
        {children && <div className="text-sm">{children}</div>}
        {action && <div className="mt-2">{action}</div>}
      </div>
    </div>
  );
}

/** Empty list or screen. An empty state always says what to do next. */
export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
}: {
  icon: LucideIcon;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-start gap-2 px-1 py-10">
      <Icon aria-hidden className="size-8 text-muted" strokeWidth={1.5} />
      <p className="text-lg font-semibold">{title}</p>
      {children && <p className="max-w-prose text-muted">{children}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/**
 * Shown when Firebase/storage is unreachable or over quota. Must tell the student their work
 * is safe (PRD §8.3: never silently discard a complaint).
 */
export function ServiceUnavailable({
  draftSaved,
  action,
}: {
  draftSaved?: boolean;
  action?: ReactNode;
}) {
  return (
    <Banner
      tone="warning"
      icon={CloudOff}
      title="CampusResolve can't reach its server right now"
      action={action}
    >
      {draftSaved
        ? "Your complaint is saved on this device and hasn't been sent yet. Try again in a few minutes."
        : "Nothing you entered has been lost. Try again in a few minutes."}
    </Banner>
  );
}
