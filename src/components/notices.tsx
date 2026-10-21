import clsx from "clsx";
import { Camera, Phone } from "lucide-react";
import Link from "next/link";
import { Banner } from "@/components/ui/feedback";
import { formatDateTime } from "@/lib/format";

/** Always-visible strip. The app must never look like an official IIT Kanpur channel (PRD §1). */
export function PilotNotice() {
  return (
    <p className="border-b border-rule bg-sheet-sunk px-4 py-1.5 text-center text-xs text-muted">
      Student-led pilot, not an official IIT Kanpur channel.{" "}
      <Link href="/about" className="text-ink underline underline-offset-2">
        About this pilot
      </Link>
    </p>
  );
}

export type EmergencyContact = { label: string; phone: string };

/** A ticket is not emergency help (PRD §6.2). Shown on the form and on urgent issues. */
export function EmergencyNotice({ contacts }: { contacts: EmergencyContact[] }) {
  return (
    <Banner tone="danger" icon={Phone} title="In an emergency, call. Don't file a complaint.">
      <p>Nobody may see a complaint for hours.</p>
      <ul className="mt-2 flex flex-col gap-1">
        {contacts.map((c) => (
          <li key={c.label}>
            <a
              href={`tel:${c.phone.replace(/\s/g, "")}`}
              className="inline-flex min-h-11 items-center font-semibold text-danger underline underline-offset-2"
            >
              {c.label}: {c.phone}
            </a>
          </li>
        ))}
      </ul>
    </Banner>
  );
}

/** Shown before a student attaches photos to a public complaint (PRD §11.3). */
export function PublicPhotoNotice() {
  return (
    <Banner tone="info" icon={Camera} title="Every resident can see photos on a public complaint">
      Leave out faces, ID cards, documents and anything in your room you wouldn&apos;t want to
      share. Location data is removed from photos, but what&apos;s visible in the picture stays.
    </Banner>
  );
}

export type NotificationView = {
  id: string;
  title: string;
  body?: string;
  at: string;
  href: string;
  read: boolean;
};

export function NotificationItem({ n }: { n: NotificationView }) {
  return (
    <li className="relative flex gap-3 px-4 py-3 hover:bg-paper">
      <span
        aria-hidden
        className={clsx(
          "mt-2 size-2.5 shrink-0 rounded-full",
          n.read ? "bg-transparent" : "bg-ink",
        )}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <Link
          href={n.href}
          className={clsx("after:absolute after:inset-0", !n.read && "font-semibold")}
        >
          {!n.read && <span className="sr-only">Unread: </span>}
          {n.title}
        </Link>
        {n.body && <p className="text-sm text-muted">{n.body}</p>}
        <time dateTime={n.at} className="text-xs text-muted">
          {formatDateTime(n.at)}
        </time>
      </div>
    </li>
  );
}
