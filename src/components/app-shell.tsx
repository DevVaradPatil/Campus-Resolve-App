"use client";

import clsx from "clsx";
import {
  Bell,
  ClipboardCheck,
  ClipboardList,
  Flag,
  Inbox,
  LayoutList,
  Menu,
  Plus,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { PilotNotice } from "./notices";

export type Role = "student" | "committee" | "admin";
type NavItem = { href: string; label: string; short?: string; icon: LucideIcon };

const STUDENT: NavItem[] = [
  { href: "/", label: "Feed", icon: LayoutList },
  { href: "/mine", label: "My complaints", short: "Mine", icon: ClipboardList },
  { href: "/notifications", label: "Notifications", short: "Alerts", icon: Bell },
  { href: "/more", label: "More", icon: Menu },
];
const ROLE_ITEMS: Record<Role, NavItem[]> = {
  student: [],
  committee: [{ href: "/committee", label: "Committee", icon: Flag }],
  admin: [{ href: "/admin", label: "Admin", icon: Inbox }],
};

const isActive = (path: string, href: string) =>
  href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`);

function UnreadDot({ count }: { count: number }) {
  if (!count) return null;
  return (
    <span className="absolute -top-1 -right-2 min-w-5 rounded-full bg-danger px-1 text-center text-[11px] leading-5 font-bold text-on-danger tabular-nums">
      {count > 9 ? "9+" : count}
      <span className="sr-only"> unread</span>
    </span>
  );
}

export function AppShell({
  role,
  unread = 0,
  children,
}: {
  role: Role;
  unread?: number;
  children: ReactNode;
}) {
  const path = usePathname();
  const desktopNav = [...STUDENT, ...ROLE_ITEMS[role]];

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only z-50 rounded-control bg-ink px-4 py-2 text-on-ink focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>
      <PilotNotice />
      <div className="mx-auto flex w-full max-w-6xl flex-1">
        {/* Desktop sidebar */}
        <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-6 border-r border-rule px-3 py-5 md:flex">
          <Wordmark />
          <Link
            href="/new"
            className="flex h-11 items-center justify-center gap-2 rounded-control bg-ink font-semibold text-on-ink hover:bg-ink-hover"
          >
            <Plus aria-hidden className="size-5" />
            New complaint
          </Link>
          <nav aria-label="Main">
            <ul className="flex flex-col gap-0.5">
              {desktopNav.map((item) => {
                const active = isActive(path, item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={clsx(
                        "flex h-11 items-center gap-3 rounded-control px-3",
                        active
                          ? "bg-ink-soft font-semibold text-ink"
                          : "text-text hover:bg-sheet-sunk",
                      )}
                    >
                      <span className="relative">
                        <item.icon aria-hidden className="size-5" />
                        {item.href === "/notifications" && <UnreadDot count={unread} />}
                      </span>
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Mobile header */}
          <header className="flex h-14 items-center justify-between border-b border-rule px-4 md:hidden">
            <Wordmark />
          </header>
          <main id="main" className="flex-1 px-4 pt-5 pb-28 md:px-8 md:pt-8 md:pb-10">
            {children}
          </main>
        </div>
      </div>

      {/* Mobile tab bar; "New" is the raised centre action */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-rule bg-sheet pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <ul className="grid grid-cols-5">
          {[STUDENT[0], STUDENT[1], null, STUDENT[2], STUDENT[3]].map((item) =>
            item ? (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={isActive(path, item.href) ? "page" : undefined}
                  className={clsx(
                    "flex h-16 flex-col items-center justify-center gap-1 text-[11px]",
                    isActive(path, item.href) ? "font-bold text-ink" : "text-muted",
                  )}
                >
                  <span className="relative">
                    <item.icon aria-hidden className="size-6" />
                    {item.href === "/notifications" && <UnreadDot count={unread} />}
                  </span>
                  {item.short ?? item.label}
                </Link>
              </li>
            ) : (
              <li key="new" className="flex items-center justify-center">
                <Link
                  href="/new"
                  aria-label="New complaint"
                  className="-mt-5 grid size-14 place-items-center rounded-full bg-ink text-on-ink shadow-overlay hover:bg-ink-hover"
                >
                  <Plus aria-hidden className="size-7" />
                </Link>
              </li>
            ),
          )}
        </ul>
      </nav>
    </div>
  );
}

function Wordmark() {
  return (
    <Link href="/" className="flex items-center gap-2 px-1 text-lg font-bold text-ink">
      <ClipboardCheck aria-hidden className="size-6" strokeWidth={2.25} />
      CampusResolve
    </Link>
  );
}
