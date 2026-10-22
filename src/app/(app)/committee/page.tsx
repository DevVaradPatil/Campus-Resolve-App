"use client";

import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { IssueRow, QueueMeta } from "@/components/issue";
import { EmptyState, ServiceUnavailable } from "@/components/ui/feedback";
import { Skeleton } from "@/components/ui/spinner";
import { Panel, RuledList } from "@/components/ui/surface";
import { api } from "@/lib/client/api";
import type { QueueItem } from "@/lib/server/queue";

export default function CommitteePage() {
  const [items, setItems] = useState<QueueItem[]>();
  const [error, setError] = useState(false);

  useEffect(() => {
    let live = true;
    api<{ items: QueueItem[] }>("/api/committee/complaints").then(
      (r) => live && setItems(r.items),
      () => live && setError(true),
    );
    return () => {
      live = false;
    };
  }, []);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">Committee</h1>
        <p className="text-muted">
          Public complaints that passed their handling target or were escalated. Open one to
          escalate it to the hostel lead. Reported content is in{" "}
          <Link href="/moderation" className="text-ink underline underline-offset-2">
            Moderation
          </Link>
          .
        </p>
      </header>
      {error && <ServiceUnavailable />}
      <Panel title="Overdue or escalated">
        {!items ? (
          <div className="flex flex-col gap-3 p-4">
            <Skeleton className="h-20" />
          </div>
        ) : items.length === 0 ? (
          <div className="px-4">
            <EmptyState icon={CheckCircle2} title="Nothing overdue">
              Every open public complaint is within its handling target.
            </EmptyState>
          </div>
        ) : (
          <RuledList label="Overdue or escalated complaints">
            {items.map((i) => (
              <IssueRow
                key={i.id}
                issue={i}
                href={`/complaints/${i.id}`}
                meta={<QueueMeta item={i} />}
              />
            ))}
          </RuledList>
        )}
      </Panel>
    </div>
  );
}
