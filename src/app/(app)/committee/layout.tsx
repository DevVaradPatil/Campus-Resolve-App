"use client";

import { ShieldAlert } from "lucide-react";
import { EmptyState } from "@/components/ui/feedback";
import { useAuth } from "@/lib/client/auth";

// UI gate only; /api/committee/* checks the escalate permission on the server.
export default function CommitteeLayout({ children }: LayoutProps<"/committee">) {
  const { state } = useAuth();
  if (state.status !== "signedIn") return null;
  if (state.me.role === "student")
    return (
      <EmptyState icon={ShieldAlert} title="This area is for the hostel committee">
        Your account isn&apos;t on the committee. If it should be, ask a hostel admin.
      </EmptyState>
    );
  return children;
}
