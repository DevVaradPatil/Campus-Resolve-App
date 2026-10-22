"use client";

import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  where,
  type DocumentData,
  type QueryConstraint,
  type QueryDocumentSnapshot,
  type Timestamp,
} from "firebase/firestore";
import { Inbox, Plus, Search, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { FeedSummary } from "@/components/feed-summary";
import { IssueRow } from "@/components/issue";
import { Pseudonym } from "@/components/ui/badge";
import { buttonClass, IconButton } from "@/components/ui/button";
import { EmptyState, ServiceUnavailable } from "@/components/ui/feedback";
import { Field, Input, Select } from "@/components/ui/field";
import { Tabs, TabsContent, TabsList } from "@/components/ui/overlay";
import { Skeleton } from "@/components/ui/spinner";
import { LoadMore, Panel, RuledList } from "@/components/ui/surface";
import { useAuth } from "@/lib/client/auth";
import { useHostelConfig } from "@/lib/client/config";
import { db } from "@/lib/client/firebase";
import { searchTokens, type IssueSummary, type PublicComplaint } from "@/lib/domain/complaint";

const PAGE = 20; // firestore.rules rejects bigger pages

// Each tab is one indexed query (firestore.indexes.json). Filters are equality-only so Firestore
// can merge the per-field indexes instead of needing one per combination.
const TABS = {
  trending: { label: "Trending", open: true, order: ["supportCount", "createdAt"] },
  unresolved: { label: "Unresolved", open: true, order: ["createdAt"] },
  resolved: { label: "Recently resolved", open: false, order: ["updatedAt"] },
  supported: { label: "Most supported", open: undefined, order: ["supportCount", "createdAt"] },
} as const;
type Tab = keyof typeof TABS;

type Cursor = QueryDocumentSnapshot<DocumentData>;
type Results = { items: IssueSummary[]; last: Cursor | null; for?: unknown };

const toIssue = (d: Cursor): IssueSummary => {
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
};

export default function FeedPage() {
  const { state } = useAuth();
  const { config } = useHostelConfig();
  const [tab, setTab] = useState<Tab>("trending");
  const [category, setCategory] = useState("");
  const [block, setBlock] = useState("");
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState(""); // submitted search
  const [results, setResults] = useState<Results>();
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);

  const fetchPage = useCallback(
    async (after: Cursor | null): Promise<Results> => {
      const tokens = searchTokens(term).sort((a, b) => b.length - a.length);
      const c: QueryConstraint[] = [];
      if (tokens.length) {
        // Search covers every public complaint by title keyword; tabs and filters don't apply.
        c.push(where("searchTokens", "array-contains", tokens[0]), orderBy("createdAt", "desc"));
      } else {
        const t = TABS[tab];
        if (t.open !== undefined) c.push(where("open", "==", t.open));
        if (category) c.push(where("categoryId", "==", category));
        if (block) c.push(where("blockId", "==", block));
        t.order.forEach((f) => c.push(orderBy(f, "desc")));
      }
      if (after) c.push(startAfter(after));
      const snap = await getDocs(query(collection(db, "publicComplaints"), ...c, limit(PAGE)));
      const items = snap.docs
        .map(toIssue)
        // Remaining search words narrow this page on the client.
        .filter((i) => tokens.slice(1).every((w) => i.title.toLowerCase().includes(w)));
      return { items, last: snap.docs.length === PAGE ? snap.docs[PAGE - 1] : null };
    },
    [tab, category, block, term],
  );

  useEffect(() => {
    let live = true;
    fetchPage(null).then(
      (r) => {
        if (!live) return;
        setResults({ ...r, for: fetchPage });
        setError(false);
      },
      (e) => {
        console.error("Feed query failed", e);
        if (live) setError(true);
      },
    );
    return () => {
      live = false;
    };
  }, [fetchPage]);

  async function more() {
    if (!results?.last) return;
    setLoadingMore(true);
    try {
      const r = await fetchPage(results.last);
      setResults({ items: [...results.items, ...r.items], last: r.last, for: fetchPage });
    } catch {
      setError(true);
    }
    setLoadingMore(false);
  }

  const filtered = !!(category || block);
  // Results belong to the query that fetched them; a new tab or filter shows skeletons until its page lands.
  const list =
    results?.for !== fetchPage ? (
      <div className="flex flex-col gap-3 p-4">
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
      </div>
    ) : results.items.length === 0 ? (
      <div className="px-4">
        <EmptyState
          icon={Inbox}
          title={term ? `No titles match "${term}"` : "Nothing here yet"}
          action={
            <Link href="/new" className={buttonClass()}>
              <Plus aria-hidden className="size-5" />
              Report a problem
            </Link>
          }
        >
          {term || filtered
            ? "Try other words or clear the filters. If nobody has reported it, you can."
            : "Public complaints from residents show up here."}
        </EmptyState>
      </div>
    ) : (
      <>
        <RuledList label="Complaints">
          {results.items.map((i) => (
            <IssueRow key={i.id} issue={i} href={`/complaints/${i.id}`} />
          ))}
        </RuledList>
        {results.last && (
          <LoadMore shown={results.items.length} loading={loadingMore} onLoadMore={more} />
        )}
      </>
    );

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">Hostel feed</h1>
        {state.status === "signedIn" && (
          <p className="flex flex-wrap items-center gap-x-2 text-muted">
            You appear to other residents as <Pseudonym alias={state.me.pseudonym} />
          </p>
        )}
      </header>
      <FeedSummary />

      <form
        role="search"
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setTerm(search.trim());
        }}
      >
        <Field label="Search titles" className="flex-1">
          <Input
            type="search"
            value={search}
            maxLength={80}
            placeholder="e.g. water cooler"
            onChange={(e) => {
              setSearch(e.target.value);
              if (!e.target.value) setTerm("");
            }}
          />
        </Field>
        <IconButton label="Search" type="submit" variant="secondary">
          <Search aria-hidden className="size-5" />
        </IconButton>
        {term && (
          <IconButton
            label="Clear search"
            onClick={() => {
              setSearch("");
              setTerm("");
            }}
          >
            <X aria-hidden className="size-5" />
          </IconButton>
        )}
      </form>

      {error && <ServiceUnavailable />}

      <Panel>
        {term ? (
          <>
            <p className="px-4 pt-4 text-sm text-muted">
              Results for “{term}” across all public complaints, newest first.
            </p>
            {list}
          </>
        ) : (
          <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
            <div className="px-2 pt-2">
              <TabsList
                label="Sort complaints"
                tabs={Object.entries(TABS).map(([value, t]) => ({ value, label: t.label }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3 px-4 pt-4">
              <Field label="Category">
                <Select value={category} onChange={(e) => setCategory(e.target.value)}>
                  <option value="">All categories</option>
                  {config?.categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Block">
                <Select value={block} onChange={(e) => setBlock(e.target.value)}>
                  <option value="">All blocks</option>
                  {config?.blocks.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <TabsContent value={tab} className="pt-2">
              {list}
            </TabsContent>
          </Tabs>
        )}
      </Panel>
    </div>
  );
}
