"use client";

import { ShieldAlert } from "lucide-react";
import { EmptyState } from "@/components/ui/feedback";
import { useAuth } from "@/lib/client/auth";

// UI gate only; /api/moderation checks content.moderate on the server.
export default function ModerationLayout({ children }: LayoutProps<"/moderation">) {
  const { state } = useAuth();
  if (state.status !== "signedIn") return null;
  if (state.me.role === "student")
    return (
      <EmptyState icon={ShieldAlert} title="This area is for moderators">
        The hostel committee and admins review reported content here.
      </EmptyState>
    );
  return children;
}
