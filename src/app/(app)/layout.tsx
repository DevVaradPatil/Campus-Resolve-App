import { Suspense } from "react";
import { RequireAuth } from "@/components/require-auth";
import { Spinner } from "@/components/ui/spinner";

// Suspense lets dynamic routes like /complaints/[id] prerender a shell: RequireAuth reads the
// pathname, which isn't known at build time for them.
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <Suspense
      fallback={
        <div className="grid flex-1 place-items-center p-10">
          <Spinner label="Loading" className="size-8 text-ink" />
        </div>
      }
    >
      <RequireAuth>{children}</RequireAuth>
    </Suspense>
  );
}
