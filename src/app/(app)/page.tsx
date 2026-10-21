"use client";

import { Inbox } from "lucide-react";
import { EmptyState } from "@/components/ui/feedback";
import { Panel } from "@/components/ui/surface";
import { useAuth } from "@/lib/client/auth";

export default function FeedPage() {
  const { state } = useAuth();
  const name = state.status === "signedIn" ? state.me.pseudonym : "";
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">Hostel feed</h1>
        <p className="text-muted">
          You appear to other residents as <span className="font-semibold text-text">{name}</span>.
        </p>
      </header>
      <Panel>
        <EmptyState icon={Inbox} title="No complaints yet">
          Reported problems will show up here. Reporting opens soon.
        </EmptyState>
      </Panel>
    </div>
  );
}
