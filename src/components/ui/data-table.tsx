import { useMemo, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/icons";
import { Select } from "./select";

/**
 * DataTable — the admin table, once.
 *
 * Settings has eight of these and they differ only in their columns, so sorting,
 * paging, the "0 - 0 of 0 entries" readout and the empty row live here rather
 * than being retyped per screen. A column says how to render a cell and, if it
 * is sortable, how to compare one — the table never guesses at a value from the
 * rendered output.
 *
 * Sorting is three-state: ascending, descending, then back to the order the data
 * arrived in, which for a log is chronological and worth being able to return to.
 */

export interface Column<T> {
  key: string;
  label: string;
  /** provide a comparable value to make the heading sortable */
  sortValue?: (row: T) => string | number;
  align?: "left" | "right";
  className?: string;
  render: (row: T) => ReactNode;
}

const PAGE_SIZES = ["7", "10", "25", "50"];

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  empty = "No results",
  pageSize = 10,
  onRowClick,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  empty?: string;
  pageSize?: number;
  onRowClick?: (row: T) => void;
}) {
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(pageSize);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const column = columns.find((c) => c.key === sort.key);
    if (!column?.sortValue) return rows;
    const pick = column.sortValue;
    return [...rows].sort((a, b) => {
      const x = pick(a);
      const y = pick(b);
      if (x === y) return 0;
      return (x > y ? 1 : -1) * sort.dir;
    });
  }, [rows, sort, columns]);

  const pages = Math.max(1, Math.ceil(sorted.length / size));
  const current = Math.min(page, pages);
  const start = (current - 1) * size;
  const shown = sorted.slice(start, start + size);

  /** asc → desc → off, so the source order stays reachable. */
  function toggle(key: string) {
    setSort((s) =>
      !s || s.key !== key ? { key, dir: 1 } : s.dir === 1 ? { key, dir: -1 } : null
    );
    setPage(1);
  }

  return (
    <div className="overflow-hidden rounded-xl border border-line/10">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-surface-raised/60">
              {columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  aria-sort={
                    sort?.key === c.key
                      ? sort.dir === 1
                        ? "ascending"
                        : "descending"
                      : undefined
                  }
                  className={cn(
                    "type-body-strong whitespace-nowrap px-4 py-3 text-content",
                    c.align === "right" ? "text-right" : "text-left",
                    c.className
                  )}
                >
                  {c.sortValue ? (
                    <button
                      type="button"
                      onClick={() => toggle(c.key)}
                      className={cn(
                        "inline-flex items-center gap-1.5 transition-colors hover:text-brand",
                        sort?.key === c.key && "text-brand"
                      )}
                    >
                      {c.label}
                      <Icon name="sort" size={13} />
                    </button>
                  ) : (
                    c.label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.length ? (
              shown.map((row) => (
                <tr
                  key={rowKey(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cn(
                    "border-t border-line/8",
                    onRowClick && "cursor-pointer transition-colors hover:bg-surface-raised/40"
                  )}
                >
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={cn(
                        // The cell owns the body size so a column that renders a
                        // bare string reads at the same size as one that wraps it
                        // in a span — eight screens of columns can't be trusted to
                        // remember, and the mismatch is only visible side by side.
                        "type-body px-4 py-3 align-middle text-content",
                        c.align === "right" ? "text-right" : "text-left"
                      )}
                    >
                      {c.render(row)}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr className="border-t border-line/8">
                <td
                  colSpan={columns.length}
                  className="type-body px-4 py-10 text-center text-content-subtle"
                >
                  {empty}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* The footer states the count even when there is none to state — an
          empty table with no readout looks like it failed to load. */}
      <div className="flex flex-wrap items-center gap-3 border-t border-line/8 px-4 py-3">
        <span className="type-body-dense text-content-muted">Rows per page</span>
        <Select
          aria-label="Rows per page"
          value={String(size)}
          onChange={(v) => {
            setSize(Number(v));
            setPage(1);
          }}
          options={PAGE_SIZES.map((v) => ({ value: v, label: v }))}
          className="h-8"
        />
        <span className="type-body-dense font-medium text-content">
          {sorted.length ? start + 1 : 0} - {Math.min(start + size, sorted.length)} of{" "}
          {sorted.length} entries
        </span>

        <div className="ml-auto flex items-center gap-2">
          <PageStep
            label="Previous page"
            icon="chevron-left"
            disabled={current <= 1}
            onClick={() => setPage(current - 1)}
          />
          <span className="type-body-dense text-content-muted">Page</span>
          <span className="type-numeric grid h-8 min-w-10 place-items-center rounded-lg border border-line/12 bg-surface px-2 text-content">
            {sorted.length ? current : 0}
          </span>
          <span className="type-body-dense text-content-muted">
            of {sorted.length ? pages : 0}
          </span>
          <PageStep
            label="Next page"
            icon="chevron-right"
            disabled={current >= pages}
            onClick={() => setPage(current + 1)}
          />
        </div>
      </div>
    </div>
  );
}

function PageStep({
  label,
  icon,
  disabled,
  onClick,
}: {
  label: string;
  icon: "chevron-left" | "chevron-right";
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="grid h-8 w-8 place-items-center rounded-lg border border-line/12 text-content-muted transition-colors hover:text-content disabled:pointer-events-none disabled:opacity-35"
    >
      <Icon name={icon} size={16} />
    </button>
  );
}
