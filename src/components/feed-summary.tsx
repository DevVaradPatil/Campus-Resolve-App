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
      <nav aria-label="Shortcuts" className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {mine && (open > 0 || mine.awaitingConfirmation > 0) && (
          <Link
            href="/mine"
            className="inline-flex min-h-11 items-center gap-1 underline underline-offset-2"
          >
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
        <Link
          href="/stats"
          className="inline-flex min-h-11 items-center gap-1.5 text-ink underline underline-offset-2"
        >
          <BarChart3 aria-hidden className="size-4" />
          Hostel stats
        </Link>
        <Link
          href="/contacts"
          className="inline-flex min-h-11 items-center gap-1.5 text-ink underline underline-offset-2"
        >
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
