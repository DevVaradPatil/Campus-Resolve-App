"use client";

import { Inbox } from "lucide-react";
import { useEffect, useState } from "react";
import { IssueRow, QueueMeta } from "@/components/issue";
import { EmptyState, ServiceUnavailable } from "@/components/ui/feedback";
import { Checkbox, Field, Select } from "@/components/ui/field";
import { Tabs, TabsContent, TabsList } from "@/components/ui/overlay";
import { Skeleton } from "@/components/ui/spinner";
import { LoadMore, Panel, RuledList } from "@/components/ui/surface";
import { api } from "@/lib/client/api";
import { useHostelConfig } from "@/lib/client/config";
import { PRIORITIES } from "@/lib/domain/complaint";
import type { QueueItem } from "@/lib/server/queue";

type View = "active" | "resolved" | "closed";
type Page = { items: QueueItem[]; next: string | null };

const VIEWS: { value: View; label: string }[] = [
  { value: "active", label: "Needs action" },
  { value: "resolved", label: "Awaiting confirmation" },
  { value: "closed", label: "Closed" },
];
const FILTERS = {
  status: "",
  priority: "",
  categoryId: "",
  blockId: "",
  assignee: "",
  escalated: "",
};
const STATUS_OPTIONS = [
  ["submitted", "Submitted"],
  ["assigned", "Assigned"],
  ["in_progress", "In progress"],
  ["reopened", "Reopened"],
];

export default function QueuePage() {
  const { config } = useHostelConfig();
  const [view, setView] = useState<View>("active");
  const [filters, setFilters] = useState(FILTERS);
  const [contacts, setContacts] = useState<{ id: string; name: string }[]>([]);
  const [page, setPage] = useState<Page & { for: string }>();
  const [error, setError] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const query = new URLSearchParams({ view, ...(view === "active" ? filters : {}) }).toString();

  useEffect(() => {
    api<{ contacts: { id: string; name: string }[] }>("/api/admin/config").then(
      (c) => setContacts(c.contacts),
      () => {}, // without contacts.manage the assignee filter just isn't offered
    );
  }, []);

  useEffect(() => {
    let live = true;
    api<Page>(`/api/admin/complaints?${query}`).then(
      (p) => {
        if (!live) return;
        setPage({ ...p, for: query });
        setError(false);
      },
      () => live && setError(true),
    );
    return () => {
      live = false;
    };
  }, [query]);

  async function more() {
    if (!page?.next) return;
    setLoadingMore(true);
    try {
      const p = await api<Page>(`/api/admin/complaints?${query}&after=${page.next}`);
      setPage({ items: [...page.items, ...p.items], next: p.next, for: query });
    } catch {
      setError(true);
    }
    setLoadingMore(false);
  }

  const set = (k: keyof typeof FILTERS) => (v: string) => setFilters((f) => ({ ...f, [k]: v }));
  const select = (k: keyof typeof FILTERS, label: string, options: string[][]) => (
    <Field label={label}>
      <Select value={filters[k]} onChange={(e) => set(k)(e.target.value)}>
        <option value="">Any</option>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </Select>
    </Field>
  );

  const list =
    page?.for !== query ? (
      <div className="flex flex-col gap-3 p-4">
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
      </div>
    ) : page.items.length === 0 ? (
      <div className="px-4">
        <EmptyState icon={Inbox} title="Nothing here">
          {view === "active"
            ? "No open complaints match. New ones appear here, earliest deadline first."
            : "Complaints show up here as they move through the workflow."}
        </EmptyState>
      </div>
    ) : (
      <>
        <RuledList label="Complaints">
          {page.items.map((i) => (
            <IssueRow
              key={i.id}
              issue={i}
              href={`/complaints/${i.id}`}
              meta={<QueueMeta item={i} />}
            />
          ))}
        </RuledList>
        {page.next && (
          <LoadMore shown={page.items.length} loading={loadingMore} onLoadMore={more} />
        )}
      </>
    );

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">Complaint queue</h1>
        <p className="text-muted">
          Earliest handling deadline first, so overdue complaints are on top.
        </p>
      </header>
      {error && <ServiceUnavailable />}
      <Panel>
        <Tabs value={view} onValueChange={(v) => setView(v as View)}>
          <div className="px-2 pt-2">
            <TabsList label="Queue views" tabs={VIEWS} />
          </div>
          {view === "active" && (
            <div className="grid grid-cols-2 gap-3 px-4 pt-4 md:grid-cols-5">
              {select("status", "Status", STATUS_OPTIONS)}
              {select(
                "priority",
                "Priority",
                PRIORITIES.map((p) => [p, p[0].toUpperCase() + p.slice(1)]),
              )}
              {select(
                "categoryId",
                "Category",
                config?.categories.map((c) => [c.id, c.label]) ?? [],
              )}
              {select("blockId", "Block", config?.blocks.map((b) => [b.id, b.label]) ?? [])}
              {contacts.length > 0 &&
                select("assignee", "Assignee", [
                  ["none", "Unassigned"],
                  ...contacts.map((c) => [c.id, c.name]),
                ])}
              <Checkbox
                label="Escalated only"
                className="col-span-2 md:col-span-5"
                checked={filters.escalated === "true"}
                onChange={(e) => set("escalated")(e.target.checked ? "true" : "")}
              />
            </div>
          )}
          <TabsContent value={view} className="pt-2">
            {list}
          </TabsContent>
        </Tabs>
      </Panel>
    </div>
  );
}
