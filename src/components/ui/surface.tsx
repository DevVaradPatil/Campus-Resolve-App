import clsx from "clsx";
import type { ReactNode } from "react";
import { Button } from "./button";

/** The register sheet: one rounded surface. Lists inside it are ruled, not boxed. */
export function Panel({
  title,
  action,
  children,
  className,
  as: Tag = "section",
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  as?: "section" | "div";
}) {
  return (
    <Tag className={clsx("rounded-surface border border-rule bg-sheet", className)}>
      {title && (
        <header className="flex items-center justify-between gap-3 px-4 pt-4 pb-2">
          <h2 className="text-lg font-bold">{title}</h2>
          {action}
        </header>
      )}
      {children}
    </Tag>
  );
}

export function RuledList({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <ul aria-label={label} className="divide-y divide-rule">
      {children}
    </ul>
  );
}

/** Cursor pagination matches Firestore, so lists grow with "Show more" instead of page numbers. */
export function LoadMore({
  shown,
  total,
  loading,
  onLoadMore,
}: {
  shown: number;
  total?: number;
  loading?: boolean;
  onLoadMore: () => void;
}) {
  const more = total === undefined || shown < total;
  return (
    <div className="flex flex-col items-center gap-2 border-t border-rule px-4 py-4">
      {total !== undefined && (
        <p className="text-sm text-muted tabular-nums">
          Showing {shown} of {total}
        </p>
      )}
      {more && (
        <Button variant="secondary" size="sm" loading={loading} onClick={onLoadMore}>
          Show more
        </Button>
      )}
    </div>
  );
}

export type Column<T> = {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  numeric?: boolean;
};

/** Table on md+, stacked label/value rows on phones. */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  caption,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  caption: string;
}) {
  return (
    <>
      <table className="hidden w-full text-left text-sm md:table">
        <caption className="sr-only">{caption}</caption>
        <thead className="border-b border-rule text-muted">
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={clsx("px-4 py-3 font-semibold", c.numeric && "text-right")}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-rule">
          {rows.map((r) => (
            <tr key={rowKey(r)} className="hover:bg-paper">
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={clsx("px-4 py-3 align-top", c.numeric && "text-right tabular-nums")}
                >
                  {c.cell(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <ul aria-label={caption} className="divide-y divide-rule md:hidden">
        {rows.map((r) => (
          <li key={rowKey(r)} className="px-4 py-3">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              {columns.map((c) => (
                <div key={c.key} className="contents">
                  <dt className="text-muted">{c.header}</dt>
                  <dd className={clsx(c.numeric && "tabular-nums")}>{c.cell(r)}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    </>
  );
}
