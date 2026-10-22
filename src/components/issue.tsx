/* eslint-disable @next/next/no-img-element -- signed attachment URLs, see ui/media.tsx */

import clsx from "clsx";
import { ChevronRight, Lock, ThumbsUp } from "lucide-react";
import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { EscalatedBadge, PriorityBadge, StatusBadge, Tag, TicketId } from "@/components/ui/badge";
import type { IssueSummary, Status } from "@/lib/domain/complaint";
import { formatDateTime } from "@/lib/format";
import type { QueueItem } from "@/lib/server/queue";

/** Safe public location, e.g. ["Block B", "Second floor", "Common bathroom"]. Never a room number. */
export function LocationPath({ parts, className }: { parts: string[]; className?: string }) {
  return (
    <span
      className={clsx("inline-flex flex-wrap items-center gap-x-1 text-sm text-muted", className)}
    >
      {parts.map((p, i) => (
        <Fragment key={p}>
          {i > 0 && <ChevronRight aria-label="in" className="size-3.5 shrink-0 opacity-70" />}
          <span>{p}</span>
        </Fragment>
      ))}
    </span>
  );
}

/** Feed / "My complaints" row. Public rows carry no reporter data by construction. */
export type PublicIssue = IssueSummary;

/** One row on the register: a feed item inside a Panel's RuledList. */
export function IssueRow({
  issue,
  href,
  meta,
}: {
  issue: PublicIssue;
  href: string;
  /** Extra line for staff lists, e.g. deadline and assignee. */
  meta?: ReactNode;
}) {
  return (
    <li className="relative flex gap-3 px-4 py-4 hover:bg-paper">
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <StatusBadge status={issue.status} />
          {issue.escalated && <EscalatedBadge />}
          <PriorityBadge priority={issue.priority} />
          {issue.confidential && (
            <Tag>
              <Lock aria-hidden className="size-3" />
              Confidential
            </Tag>
          )}
        </div>
        <h3 className="text-base leading-snug font-semibold">
          {/* Stretched link: the whole row is the tap target */}
          <Link href={href} className="after:absolute after:inset-0 hover:text-ink">
            {issue.title}
          </Link>
        </h3>
        <LocationPath parts={issue.location} />
        {meta && <p className="flex flex-wrap gap-x-3 text-sm">{meta}</p>}
        <p className="flex flex-wrap items-center gap-x-3 text-xs text-muted">
          <TicketId id={issue.ticketId} />
          <span>{issue.category}</span>
          <time dateTime={issue.createdAt}>{formatDateTime(issue.createdAt)}</time>
          <span className="inline-flex items-center gap-1 tabular-nums">
            <ThumbsUp aria-hidden className="size-3.5" />
            {issue.supportCount}
            <span className="sr-only">
              {issue.supportCount === 1 ? "resident" : "residents"} affected
            </span>
          </span>
        </p>
      </div>
      {issue.thumbUrl && (
        <img
          src={issue.thumbUrl}
          alt=""
          loading="lazy"
          className="size-20 shrink-0 rounded-thumb border border-rule object-cover"
        />
      )}
    </li>
  );
}

export type TimelineEvent = {
  id: string;
  status: Status;
  at: string;
  note?: string;
  /** e.g. "Recorded by admin" — staff have no accounts, so updates are admin-recorded (PRD §17) */
  byline: string;
};

/** Complaint history, oldest first. It is a real sequence, so it is an ordered list. */
export function StatusTimeline({ events }: { events: TimelineEvent[] }) {
  return (
    <ol className="relative flex flex-col gap-5 pl-6 before:absolute before:top-2 before:bottom-2 before:left-[7px] before:w-0.5 before:bg-rule">
      {events.map((e, i) => (
        <li key={e.id} className="relative flex flex-col gap-1">
          <span
            aria-hidden
            className={clsx(
              "absolute top-1.5 -left-6 size-4 rounded-full border-[3px] border-sheet",
              i === events.length - 1 ? "bg-ink" : "bg-line-strong",
            )}
          />
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={e.status} />
            <time dateTime={e.at} className="text-xs text-muted">
              {formatDateTime(e.at)}
            </time>
          </div>
          {e.note && <p className="max-w-prose">{e.note}</p>}
          <p className="text-xs text-muted">{e.byline}</p>
        </li>
      ))}
    </ol>
  );
}

/** Guided-form progress. The form is a true sequence of steps, so it's numbered. */
export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <nav aria-label="Progress" className="flex flex-col gap-2">
      <p className="text-sm text-muted">
        Step {current + 1} of {steps.length}
        <span className="text-text">: {steps[current]}</span>
      </p>
      <ol className="flex gap-1.5">
        {steps.map((s, i) => (
          <li
            key={s}
            aria-current={i === current ? "step" : undefined}
            className={clsx("h-1.5 flex-1 rounded-full", i <= current ? "bg-ink" : "bg-rule")}
          >
            <span className="sr-only">
              {s}
              {i < current ? " (done)" : ""}
            </span>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** Deadline + assignee line for a queue row. */
export function QueueMeta({ item }: { item: QueueItem }) {
  return (
    <>
      {item.confirmationDeadline ? (
        <span>Closes {formatDateTime(item.confirmationDeadline)} unless the reporter replies</span>
      ) : item.overdue ? (
        <span className="font-semibold text-danger">
          Overdue since {formatDateTime(item.deadline)}
        </span>
      ) : item.status !== "closed" ? (
        <span className="text-muted">Respond by {formatDateTime(item.deadline)}</span>
      ) : null}
      <span className="text-muted">{item.assignee ? `→ ${item.assignee}` : "Unassigned"}</span>
      {item.hidden && <span className="text-muted">Hidden from feed</span>}
    </>
  );
}
