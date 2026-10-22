"use client";

/* eslint-disable @next/next/no-img-element -- short-lived signed URLs, see ui/media.tsx */

import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Tag, TicketId } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, ServiceUnavailable } from "@/components/ui/feedback";
import { Skeleton } from "@/components/ui/spinner";
import { LoadMore, Panel, RuledList } from "@/components/ui/surface";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/client/api";
import { formatDateTime } from "@/lib/format";
import type { ReportView } from "@/lib/server/moderation";

type Page = { items: ReportView[]; next: string | null };
const WHAT = { complaint: "Complaint", comment: "Comment", photo: "Photo" };
// Reports on the same thing resolve together.
const sameThing = (a: ReportView, b: ReportView) =>
  a.targetType === b.targetType &&
  a.complaintId === b.complaintId &&
  a.preview.text === b.preview.text &&
  (a.targetType !== "photo" || a.id === b.id);

export default function ModerationPage() {
  const toast = useToast();
  const [page, setPage] = useState<Page>();
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState<string>();
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    let live = true;
    api<Page>("/api/moderation").then(
      (p) => live && setPage(p),
      () => live && setError(true),
    );
    return () => {
      live = false;
    };
  }, []);

  async function resolve(r: ReportView, action: "keep" | "hide") {
    setBusy(r.id + action);
    try {
      await api(`/api/moderation/${r.id}`, { method: "POST", body: { action } });
      setPage((p) => p && { ...p, items: p.items.filter((x) => !sameThing(x, r)) });
      toast({ title: action === "hide" ? "Hidden" : "Kept" });
    } catch (e) {
      toast({ title: "Couldn't do that", body: (e as Error).message, tone: "danger" });
    }
    setBusy(undefined);
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">Moderation</h1>
        <p className="text-muted">
          Things residents reported. Hiding a complaint takes it off the public feed, a hidden
          comment is seen only by moderators, and a hidden photo is unpublished. Nothing is deleted.
        </p>
      </header>
      {error && <ServiceUnavailable />}
      <Panel title="Open reports">
        {!page ? (
          <div className="p-4">
            <Skeleton className="h-24" />
          </div>
        ) : page.items.length === 0 ? (
          <div className="px-4">
            <EmptyState icon={CheckCircle2} title="Nothing to review">
              New reports show up here.
            </EmptyState>
          </div>
        ) : (
          <>
            <RuledList label="Open reports">
              {page.items.map((r) => (
                <li key={r.id} className="flex flex-col gap-2 px-4 py-4">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <Tag>{WHAT[r.targetType]}</Tag>
                    <Link href={`/complaints/${r.complaintId}`} className="text-ink underline">
                      <TicketId id={r.ticketId} />
                    </Link>
                    <time dateTime={r.at} className="text-muted">
                      {formatDateTime(r.at)}
                    </time>
                    {r.preview.alreadyHidden && <Tag>Already hidden</Tag>}
                  </div>
                  <p className="font-semibold">{r.reason}</p>
                  {r.note && <p className="text-sm">&ldquo;{r.note}&rdquo;</p>}
                  {r.preview.text && (
                    <blockquote className="max-w-prose rounded-control bg-sheet-sunk p-3 text-sm whitespace-pre-wrap">
                      {r.preview.text}
                    </blockquote>
                  )}
                  {r.preview.photoUrl && (
                    <img
                      src={r.preview.photoUrl}
                      alt="Reported photo"
                      className="max-h-48 self-start rounded-thumb border border-rule"
                    />
                  )}
                  <div className="flex flex-wrap gap-3">
                    <Button
                      variant="destructive"
                      size="sm"
                      loading={busy === r.id + "hide"}
                      disabled={r.preview.alreadyHidden}
                      onClick={() => resolve(r, "hide")}
                    >
                      Hide {WHAT[r.targetType].toLowerCase()}
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      loading={busy === r.id + "keep"}
                      onClick={() => resolve(r, "keep")}
                    >
                      {r.preview.alreadyHidden ? "Close report" : "Keep it"}
                    </Button>
                  </div>
                </li>
              ))}
            </RuledList>
            {page.next && (
              <LoadMore
                shown={page.items.length}
                loading={loadingMore}
                onLoadMore={async () => {
                  setLoadingMore(true);
                  const more = await api<Page>(`/api/moderation?after=${page.next}`).catch(
                    () => null,
                  );
                  if (more) setPage({ items: [...page.items, ...more.items], next: more.next });
                  setLoadingMore(false);
                }}
              />
            )}
          </>
        )}
      </Panel>
    </div>
  );
}
