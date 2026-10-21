import { RequireAuth } from "@/components/require-auth";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return <RequireAuth>{children}</RequireAuth>;
}
