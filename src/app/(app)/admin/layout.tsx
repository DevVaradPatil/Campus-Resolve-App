"use client";

import { ShieldAlert } from "lucide-react";
import { EmptyState } from "@/components/ui/feedback";
import { useAuth } from "@/lib/client/auth";

// UI gate only; the admin API routes check permissions on the server.
export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  const { state } = useAuth();
  if (state.status !== "signedIn") return null;
  if (state.me.role !== "admin")
    return (
      <EmptyState icon={ShieldAlert} title="This area is for hostel admins">
        Your account doesn&apos;t have admin access. If you think it should, ask the project owner.
      </EmptyState>
    );
  return children;
}
