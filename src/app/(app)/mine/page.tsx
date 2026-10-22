"use client";

import { ClipboardList, Plus } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { IssueRow } from "@/components/issue";
import { buttonClass } from "@/components/ui/button";
import { EmptyState, ServiceUnavailable } from "@/components/ui/feedback";
import { Skeleton } from "@/components/ui/spinner";
import { LoadMore, Panel, RuledList } from "@/components/ui/surface";
import { api } from "@/lib/client/api";
import type { IssueSummary } from "@/lib/domain/complaint";

type Page = { items: IssueSummary[]; next: string | null };

export default function MinePage() {
  const [page, setPage] = useState<Page>();
  const [error, setError] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(async (after?: string) => {
    try {
      const res = await api<Page>(`/api/complaints/mine${after ? `?after=${after}` : ""}`);
      setPage((p) => (after && p ? { items: [...p.items, ...res.items], next: res.next } : res));
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    let live = true;
    api<Page>("/api/complaints/mine").then(
      (res) => live && setPage(res),
      () => live && setError(true),
    );
    return () => {
      live = false;
    };
  }, []);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <h1 className="text-2xl font-bold">My complaints</h1>
      {error && <ServiceUnavailable />}
      <Panel>
        {!page ? (
          <div className="flex flex-col gap-3 p-4">
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
        ) : page.items.length === 0 ? (
          <div className="px-4">
            <EmptyState
              icon={ClipboardList}
              title="You haven't reported anything yet"
              action={
                <Link href="/new" className={buttonClass()}>
                  <Plus aria-hidden className="size-5" />
                  New complaint
                </Link>
              }
            >
              Your complaints, public and confidential, are listed here with their status.
            </EmptyState>
          </div>
        ) : (
          <>
            <h2 className="sr-only">Your complaints, newest first</h2>
            <RuledList label="My complaints">
              {page.items.map((i) => (
                <IssueRow key={i.id} issue={i} href={`/complaints/${i.id}`} />
              ))}
            </RuledList>
            {page.next && (
              <LoadMore
                shown={page.items.length}
                loading={loadingMore}
                onLoadMore={async () => {
                  setLoadingMore(true);
                  await load(page.next!);
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
