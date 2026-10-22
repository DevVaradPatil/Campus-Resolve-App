"use client";

import { useState } from "react";
import { DashboardState, HostelStats, useDashboard } from "@/components/dashboard";
import { RangePicker } from "@/components/stats";

export default function StatsPage() {
  const [days, setDays] = useState(30);
  const state = useDashboard(days);
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold">Hostel stats</h1>
          <p className="text-muted">How complaints are being handled, across the whole hostel.</p>
        </div>
        <RangePicker value={days} onChange={setDays} />
      </header>
      <DashboardState state={state}>{(d) => <HostelStats d={d} />}</DashboardState>
    </div>
  );
}
