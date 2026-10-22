"use client";

import { BellOff, CheckCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { NotificationItem } from "@/components/notices";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import { Skeleton } from "@/components/ui/spinner";
import { Panel, RuledList } from "@/components/ui/surface";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/client/api";
import { useAuth } from "@/lib/client/auth";
import { useNotifications } from "@/lib/client/notifications";

export default function NotificationsPage() {
  const { state } = useAuth();
  const me = state.status === "signedIn" ? state.me : null;
  const items = useNotifications(me);
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const unread = items?.filter((n) => !n.read).length ?? 0;

  // The listener updates the list once the server marks them read.
  const markRead = (body: { ids: string[] } | { all: true }) =>
    api("/api/notifications/read", { method: "POST", body });

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold">Notifications</h1>
          <p className="text-sm text-muted">
            Your latest 20. {me?.muteNonEssential ? "Showing important ones only. " : ""}
            <Link href="/more" className="text-ink underline underline-offset-2">
              Notification settings
            </Link>
          </p>
        </div>
        {unread > 0 && (
          <Button
            variant="secondary"
            size="sm"
            loading={busy}
            icon={<CheckCheck aria-hidden className="size-4" />}
            onClick={async () => {
              setBusy(true);
              await markRead({ all: true }).catch((e: Error) =>
                toast({ title: "Couldn't mark them read", body: e.message, tone: "danger" }),
              );
              setBusy(false);
            }}
          >
            Mark all read
          </Button>
        )}
      </header>
      <Panel>
        {!items ? (
          <div className="flex flex-col gap-3 p-4">
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
          </div>
        ) : items.length === 0 ? (
          <div className="px-4">
            <EmptyState
              icon={BellOff}
              title={me?.muteNonEssential ? "Nothing important right now" : "No notifications yet"}
            >
              {me?.muteNonEssential
                ? "Routine updates are hidden. You'll still hear when something needs your reply."
                : "You'll hear here when your complaints are assigned, updated or resolved."}
            </EmptyState>
          </div>
        ) : (
          <RuledList label="Notifications">
            {items.map((n) => (
              <NotificationItem
                key={n.id}
                n={n}
                onOpen={() => !n.read && markRead({ ids: [n.id] }).catch(() => {})}
              />
            ))}
          </RuledList>
        )}
      </Panel>
    </div>
  );
}
