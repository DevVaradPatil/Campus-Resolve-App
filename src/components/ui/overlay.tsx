"use client";

import clsx from "clsx";
import { X } from "lucide-react";
import { Dialog as D, DropdownMenu as M, Tabs as T, Tooltip as Tip } from "radix-ui";
import type { ReactNode } from "react";

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

/**
 * `sheet` slides up from the bottom on phones and becomes a centered dialog from `sm` up.
 * `center` is always centered. Title is required for screen readers.
 */
export function DialogContent({
  title,
  description,
  children,
  variant = "sheet",
  className,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  variant?: "sheet" | "center";
  className?: string;
}) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-40 bg-text/40 motion-safe:animate-fade-in" />
      <D.Content
        className={clsx(
          "fixed z-50 flex max-h-[90dvh] flex-col overflow-y-auto bg-sheet p-5 shadow-overlay",
          variant === "sheet"
            ? "inset-x-0 bottom-0 rounded-t-surface pb-[max(1.25rem,env(safe-area-inset-bottom))] motion-safe:animate-sheet-in sm:inset-x-auto sm:bottom-auto sm:top-1/2 sm:left-1/2 sm:w-full sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-surface"
            : "top-1/2 left-1/2 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-surface motion-safe:animate-fade-in",
          className,
        )}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <D.Title className="text-lg font-bold">{title}</D.Title>
            {description ? (
              <D.Description className="mt-1 text-sm text-muted">{description}</D.Description>
            ) : (
              <D.Description className="sr-only">{title}</D.Description>
            )}
          </div>
          <D.Close
            aria-label="Close"
            className="-mt-2 -mr-2 grid size-11 shrink-0 place-items-center rounded-control text-muted hover:bg-sheet-sunk"
          >
            <X aria-hidden className="size-5" />
          </D.Close>
        </div>
        {children}
      </D.Content>
    </D.Portal>
  );
}

export const Menu = M.Root;
export const MenuTrigger = M.Trigger;

export function MenuContent({ children }: { children: ReactNode }) {
  return (
    <M.Portal>
      <M.Content
        align="end"
        sideOffset={6}
        className="z-50 min-w-48 rounded-control border border-rule bg-sheet p-1 shadow-overlay motion-safe:animate-fade-in"
      >
        {children}
      </M.Content>
    </M.Portal>
  );
}

export function MenuItem({
  children,
  onSelect,
  destructive,
  icon,
}: {
  children: ReactNode;
  onSelect?: () => void;
  destructive?: boolean;
  icon?: ReactNode;
}) {
  return (
    <M.Item
      onSelect={onSelect}
      className={clsx(
        "flex min-h-11 cursor-pointer items-center gap-2.5 rounded-[0.4rem] px-3 outline-none select-none",
        "data-highlighted:bg-ink-soft data-disabled:opacity-50",
        destructive ? "text-danger" : "text-text",
      )}
    >
      {icon}
      {children}
    </M.Item>
  );
}

export const Tabs = T.Root;
export const TabsContent = T.Content;

/** Underline tabs; the list scrolls horizontally on narrow screens instead of wrapping. */
export function TabsList({
  tabs,
  label,
}: {
  tabs: { value: string; label: string; count?: number }[];
  label: string;
}) {
  return (
    <T.List
      aria-label={label}
      className="flex gap-1 overflow-x-auto border-b border-rule [scrollbar-width:none]"
    >
      {tabs.map((t) => (
        <T.Trigger
          key={t.value}
          value={t.value}
          className={clsx(
            "-mb-px flex h-11 shrink-0 items-center gap-1.5 border-b-[3px] border-transparent px-3 font-semibold whitespace-nowrap text-muted",
            "hover:text-text data-[state=active]:border-ink data-[state=active]:text-ink",
          )}
        >
          {t.label}
          {t.count !== undefined && (
            <span className="rounded-full bg-sheet-sunk px-1.5 text-xs text-muted tabular-nums">
              {t.count}
            </span>
          )}
        </T.Trigger>
      ))}
    </T.List>
  );
}

/** Supplementary hint only. Never put information here that isn't available another way. */
export function Tooltip({ content, children }: { content: string; children: ReactNode }) {
  return (
    <Tip.Provider delayDuration={300}>
      <Tip.Root>
        <Tip.Trigger asChild>{children}</Tip.Trigger>
        <Tip.Portal>
          <Tip.Content
            sideOffset={6}
            className="z-50 max-w-64 rounded-[0.4rem] bg-text px-2.5 py-1.5 text-xs text-paper motion-safe:animate-fade-in"
          >
            {content}
          </Tip.Content>
        </Tip.Portal>
      </Tip.Root>
    </Tip.Provider>
  );
}
