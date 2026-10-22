"use client";

import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  where,
  type Timestamp,
} from "firebase/firestore";
import { BarChart3, Phone } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { IssueRow } from "@/components/issue";
import { Highlight } from "@/components/ui/badge";
import { Panel, RuledList } from "@/components/ui/surface";
import { api } from "@/lib/client/api";
import { db } from "@/lib/client/firebase";
import type { IssueSummary, PublicComplaint } from "@/lib/domain/complaint";

const chip =
  "inline-flex h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-rule bg-sheet px-4 font-semibold text-ink hover:bg-ink-soft";

type Mine = {
  submitted: number;
  inProgress: number;
  awaitingConfirmation: number;
  reopened: number;
  closed: number;
  overdue: number;
};

/**
 * Top of the feed (PRD §7.1): the reader's own complaints at a glance, with the one thing that
 * needs them highlighted, and any open critical issues in the hostel.
 */
export function FeedSummary() {
  const [mine, setMine] = useState<Mine>();
  const [urgent, setUrgent] = useState<IssueSummary[]>([]);

  useEffect(() => {
    let live = true;
    api<Mine>("/api/me/summary").then(
      (m) => live && setMine(m),
      () => {},
    );
    getDocs(
      query(
        collection(db, "publicComplaints"),
        where("open", "==", true),
        where("priority", "==", "critical"),
        orderBy("createdAt", "desc"),
        limit(3),
      ),
    ).then(
      (snap) =>
        live &&
        setUrgent(
          snap.docs.map((d) => {
            const p = d.data() as PublicComplaint<Timestamp>;
            return {
              id: d.id,
              ticketId: p.ticketId,
              title: p.title,
              category: p.categoryLabel,
              status: p.status,
              priority: p.priority,
              escalated: p.escalated,
              supportCount: p.supportCount,
              location: p.location,
              createdAt: p.createdAt.toDate().toISOString(),
            };
          }),
        ),
      () => {}, // the feed below still works
    );
    return () => {
      live = false;
    };
  }, []);

  const open = mine ? mine.submitted + mine.inProgress + mine.reopened : 0;
  return (
    <>
      <nav
        aria-label="Shortcuts"
        className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 text-sm [scrollbar-width:none] md:mx-0 md:px-0"
      >
        {mine && (open > 0 || mine.awaitingConfirmation > 0) && (
          <Link href="/mine" className={chip}>
            {mine.awaitingConfirmation > 0 ? (
              <Highlight>
                {mine.awaitingConfirmation} of yours{" "}
                {mine.awaitingConfirmation === 1 ? "needs" : "need"} your reply
              </Highlight>
            ) : (
              `${open} of yours open${mine.overdue ? `, ${mine.overdue} overdue` : ""}`
            )}
          </Link>
        )}
        <Link href="/stats" className={chip}>
          <BarChart3 aria-hidden className="size-4" />
          Hostel stats
        </Link>
        <Link href="/contacts" className={chip}>
          <Phone aria-hidden className="size-4" />
          Contacts
        </Link>
      </nav>
      {urgent.length > 0 && (
        <Panel title="Urgent right now">
          <RuledList label="Open critical complaints">
            {urgent.map((i) => (
              <IssueRow key={i.id} issue={i} href={`/complaints/${i.id}`} />
            ))}
          </RuledList>
        </Panel>
      )}
    </>
  );
}
