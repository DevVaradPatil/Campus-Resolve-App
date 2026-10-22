"use client";

import { EyeOff, MessageSquare, ThumbsUp } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Pseudonym, Tag } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Banner, EmptyState } from "@/components/ui/feedback";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Dialog, DialogContent } from "@/components/ui/overlay";
import { Skeleton } from "@/components/ui/spinner";
import { LoadMore, Panel, RuledList } from "@/components/ui/surface";
import { useToast } from "@/components/ui/toast";
import { api, ApiError } from "@/lib/client/api";
import { COMMENT_MAX } from "@/lib/domain/schemas";
import { formatDateTime } from "@/lib/format";
import type { CommentView } from "@/lib/server/community";
import type { ComplaintView } from "@/lib/server/complaints";

/** "Affects me too": one per person, toggled on the server (FR-09). */
export function SupportButton({ c }: { c: ComplaintView }) {
  const toast = useToast();
  const [state, setState] = useState({ on: c.support.supported, count: c.supportCount });
  const [busy, setBusy] = useState(false);
  if (!c.support.canSupport)
    return (
      <p className="inline-flex items-center gap-1.5 text-sm text-muted">
        <ThumbsUp aria-hidden className="size-4" />
        {state.count} {state.count === 1 ? "resident" : "residents"} affected
      </p>
    );
  return (
    <Button
      variant={state.on ? "primary" : "secondary"}
      size="sm"
      aria-pressed={state.on}
      loading={busy}
      className="self-start"
      icon={<ThumbsUp aria-hidden className="size-4" />}
      onClick={async () => {
        setBusy(true);
        try {
          const r = await api<{ supported: boolean; supportCount: number }>(
            `/api/complaints/${c.id}/support`,
            { method: "POST" },
          );
          setState({ on: r.supported, count: r.supportCount });
        } catch (e) {
          toast({ title: "Couldn't update that", body: (e as Error).message, tone: "danger" });
        }
        setBusy(false);
      }}
    >
      Affects me too · {state.count}
    </Button>
  );
}

type Page = { comments: CommentView[]; next: string | null; canModerate: boolean };

export function Comments({ c }: { c: ComplaintView }) {
  const toast = useToast();
  const [page, setPage] = useState<Page>();
  const [failed, setFailed] = useState(false);
  const [body, setBody] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string>();
  const [hiding, setHiding] = useState<CommentView>();
  const [reason, setReason] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);
  const url = `/api/complaints/${c.id}/comments`;

  const reload = useCallback(() => api<Page>(url).then(setPage), [url]);
  useEffect(() => {
    let live = true;
    api<Page>(url).then(
      (p) => live && setPage(p),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [url]);

  const confidential = c.visibility === "confidential";

  return (
    <Panel title="Comments">
      <div className="flex flex-col gap-4 px-4 pb-4">
        <p className="text-sm text-muted">
          {confidential
            ? "Only you and hostel admins see this conversation."
            : "Every resident can read these. Be kind, and don't name or describe other people."}
        </p>
        {failed && <Banner tone="warning" title="Comments couldn't load. Reload to try again." />}
        {!page && !failed && <Skeleton className="h-16" />}
        {page && page.comments.length === 0 && (
          <EmptyState icon={MessageSquare} title="No comments yet">
            {confidential
              ? "Add anything the admin should know."
              : "Seen this too? Add what you noticed."}
          </EmptyState>
        )}
        {page && page.comments.length > 0 && (
          <div className="-mx-4 border-y border-rule">
            <RuledList label="Comments">
              {page.comments.map((m) => (
                <li key={m.id} className="flex flex-col gap-1 px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Pseudonym alias={m.mine ? "You" : m.author} />
                    <time dateTime={m.at} className="text-xs text-muted">
                      {formatDateTime(m.at)}
                    </time>
                    {m.hidden && (
                      <Tag>
                        <EyeOff aria-hidden className="size-3" />
                        Hidden{m.hidden.reason ? `: ${m.hidden.reason}` : ""}
                      </Tag>
                    )}
                  </div>
                  <p className="max-w-prose whitespace-pre-wrap">{m.body}</p>
                  {page.canModerate && !m.hidden && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="self-start"
                      onClick={() => setHiding(m)}
                    >
                      Hide comment
                    </Button>
                  )}
                </li>
              ))}
            </RuledList>
            {page.next && (
              <LoadMore
                shown={page.comments.length}
                loading={loadingMore}
                onLoadMore={async () => {
                  setLoadingMore(true);
                  const more = await api<Page>(`${url}?before=${page.next}`).catch(() => null);
                  if (more) setPage({ ...more, comments: [...page.comments, ...more.comments] });
                  setLoadingMore(false);
                }}
              />
            )}
          </div>
        )}

        <form
          className="flex flex-col gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setPosting(true);
            setError(undefined);
            try {
              await api(url, { method: "POST", body: { body } });
              setBody("");
              await reload();
            } catch (err) {
              const a = err as ApiError;
              setError(a.fields[0]?.message ?? a.message);
            }
            setPosting(false);
          }}
        >
          <Field label="Add a comment" error={error}>
            <Textarea
              value={body}
              maxLength={COMMENT_MAX}
              rows={3}
              onChange={(e) => setBody(e.target.value)}
            />
          </Field>
          <Button
            type="submit"
            variant="secondary"
            className="self-start"
            loading={posting}
            disabled={body.trim().length < 2}
          >
            Post comment
          </Button>
        </form>
      </div>

      <Dialog open={!!hiding} onOpenChange={(o) => !o && setHiding(undefined)}>
        <DialogContent
          title="Hide this comment"
          description="It stays in the record for moderators, with your reason."
        >
          <form
            className="flex flex-col gap-4"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await api(`${url}/${hiding!.id}/hide`, { method: "POST", body: { reason } });
                setHiding(undefined);
                setReason("");
                toast({ title: "Comment hidden" });
                await reload();
              } catch (err) {
                toast({ title: "Couldn't hide it", body: (err as Error).message, tone: "danger" });
              }
            }}
          >
            <Field label="Reason" required>
              <Input value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
            </Field>
            <Button
              type="submit"
              variant="destructive"
              className="self-end"
              disabled={reason.trim().length < 3}
            >
              Hide
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </Panel>
  );
}
