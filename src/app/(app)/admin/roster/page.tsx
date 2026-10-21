"use client";

import {
  Download,
  KeyRound,
  MoreHorizontal,
  Search,
  Upload,
  UserCheck,
  UserX,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { LocationPath } from "@/components/issue";
import { Tag } from "@/components/ui/badge";
import { Button, IconButton } from "@/components/ui/button";
import { Banner, EmptyState } from "@/components/ui/feedback";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/field";
import {
  Dialog,
  DialogClose,
  DialogContent,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
} from "@/components/ui/overlay";
import { Skeleton } from "@/components/ui/spinner";
import { DataTable, LoadMore, Panel } from "@/components/ui/surface";
import { useToast } from "@/components/ui/toast";
import type { RosterEntry } from "@/app/api/admin/roster/route";
import { api, ApiError } from "@/lib/client/api";
import type { IssuedCode, RosterImportResult } from "@/lib/server/accounts";
import { ROSTER_COLUMNS } from "@/lib/domain/roster";
import { formatDateTime } from "@/lib/format";

type Page = { entries: RosterEntry[]; next: string | null };

function statusOf(e: RosterEntry): { label: string; tone: string } {
  if (!e.eligible) return { label: "Not eligible", tone: "text-muted" };
  if (e.account && !e.account.active) return { label: "Deactivated", tone: "text-danger" };
  if (e.code && !e.code.used)
    return new Date(e.code.expiresAt).getTime() > Date.now()
      ? { label: `Code issued, expires ${formatDateTime(e.code.expiresAt)}`, tone: "text-warning" }
      : { label: "Code expired", tone: "text-danger" };
  if (e.account) return { label: "Active", tone: "text-success" };
  return { label: "Not activated", tone: "text-muted" };
}

function downloadCsv(name: string, rows: string[][]) {
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const blob = new Blob([rows.map((r) => r.map(esc).join(",")).join("\n")], { type: "text/csv" });
  const a = Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(blob),
    download: name,
  });
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function RosterPage() {
  const toast = useToast();
  const [page, setPage] = useState<Page | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string>();
  const [codes, setCodes] = useState<{
    issued: IssuedCode[];
    skipped: { rollNumber: string; reason: string }[];
  }>();
  const [confirm, setConfirm] = useState<{
    title: string;
    body: string;
    action: string;
    run: () => Promise<void>;
  }>();
  const [roomFor, setRoomFor] = useState<RosterEntry>();

  const load = useCallback(async (query: string, after?: string) => {
    const params = new URLSearchParams({ ...(query && { q: query }), ...(after && { after }) });
    try {
      const res = await api<Page>(`/api/admin/roster?${params}`);
      setError(undefined);
      setPage((p) =>
        after && p ? { entries: [...p.entries, ...res.entries], next: res.next } : res,
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    let live = true;
    api<Page>("/api/admin/roster")
      .then((res) => live && setPage(res))
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, []);

  const reload = () => load(q);

  async function issue(rollNumbers: string[]) {
    try {
      setCodes(await api("/api/admin/roster/codes", { method: "POST", body: { rollNumbers } }));
      reload();
    } catch (e) {
      toast({ title: "Couldn't issue codes", body: (e as Error).message, tone: "danger" });
    }
  }

  async function act(path: string, body: unknown, done: string) {
    try {
      await api(path, { method: "POST", body });
      toast({ title: done });
      reload();
    } catch (e) {
      toast({ title: "That didn't work", body: (e as ApiError).message, tone: "danger" });
    }
  }

  const pendingOnPage =
    page?.entries.filter((e) => e.eligible && !e.account && !(e.code && !e.code.used)) ?? [];

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">Roster and accounts</h1>
        <p className="max-w-prose text-muted">
          Only students on this roster can activate an account. Removing someone or marking them not
          eligible signs them out immediately.
        </p>
      </header>

      <ImportPanel onApplied={reload} />

      <Panel
        title="Students"
        action={
          pendingOnPage.length > 0 && (
            <Button
              size="sm"
              variant="secondary"
              icon={<KeyRound aria-hidden className="size-4" />}
              onClick={() => issue(pendingOnPage.map((e) => e.rollNumber))}
            >
              Issue {pendingOnPage.length} code{pendingOnPage.length === 1 ? "" : "s"}
            </Button>
          )
        }
      >
        <form
          role="search"
          className="flex gap-2 px-4 pb-3"
          onSubmit={(e) => {
            e.preventDefault();
            setPage(null);
            load(q);
          }}
        >
          <label htmlFor="roster-q" className="sr-only">
            Search by roll number
          </label>
          <Input
            id="roster-q"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Roll number starts with…"
            maxLength={12}
          />
          <IconButton label="Search" variant="secondary" type="submit">
            <Search aria-hidden className="size-5" />
          </IconButton>
        </form>
        {error && <Banner tone="danger" title={error} className="mx-4 mb-4" />}
        {!page && !error && (
          <div className="flex flex-col gap-3 p-4">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-5 w-1/2" />
          </div>
        )}
        {page && page.entries.length === 0 && (
          <div className="px-4">
            <EmptyState icon={Users} title={q ? "No roll numbers match" : "The roster is empty"}>
              {q
                ? "Check the number and search again."
                : "Import a roster CSV above to get started."}
            </EmptyState>
          </div>
        )}
        {page && page.entries.length > 0 && (
          <>
            <DataTable
              caption="Roster"
              rows={page.entries}
              rowKey={(e) => e.rollNumber}
              columns={[
                {
                  key: "roll",
                  header: "Roll number",
                  cell: (e) => <span className="tabular-nums">{e.rollNumber}</span>,
                },
                { key: "name", header: "Name", cell: (e) => e.name || "–" },
                {
                  key: "room",
                  header: "Room",
                  cell: (e) => (
                    <LocationPath parts={[`Block ${e.block}`, e.floor, e.room].filter(Boolean)} />
                  ),
                },
                {
                  key: "status",
                  header: "Status",
                  cell: (e) => {
                    const s = statusOf(e);
                    return <span className={s.tone}>{s.label}</span>;
                  },
                },
                {
                  key: "role",
                  header: "Role",
                  cell: (e) =>
                    !e.account ? (
                      "–"
                    ) : e.account.role === "committee" ? (
                      <Tag>Committee</Tag>
                    ) : (
                      "Student"
                    ),
                },
                { key: "actions", header: "Actions", cell: (e) => rowActions(e) },
              ]}
            />
            {page.next && (
              <LoadMore
                shown={page.entries.length}
                loading={loadingMore}
                onLoadMore={async () => {
                  setLoadingMore(true);
                  await load(q, page.next!);
                  setLoadingMore(false);
                }}
              />
            )}
          </>
        )}
      </Panel>

      <CodesDialog codes={codes} onClose={() => setCodes(undefined)} />
      <ConfirmDialog confirm={confirm} onClose={() => setConfirm(undefined)} />
      <RoomDialog
        entry={roomFor}
        onClose={() => setRoomFor(undefined)}
        onSave={(loc) =>
          act(`/api/admin/roster/${roomFor!.rollNumber}/room`, loc, "Room updated").then(() =>
            setRoomFor(undefined),
          )
        }
      />
    </div>
  );

  function rowActions(e: RosterEntry) {
    const uid = e.uid;
    return (
      <Menu>
        <MenuTrigger asChild>
          <IconButton label={`Actions for ${e.rollNumber}`} variant="ghost">
            <MoreHorizontal aria-hidden className="size-5" />
          </IconButton>
        </MenuTrigger>
        <MenuContent>
          {e.eligible && (!e.account || e.account.active) && (
            <MenuItem
              icon={<KeyRound aria-hidden className="size-4" />}
              onSelect={() =>
                e.account
                  ? setConfirm({
                      title: `Reset password for ${e.rollNumber}?`,
                      body: "Their current password stops working and they're signed out everywhere. They'll activate again with the new code.",
                      action: "Reset password",
                      run: () => issue([e.rollNumber]),
                    })
                  : issue([e.rollNumber])
              }
            >
              {e.account
                ? "Reset password"
                : e.code && !e.code.used
                  ? "Issue a new code"
                  : "Issue activation code"}
            </MenuItem>
          )}
          <MenuItem onSelect={() => setRoomFor(e)}>Change room</MenuItem>
          {uid && e.account?.active && (
            <MenuItem
              onSelect={() =>
                act(
                  `/api/admin/users/${uid}/role`,
                  { role: e.account!.role === "committee" ? "student" : "committee", grants: [] },
                  "Role updated",
                )
              }
            >
              {e.account.role === "committee" ? "Remove from committee" : "Make committee member"}
            </MenuItem>
          )}
          {uid && e.account?.active && (
            <MenuItem
              destructive
              icon={<UserX aria-hidden className="size-4" />}
              onSelect={() =>
                setConfirm({
                  title: `Deactivate ${e.rollNumber}?`,
                  body: "They're signed out immediately and can't sign in until you reactivate them.",
                  action: "Deactivate",
                  run: () =>
                    act(`/api/admin/users/${uid}/active`, { active: false }, "Account deactivated"),
                })
              }
            >
              Deactivate
            </MenuItem>
          )}
          {uid && e.account && !e.account.active && e.eligible && (
            <MenuItem
              icon={<UserCheck aria-hidden className="size-4" />}
              onSelect={() =>
                act(`/api/admin/users/${uid}/active`, { active: true }, "Account reactivated")
              }
            >
              Reactivate
            </MenuItem>
          )}
        </MenuContent>
      </Menu>
    );
  }
}

function ImportPanel({ onApplied }: { onApplied: () => void }) {
  const toast = useToast();
  const [csv, setCsv] = useState("");
  const [removeMissing, setRemoveMissing] = useState(false);
  const [preview, setPreview] = useState<RosterImportResult>();
  const [busy, setBusy] = useState(false);

  async function run(apply: boolean) {
    setBusy(true);
    try {
      const r = await api<RosterImportResult>("/api/admin/roster/import", {
        method: "POST",
        body: { csv, removeMissing, apply },
      });
      if (apply && r.applied) {
        toast({
          title: "Roster imported",
          body: `${r.summary.add} added, ${r.summary.update} updated, ${r.summary.remove} removed.`,
        });
        setPreview(undefined);
        setCsv("");
        onApplied();
      } else setPreview(r);
    } catch (e) {
      toast({ title: "Import failed", body: (e as Error).message, tone: "danger" });
    }
    setBusy(false);
  }

  const s = preview?.summary;
  return (
    <Panel title="Import roster">
      <form
        className="flex flex-col gap-4 px-4 pb-4"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          run(false);
        }}
      >
        <p className="text-sm text-muted">
          CSV with the columns{" "}
          <span className="font-semibold text-text">{ROSTER_COLUMNS.join(", ")}</span>. Eligible is
          yes or no.{" "}
          <button
            type="button"
            className="text-ink underline underline-offset-2"
            onClick={() =>
              downloadCsv("roster-template.csv", [
                [...ROSTER_COLUMNS],
                ["231001", "Asha Rao", "B", "2", "214", "yes"],
              ])
            }
          >
            Download a template
          </button>
        </p>
        <label className="inline-flex w-fit cursor-pointer items-center gap-2 font-semibold text-ink">
          <Upload aria-hidden className="size-5" />
          Choose CSV file
          <input
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              setCsv(await f.text());
              setPreview(undefined);
            }}
          />
        </label>
        <Field label="Or paste the CSV" hint="The first line must be the column names.">
          <Textarea
            value={csv}
            maxLength={500_000}
            onChange={(e) => (setCsv(e.target.value), setPreview(undefined))}
            className="font-[inherit] text-sm"
            rows={5}
          />
        </Field>
        <Checkbox
          checked={removeMissing}
          onChange={(e) => (setRemoveMissing(e.target.checked), setPreview(undefined))}
          label="This file is the complete roster"
          description="Students not in the file are marked not eligible and signed out."
        />
        <Button
          type="submit"
          variant="secondary"
          loading={busy && !preview}
          disabled={!csv.trim()}
          className="self-start"
        >
          Preview changes
        </Button>

        {preview && s && (
          <div className="flex flex-col gap-3 rounded-control border border-rule p-4">
            {preview.errors.length > 0 ? (
              <Banner
                tone="danger"
                title={`Fix ${preview.errors.length} problem${preview.errors.length === 1 ? "" : "s"} in the file`}
              >
                <ul className="mt-1 list-disc pl-5">
                  {preview.errors.slice(0, 20).map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              </Banner>
            ) : (
              <>
                <p>
                  <span className="font-semibold">{s.add}</span> new,{" "}
                  <span className="font-semibold">{s.update}</span> updated,{" "}
                  <span className="font-semibold">{s.remove}</span> to remove,{" "}
                  <span className="text-muted">{s.unchanged} unchanged</span>.
                </p>
                {preview.diff.remove.length > 0 && (
                  <Banner tone="warning" title={`${s.remove} students will be signed out`}>
                    {preview.diff.remove
                      .slice(0, 10)
                      .map((r) => r.rollNumber)
                      .join(", ")}
                    {s.remove > 10 && ` and ${s.remove - 10} more`}
                  </Banner>
                )}
                <Button
                  onClick={() => run(true)}
                  loading={busy}
                  disabled={s.add + s.update + s.remove === 0}
                  className="self-start"
                >
                  Apply import
                </Button>
              </>
            )}
          </div>
        )}
      </form>
    </Panel>
  );
}

