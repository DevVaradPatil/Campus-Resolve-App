"use client";

import { FileQuestion, Lock } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ComplaintActions } from "@/components/complaint-actions";
import { Comments, ReportButton, SupportButton } from "@/components/complaint-community";
import { LocationPath, StatusTimeline } from "@/components/issue";
import { EmergencyNotice, PublicPhotoNotice } from "@/components/notices";
import { EscalatedBadge, PriorityBadge, StatusBadge, Tag, TicketId } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { Banner, EmptyState, ServiceUnavailable } from "@/components/ui/feedback";
import { Thumbnail, UploadDropzone, type UploadItem } from "@/components/ui/media";
import { Skeleton } from "@/components/ui/spinner";
import { Panel } from "@/components/ui/surface";
import { api, ApiError, downscalePhoto, uploadPhoto } from "@/lib/client/api";
import { useHostelConfig } from "@/lib/client/config";
import { LIMITS } from "@/lib/domain/complaint";
import { formatDateTime } from "@/lib/format";
import type { ComplaintView } from "@/lib/server/complaints";

export default function ComplaintPage() {
  const { id } = useParams<{ id: string }>();
  const { config } = useHostelConfig();
  const [c, setC] = useState<ComplaintView>();
  const [error, setError] = useState<ApiError>();
  const [uploads, setUploads] = useState<UploadItem[]>([]);

  const load = useCallback(async () => {
    try {
      setC(await api<ComplaintView>(`/api/complaints/${id}`));
      setError(undefined);
    } catch (e) {
      setError(e as ApiError);
    }
  }, [id]);

  useEffect(() => {
    let live = true;
    api<ComplaintView>(`/api/complaints/${id}`).then(
      (res) => live && setC(res),
      (e: ApiError) => live && setError(e),
    );
    return () => {
      live = false;
    };
  }, [id]);

  if (error?.status === 404)
    return (
      <div className="mx-auto max-w-3xl">
        <EmptyState
          icon={FileQuestion}
          title="We can't show this complaint"
          action={
            <Link href="/" className={buttonClass("secondary")}>
              Back to the feed
            </Link>
          }
        >
          It doesn&apos;t exist, or it&apos;s confidential and belongs to someone else.
        </EmptyState>
      </div>
    );
  if (error) return <ServiceUnavailable />;
  if (!c)
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <Skeleton className="h-28" />
        <Skeleton className="h-48" />
      </div>
    );

  async function addPhotos(files: File[]) {
    for (const file of files.slice(0, LIMITS.photos - c!.photos.length - uploads.length)) {
      const item: UploadItem = { id: crypto.randomUUID(), name: file.name, progress: 0 };
      const update = (patch: Partial<UploadItem>) =>
        setUploads((us) => us.map((u) => (u.id === item.id ? { ...u, ...patch } : u)));
      setUploads((us) => [...us, item]);
      try {
        await uploadPhoto(c!.id, await downscalePhoto(file), (progress) => update({ progress }));
        setUploads((us) => us.filter((u) => u.id !== item.id));
        await load();
      } catch (e) {
        update({ progress: undefined, error: (e as Error).message });
      }
    }
  }

  return (
    <article className="mx-auto flex max-w-3xl flex-col gap-6">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={c.status} />
          {c.escalated && <EscalatedBadge />}
          <PriorityBadge priority={c.priority} />
          {c.visibility === "confidential" && (
            <Tag>
              <Lock aria-hidden className="size-3" />
              Confidential
            </Tag>
          )}
        </div>
        <h1 className="text-2xl font-bold">{c.title}</h1>
        <p className="flex flex-wrap gap-x-3 text-sm text-muted">
          <TicketId id={c.ticketId} />
          <span>
            {c.category}
            {c.subcategory && ` · ${c.subcategory}`}
          </span>
          <span>
            Reported by {c.reporterLabel} on{" "}
            <time dateTime={c.createdAt}>{formatDateTime(c.createdAt)}</time>
          </span>
        </p>
        <LocationPath parts={c.location} />
        <div className="flex flex-wrap items-center gap-2">
          <SupportButton c={c} />
          {c.viewer === "public" && <ReportButton complaintId={c.id} what="complaint" />}
        </div>
        {c.workflow.assignee && (
          <p className="text-sm">
            Assigned to <span className="font-semibold">{c.workflow.assignee}</span>
          </p>
        )}
        {c.workflow.closureReason && (
          <p className="text-sm text-muted">
            {c.workflow.closureReason === "student_confirmed"
              ? "Closed after the reporter confirmed it was fixed."
              : "Closed automatically: the reporter didn't reply before the deadline."}
          </p>
        )}
      </header>

      {c.mergedInto && (
        <Banner tone="info" title="Merged with another report">
          This was reported more than once, so it&apos;s being handled{" "}
          {c.mergedInto === "hidden" ? (
            "on another complaint."
          ) : (
            <>
              on{" "}
              <Link
                href={`/complaints/${c.mergedInto.id}`}
                className="font-semibold text-ink underline"
              >
                {c.mergedInto.ticketId}
              </Link>
              .
            </>
          )}{" "}
          Its history is kept here.
        </Banner>
      )}

      <ComplaintActions c={c} onChanged={load} />

      {c.priority === "critical" && config && (
        <EmergencyNotice contacts={config.emergencyContacts} />
      )}

      <Panel title="Description">
        <p className="max-w-prose px-4 pb-4 whitespace-pre-wrap">{c.description}</p>
      </Panel>

      {c.details && (
        <Panel title="Private details">
          <p className="px-4 text-sm text-muted">
            <Lock aria-hidden className="mr-1 inline size-3.5" />
            Only {c.viewer === "owner" ? "you" : "the reporter"} and hostel admins see this.
          </p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 p-4">
            <dt className="text-muted">Room or spot</dt>
            <dd>{c.details.roomReference ?? "Not given"}</dd>
            <dt className="text-muted">More about where</dt>
            <dd>{c.details.locationDescription ?? "Not given"}</dd>
            <dt className="text-muted">Marked urgent</dt>
            <dd>{c.details.urgent ? "Yes" : "No"}</dd>
            <dt className="text-muted">Handling target</dt>
            <dd>
              First response by {formatDateTime(c.details.firstActionDeadline)}
              <span className="block text-sm text-muted">
                A pilot target, not a promise from hostel staff.
              </span>
            </dd>
          </dl>
        </Panel>
      )}

      {(c.photos.length > 0 || c.canAddPhotos) && (
        <Panel title="Photos">
          <div className="flex flex-col gap-4 px-4 pb-4">
            {c.photos.length > 0 && (
              <ul className="flex flex-wrap gap-3">
                {c.photos.map((p, i) => (
                  <li key={p.id}>
                    <Thumbnail src={p.url} alt={`Photo ${i + 1} attached to ${c.ticketId}`} />
                    {c.viewer === "public" && (
                      <ReportButton complaintId={c.id} photoId={p.id} what="photo" />
                    )}
                  </li>
                ))}
              </ul>
            )}
            {c.canAddPhotos && (
              <>
                {c.visibility === "public" && <PublicPhotoNotice />}
                <UploadDropzone
                  items={uploads}
                  maxFiles={LIMITS.photos - c.photos.length}
                  maxMb={LIMITS.photoMb}
                  onAdd={addPhotos}
                  onRemove={(uid) => setUploads((us) => us.filter((u) => u.id !== uid))}
                />
              </>
            )}
          </div>
        </Panel>
      )}

      <Panel title="History">
        <div className="px-4 pb-5">
          <StatusTimeline events={c.timeline} />
        </div>
      </Panel>

      <Comments c={c} />
    </article>
  );
}
