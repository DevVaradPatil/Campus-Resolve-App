import { ClipboardCheck } from "lucide-react";
import { PilotNotice } from "@/components/notices";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh flex-col">
      <PilotNotice />
      <main className="flex flex-1 flex-col items-center px-4 py-10 sm:py-16">
        <div className="w-full max-w-sm">
          <p className="mb-8 flex items-center gap-2 text-xl font-bold text-ink">
            <ClipboardCheck aria-hidden className="size-7" strokeWidth={2.25} />
            CampusResolve
          </p>
          {children}
        </div>
      </main>
    </div>
  );
}
