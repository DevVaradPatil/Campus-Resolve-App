import { ClipboardCheck } from "lucide-react";
import Link from "next/link";
import { PilotNotice } from "@/components/notices";

// Public pages: readable before signing in, and linked from the pilot notice.
export default function InfoLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh flex-col">
      <PilotNotice />
      <main className="flex flex-1 flex-col items-center px-4 py-10">
        <div className="flex w-full max-w-2xl flex-col gap-6">
          <Link href="/" className="flex items-center gap-2 self-start text-xl font-bold text-ink">
            <ClipboardCheck aria-hidden className="size-7" strokeWidth={2.25} />
            CampusResolve
          </Link>
          <article className="flex flex-col gap-4 [&_a]:text-ink [&_a]:underline [&_h2]:mt-4 [&_h2]:text-lg [&_h2]:font-bold [&_li]:ml-5 [&_li]:list-disc [&_p]:max-w-prose [&_ul]:flex [&_ul]:max-w-prose [&_ul]:flex-col [&_ul]:gap-1">
            {children}
          </article>
          <nav
            aria-label="About this pilot"
            className="flex flex-wrap gap-x-5 border-t border-rule pt-4 text-sm"
          >
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