function CodesDialog({
  codes,
  onClose,
}: {
  codes?: { issued: IssuedCode[]; skipped: { rollNumber: string; reason: string }[] };
  onClose: () => void;
}) {
  return (
    <Dialog open={!!codes} onOpenChange={(o) => !o && onClose()}>
      {codes && (
        <DialogContent
          title={`${codes.issued.length} activation code${codes.issued.length === 1 ? "" : "s"}`}
          description="Shown only once. Download or hand them out now: they can't be looked up later."
          variant="center"
          className="max-w-2xl"
        >
          {codes.issued.length > 0 && (
            <ul className="divide-y divide-rule rounded-control border border-rule">
              {codes.issued.map((c) => (
                <li
                  key={c.rollNumber}
                  className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
                >
                  <span>
                    <span className="font-semibold tabular-nums">{c.rollNumber}</span>{" "}
                    <span className="text-muted">{c.name}</span>
                    {c.kind === "reset" && <Tag className="ml-2">Password reset</Tag>}
                  </span>
                  <span className="text-lg font-bold tracking-wider tabular-nums select-all">
                    {c.code}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {codes.skipped.length > 0 && (
            <Banner tone="warning" title={`${codes.skipped.length} skipped`} className="mt-3">
              {codes.skipped.map((s) => `${s.rollNumber}: ${s.reason}`).join(". ")}
            </Banner>
          )}
          <p className="mt-3 text-sm text-muted">
            Codes expire {codes.issued[0] && formatDateTime(codes.issued[0].expiresAt)}. Students
            activate at /activate.
          </p>
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            {codes.issued.length > 0 && (
              <Button
                variant="secondary"
                icon={<Download aria-hidden className="size-5" />}
                onClick={() =>
                  downloadCsv("activation-codes.csv", [
                    ["rollNumber", "name", "code", "expires"],
                    ...codes.issued.map((c) => [
                      c.rollNumber,
                      c.name,
                      c.code,
                      formatDateTime(c.expiresAt),
                    ]),
                  ])
                }
              >
                Download CSV
              </Button>
            )}
            <DialogClose asChild>
              <Button>Done</Button>
            </DialogClose>
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}

function ConfirmDialog({
  confirm,
  onClose,
}: {
  confirm?: { title: string; body: string; action: string; run: () => Promise<void> };
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={!!confirm} onOpenChange={(o) => !o && onClose()}>
      {confirm && (
        <DialogContent title={confirm.title} description={confirm.body} variant="center">
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="ghost">Cancel</Button>
            </DialogClose>
            <Button
              variant="destructive"
              loading={busy}
              onClick={async () => {
                setBusy(true);
                await confirm.run();
                setBusy(false);
                onClose();
              }}
            >
              {confirm.action}
            </Button>
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}

function RoomDialog({
  entry,
  onClose,
  onSave,
}: {
  entry?: RosterEntry;
  onClose: () => void;
  onSave: (loc: { block: string; floor: string; room: string }) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={!!entry} onOpenChange={(o) => !o && onClose()}>
      {entry && (
        <DialogContent
          title={`Change room for ${entry.rollNumber}`}
          description="Their account and history stay the same."
        >
          <form
            className="flex flex-col gap-4"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              setBusy(true);
              await onSave({
                block: String(f.get("block")),
                floor: String(f.get("floor")),
                room: String(f.get("room")),
              });
              setBusy(false);
            }}
          >
            <Field label="Block" required>
              <Input name="block" defaultValue={entry.block} maxLength={80} />
            </Field>
            <Field label="Floor">
              <Input name="floor" defaultValue={entry.floor} maxLength={80} />
            </Field>
            <Field label="Room">
              <Input name="room" defaultValue={entry.room} maxLength={80} />
            </Field>
            <div className="flex justify-end gap-2">
              <DialogClose asChild>
                <Button variant="ghost">Cancel</Button>
              </DialogClose>
              <Button type="submit" loading={busy}>
                Save room
              </Button>
            </div>
          </form>
        </DialogContent>
      )}
    </Dialog>
  );
}
