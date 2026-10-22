import { ClipboardCheck } from "lucide-react";
import Link from "next/link";
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
          <nav aria-label="About this pilot" className="mt-10 flex flex-wrap gap-x-5 text-sm">
            <Link href="/about" className="inline-flex min-h-11 items-center text-ink underline">
              About
            </Link>
            <Link href="/privacy" className="inline-flex min-h-11 items-center text-ink underline">
              Privacy
            </Link>
            <Link href="/rules" className="inline-flex min-h-11 items-center text-ink underline">
              Community rules
            </Link>
          </nav>
        </div>
      </main>
    </div>
  );
}
