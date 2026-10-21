import clsx from "clsx";
import {
  ArrowUpCircle,
  CheckCircle2,
  CircleDashed,
  CircleDot,
  Lock,
  RotateCcw,
  UserCheck,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import type { Priority, Status } from "@/lib/domain/complaint";

// Status always pairs color with an icon and a label, so color is never the only signal.
const STATUS: Record<Status, { label: string; icon: LucideIcon; cls: string }> = {
  submitted: {
    label: "Submitted",
    icon: CircleDashed,
    cls: "bg-st-submitted-bg text-st-submitted",
  },
  assigned: { label: "Assigned", icon: UserCheck, cls: "bg-st-assigned-bg text-st-assigned" },
  in_progress: { label: "In progress", icon: CircleDot, cls: "bg-st-progress-bg text-st-progress" },
  resolved: { label: "Resolved", icon: CheckCircle2, cls: "bg-st-resolved-bg text-st-resolved" },
  closed: { label: "Closed", icon: Lock, cls: "bg-st-closed-bg text-st-closed" },
  reopened: { label: "Reopened", icon: RotateCcw, cls: "bg-st-reopened-bg text-st-reopened" },
};

export const statusLabel = (s: Status) => STATUS[s].label;

const pill = "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold";

export function StatusBadge({ status }: { status: Status }) {
  const { label, icon: Icon, cls } = STATUS[status];
  return (
    <span className={clsx(pill, cls)}>
      <Icon aria-hidden className="size-3.5" />
      {label}
    </span>
  );
}

export function EscalatedBadge() {
  return (
    <span className={clsx(pill, "bg-st-escalated-bg text-st-escalated")}>
      <ArrowUpCircle aria-hidden className="size-3.5" />
      Escalated
    </span>
  );
}

// Priority is a quiet signal bar + word; only Critical gets weight.
const PRIORITY: Record<Priority, { label: string; bars: number; cls: string }> = {
  critical: { label: "Critical", bars: 4, cls: "text-danger font-semibold" },
  high: { label: "High", bars: 3, cls: "text-warning font-semibold" },
  normal: { label: "Normal", bars: 2, cls: "text-muted" },
  low: { label: "Low", bars: 1, cls: "text-muted" },
};

export function PriorityBadge({ priority }: { priority: Priority }) {
  const { label, bars, cls } = PRIORITY[priority];
  return (
    <span className={clsx("inline-flex items-center gap-1.5 text-xs", cls)}>
      <span aria-hidden className="flex items-end gap-px">
        {[1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className={clsx("w-[3px] rounded-sm bg-current", i > bars && "opacity-25")}
            style={{ height: 3 + i * 2.5 }}
          />
        ))}
      </span>
      {label}
      <span className="sr-only"> priority</span>
    </span>
  );
}

export function Tag({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={clsx(pill, "border border-rule bg-sheet font-normal text-muted", className)}>
      {children}
    </span>
  );
}

/** Ticket number as written in the register: tabular figures, never truncated. */
export function TicketId({ id }: { id: string }) {
  return <span className="font-semibold whitespace-nowrap tabular-nums">{id}</span>;
}

/** The highlighter: marks the one thing that needs the reader's action. Use once per screen. */
export function Highlight({ children }: { children: ReactNode }) {
  return (
    <mark className="box-decoration-clone rounded-[0.2em] bg-highlight px-1 text-on-highlight">
      {children}
    </mark>
  );
}

const AVATAR = [
  "bg-st-assigned-bg text-st-assigned",
  "bg-st-resolved-bg text-st-resolved",
  "bg-st-progress-bg text-st-progress",
  "bg-st-reopened-bg text-st-reopened",
  "bg-st-submitted-bg text-st-submitted",
];

/** Public pseudonym chip. Never pass a real name or roll number here. */
export function Pseudonym({ alias }: { alias: string }) {
  let h = 0;
  for (const c of alias) h = (h * 31 + c.charCodeAt(0)) | 0;
  return (
    <span className="inline-flex items-center gap-2 text-sm">
      <span
        aria-hidden
        className={clsx(
          "grid size-7 place-items-center rounded-full text-xs font-bold",
          AVATAR[Math.abs(h) % AVATAR.length],
        )}
      >
        {alias.charAt(0).toUpperCase()}
      </span>
      {alias}
    </span>
  );
}
