"use client";

import clsx from "clsx";
import { CheckCircle2, Info, TriangleAlert, X } from "lucide-react";
import { Toast as T } from "radix-ui";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

type Tone = "success" | "info" | "danger";
type Item = { id: number; title: string; body?: string; tone: Tone };

const ToastCtx = createContext<(t: Omit<Item, "id" | "tone"> & { tone?: Tone }) => void>(() => {});

const icon = { success: CheckCircle2, info: Info, danger: TriangleAlert };
const toneCls = { success: "text-success", info: "text-info", danger: "text-danger" };

export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Item[]>([]);
  const push = useCallback(
    (t: Omit<Item, "id" | "tone"> & { tone?: Tone }) =>
      setItems((xs) => [...xs, { id: Date.now() + Math.random(), tone: "success", ...t }]),
    [],
  );
  return (
    <ToastCtx.Provider value={push}>
      <T.Provider swipeDirection="down" duration={5000}>
        {children}
        {items.map((t) => {
          const Icon = icon[t.tone];
          return (
            <T.Root
              key={t.id}
              type={t.tone === "danger" ? "foreground" : "background"}
              onOpenChange={(open) => !open && setItems((xs) => xs.filter((x) => x.id !== t.id))}
              className="flex items-start gap-3 rounded-control border border-rule bg-sheet p-3 shadow-overlay motion-safe:animate-sheet-in data-[swipe=move]:translate-y-(--radix-toast-swipe-move-y)"
            >
              <Icon aria-hidden className={clsx("mt-0.5 size-5 shrink-0", toneCls[t.tone])} />
              <div className="flex-1">
                <T.Title className="font-semibold">{t.title}</T.Title>
                {t.body && <T.Description className="text-sm text-muted">{t.body}</T.Description>}
              </div>
              <T.Close
                aria-label="Dismiss"
                className="-m-2 grid size-11 place-items-center text-muted"
              >
                <X aria-hidden className="size-4" />
              </T.Close>
            </T.Root>
          );
        })}
        {/* Sits above the mobile tab bar */}
        <T.Viewport className="fixed inset-x-0 bottom-20 z-50 mx-auto flex w-full max-w-md flex-col gap-2 px-4 outline-none md:bottom-6" />
      </T.Provider>
    </ToastCtx.Provider>
  );
}
