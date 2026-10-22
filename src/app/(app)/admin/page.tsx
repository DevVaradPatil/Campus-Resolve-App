import { ChevronRight, Flag, Inbox, Settings2, Users } from "lucide-react";
import Link from "next/link";
import { Panel, RuledList } from "@/components/ui/surface";

export const metadata = { title: "Admin · CampusResolve" };

const SECTIONS = [
  {
    href: "/admin/complaints",
    icon: Inbox,
    title: "Complaint queue",
    body: "Assign, update and resolve complaints. Overdue ones come first.",
  },
  {
    href: "/moderation",
    icon: Flag,
    title: "Moderation",
    body: "Review reported complaints, comments and photos.",
  },
  {
    href: "/admin/roster",
    icon: Users,
    title: "Roster and accounts",
    body: "Import the roster, hand out activation codes, reset passwords and manage roles.",
  },
  {
    href: "/admin/config",
    icon: Settings2,
    title: "Hostel setup",
    body: "Categories and priorities, blocks and floors, contacts and complaint routing.",
  },
];

export default function AdminHome() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <h1 className="text-2xl font-bold">Admin</h1>
      <Panel>
        <RuledList label="Admin sections">
          {SECTIONS.map((s) => (
            <li key={s.href} className="relative flex items-center gap-4 px-4 py-4 hover:bg-paper">
              <s.icon aria-hidden className="size-6 shrink-0 text-ink" />
              <div className="flex-1">
                <Link href={s.href} className="font-semibold after:absolute after:inset-0">
                  {s.title}
                </Link>
                <p className="text-sm text-muted">{s.body}</p>
              </div>
              <ChevronRight aria-hidden className="size-5 text-muted" />
            </li>
          ))}
        </RuledList>
      </Panel>
    </div>
  );
}
