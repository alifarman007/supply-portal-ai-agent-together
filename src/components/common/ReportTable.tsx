"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const PAGE_SIZES = [10, 25, 50] as const;

export interface ReportColumn<T> {
  key: string;
  header: string;
  align?: "left" | "right";
  /** Applied to both the header and body cells — use for widths. */
  cellClassName?: string;
  /** Cell contents. */
  render: (row: T) => React.ReactNode;
  /** Plain-text value for CSV export; falls back to omitting the cell. */
  csv?: (row: T) => string | number;
}

/**
 * Paginated report table with the brand's yellow header band. Pagination is
 * client-side because every report here is already fully in memory.
 */
export function ReportTable<T>({
  columns,
  rows,
  getRowKey,
  emptyLabel = "Nothing to show",
  loading = false,
  className,
  stickyFirstColumn = false,
}: {
  columns: ReportColumn<T>[];
  rows: T[];
  getRowKey: (row: T) => string;
  emptyLabel?: string;
  loading?: boolean;
  className?: string;
  /**
   * Freezes column one while the rest scrolls. Worth it on the wide reports —
   * on a phone the identifier would otherwise scroll away and leave a wall of
   * numbers with nothing to attach them to.
   */
  stickyFirstColumn?: boolean;
}) {
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZES[0]);
  const [page, setPage] = useState(0);

  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));

  // A filter or tab change can shrink the set under the current page.
  useEffect(() => {
    if (page > pageCount - 1) setPage(pageCount - 1);
  }, [page, pageCount]);

  const visible = useMemo(
    () => rows.slice(page * pageSize, page * pageSize + pageSize),
    [rows, page, pageSize],
  );

  const first = rows.length === 0 ? 0 : page * pageSize + 1;
  const last = Math.min(rows.length, (page + 1) * pageSize);

  // A frozen cell must be opaque or the scrolling columns show through it, so
  // the header band is mixed against the card instead of transparent.
  const stickyHead = stickyFirstColumn
    ? "sticky left-0 z-10 bg-[color-mix(in_oklab,var(--brand-yellow)_22%,var(--card))]"
    : "";
  const stickyCell = stickyFirstColumn ? "sticky left-0 z-10 bg-card" : "";

  return (
    <div className={cn("glass overflow-hidden p-0", className)}>
      <div className="table-scroll">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[color-mix(in_oklab,var(--brand-yellow)_22%,transparent)]">
              {columns.map((col, i) => (
                <th
                  key={col.key}
                  scope="col"
                  className={cn(
                    "px-4 py-4 text-xs font-semibold tracking-[0.08em] whitespace-nowrap text-foreground/70 uppercase sm:px-5",
                    col.align === "right" ? "text-right" : "text-left",
                    col.cellClassName,
                    i === 0 && stickyHead,
                  )}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  {columns.map((col) => (
                    <td key={col.key} className="px-5 py-4">
                      <Skeleton className="h-4 w-full rounded" />
                    </td>
                  ))}
                </tr>
              ))
            ) : rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-5 py-10 text-center text-muted-foreground"
                >
                  {emptyLabel}
                </td>
              </tr>
            ) : (
              visible.map((row) => (
                <tr key={getRowKey(row)} className="transition-colors hover:bg-muted/40">
                  {columns.map((col, i) => (
                    <td
                      key={col.key}
                      className={cn(
                        // Report data — ids, dates, amounts, pills — is never
                        // improved by wrapping; on a phone it just turns an
                        // invoice number into three lines. Prose columns opt
                        // back in with `whitespace-normal`.
                        "px-4 py-4 align-middle whitespace-nowrap sm:px-5",
                        col.align === "right" ? "text-right" : "text-left",
                        col.cellClassName,
                        i === 0 && stickyCell,
                      )}
                    >
                      {col.render(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          Rows per page:
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1 px-2 font-medium">
                {pageSize}
                <ChevronRight className="size-3.5 rotate-90" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {PAGE_SIZES.map((size) => (
                <DropdownMenuItem
                  key={size}
                  onSelect={() => {
                    setPageSize(size);
                    setPage(0);
                  }}
                >
                  {size}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex items-center gap-2">
          <span className="tnum text-sm text-muted-foreground">
            {first}-{last} of {rows.length}
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Previous page"
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Next page"
            disabled={page >= pageCount - 1}
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Serialises the visible report to CSV and triggers a download. */
export function downloadReportCsv<T>(
  filename: string,
  columns: ReportColumn<T>[],
  rows: T[],
) {
  const cols = columns.filter((c) => c.csv);
  const escape = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const csv = [
    cols.map((c) => escape(c.header)).join(","),
    ...rows.map((row) => cols.map((c) => escape(c.csv!(row))).join(",")),
  ].join("\n");

  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
