"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Banner } from "@/components/ui/feedback";
import { Spinner } from "@/components/ui/spinner";
import { useAuth } from "@/lib/client/auth";

/**
 * Client-side gate for signed-in screens. UI convenience only: every API route enforces
 * authentication and permissions on the server regardless.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { state, refresh } = useAuth();
  const router = useRouter();
  const path = usePathname();

  useEffect(() => {
    if (state.status === "signedOut")
      router.replace(path.startsWith("/admin") ? "/admin/login" : "/login");
  }, [state.status, router, path]);

  if (state.status === "error")
    return (
      <div className="mx-auto max-w-md p-6">
        <Banner
          tone="warning"
          title="CampusResolve can't reach its server right now"
          action={
            <Button size="sm" variant="secondary" onClick={() => refresh().catch(() => {})}>
              Try again
            </Button>
          }
        >
          {state.message}
        </Banner>
      </div>
    );
  if (state.status !== "signedIn")
    return (
      <div className="grid flex-1 place-items-center p-10">
        <Spinner label="Loading" className="size-8 text-ink" />
      </div>
    );
  return <AppShell role={state.me.role}>{children}</AppShell>;
}
