"use client";

import { Download } from "lucide-react";
import { useState } from "react";
import { DashboardState, HostelStats, StaffStats, useDashboard } from "@/components/dashboard";
import { RangePicker } from "@/components/stats";
import { Button } from "@/components/ui/button";
import { Banner } from "@/components/ui/feedback";
import { Checkbox, Field, Input } from "@/components/ui/field";
import { Panel } from "@/components/ui/surface";
import { apiDownload } from "@/lib/client/api";
import { useAuth } from "@/lib/client/auth";
import { dayKey } from "@/lib/domain/stats";

export function AdminDashboard() {
  const [days, setDays] = useState(30);
  const state = useDashboard(days);
  return (
    <section aria-labelledby="dash-title" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id="dash-title" className="text-lg font-bold">
          Overview
        </h2>
        <RangePicker value={days} onChange={setDays} />
      </div>
      <DashboardState state={state}>
        {(d) => (
          <>
            {d.staff && <StaffStats d={d} />}
            <HostelStats d={d} />
          </>
        )}
      </DashboardState>
    </section>
  );
}

/** CSV of authorized records (FR-15). The server enforces the permission and the allowlist. */
export function ExportPanel() {
  const { state } = useAuth();
  const [today] = useState(() => dayKey(Date.now()));
  const [from, setFrom] = useState(`${today.slice(0, 8)}01`);
  const [to, setTo] = useState(today);
  const [confidential, setConfidential] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const grants = state.status === "signedIn" ? state.me : null;
  if (!grants || (grants.role !== "admin" && !grants.grants.includes("export"))) return null;

  return (
    <Panel title="Export to CSV">
      <form
        className="flex flex-col gap-4 px-4 pb-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(undefined);
          try {
            const qs = new URLSearchParams({
              from,
              to,
              ...(confidential && { confidential: "1" }),
            });
            await apiDownload(`/api/admin/export?${qs}`, `campusresolve-${from}-to-${to}.csv`);
          } catch (err) {
            setError((err as Error).message);
          }
          setBusy(false);
        }}
      >
        <p className="text-sm text-muted">
          Complaints reported in the range, up to 2,000 rows. Never includes who reported, room
          numbers, descriptions or comments. Every export is logged.
        </p>
        <div className="flex flex-wrap gap-3">
          <Field label="From" required>
            <Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="To" required>
            <Input
              type="date"
              value={to}
              min={from}
              max={today}
              onChange={(e) => setTo(e.target.value)}
            />
          </Field>
        </div>
        {grants.role === "admin" && (
          <Checkbox
            label="Include confidential complaints"
            description="Adds their rows and titles. Only do this when you need them."
            checked={confidential}
            onChange={(e) => setConfidential(e.target.checked)}
          />
        )}
        {error && <Banner tone="danger" title={error} />}
        <Button
          type="submit"
          variant="secondary"
          className="self-start"
          loading={busy}
          icon={<Download aria-hidden className="size-5" />}
        >
          Download CSV
        </Button>
      </form>
    </Panel>
  );
}
