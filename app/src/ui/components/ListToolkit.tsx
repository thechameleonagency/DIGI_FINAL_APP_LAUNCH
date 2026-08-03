import { useEffect, useMemo, useState, type ReactNode, type Ref } from 'react';
import { Download, Search } from 'lucide-react';
import { Button, EmptyState, Input, LoadingState, Select } from './primitives';

export type SortDir = 'asc' | 'desc';

/** Default rows per page for queue tables across portals. */
export const LIST_PAGE_SIZE = 7;

export interface ListColumn<T> {
  key: string;
  label: string;
  sortable?: boolean;
  getValue: (row: T) => string | number | boolean | null | undefined;
  render?: (row: T) => ReactNode;
}

export interface FilterDef<T = unknown> {
  key: string;
  label: string;
  options: { value: string; label: string }[];
  /** When set, used instead of column getValue equality for this filter */
  match?: (row: T, selected: string) => boolean;
}

function toCsvCell(v: unknown): string {
  const s = v == null ? '' : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function exportCsv(filename: string, headers: string[], rows: (string | number)[][]): void {
  const lines = [headers.map(toCsvCell).join(','), ...rows.map((r) => r.map(toCsvCell).join(','))];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Client-side page slice for raw tables that are not on useListControls. */
export function usePagedRows<T>(rows: T[], pageSize = LIST_PAGE_SIZE, resetKey?: string | number) {
  const [page, setPage] = useState(0);
  useEffect(() => {
    setPage(0);
  }, [resetKey, pageSize]);
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize) || 1);
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = useMemo(
    () => rows.slice(safePage * pageSize, safePage * pageSize + pageSize),
    [rows, safePage, pageSize],
  );
  return { page: safePage, pageCount, setPage, pageRows, total: rows.length };
}

export function useListControls<T>(
  rows: T[],
  opts: {
    columns: ListColumn<T>[];
    searchKeys: (keyof T | ((row: T) => string))[];
    filters?: FilterDef<T>[];
    defaultSortKey?: string;
    defaultSortDir?: SortDir;
    pageSize?: number;
    /** Opt-in initial search (state initializer only — F9). */
    initialQuery?: string;
    /** Opt-in initial filter map (state initializer only — F9). */
    initialFilters?: Record<string, string>;
  },
) {
  const [query, setQuery] = useState(opts.initialQuery ?? '');
  const [filterValues, setFilterValues] = useState<Record<string, string>>(opts.initialFilters ?? {});
  const [sortKey, setSortKey] = useState(opts.defaultSortKey ?? opts.columns[0]?.key ?? '');
  const [sortDir, setSortDir] = useState<SortDir>(opts.defaultSortDir ?? 'desc');
  const [page, setPage] = useState(0);
  const pageSize = opts.pageSize ?? LIST_PAGE_SIZE;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let next = rows.filter((row) => {
      if (q) {
        const hay = opts.searchKeys
          .map((k) => (typeof k === 'function' ? k(row) : String(row[k] ?? '')))
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      for (const f of opts.filters ?? []) {
        const selected = filterValues[f.key];
        if (!selected || selected === 'All') continue;
        if (f.match) {
          if (!f.match(row, selected)) return false;
          continue;
        }
        const col = opts.columns.find((c) => c.key === f.key);
        const val = col ? String(col.getValue(row) ?? '') : '';
        if (val !== selected) return false;
      }
      return true;
    });

    const col = opts.columns.find((c) => c.key === sortKey);
    if (col) {
      next = [...next].sort((a, b) => {
        const av = col.getValue(a);
        const bv = col.getValue(b);
        const as = av == null ? '' : String(av);
        const bs = bv == null ? '' : String(bv);
        const cmp = as.localeCompare(bs, undefined, { numeric: true, sensitivity: 'base' });
        return sortDir === 'asc' ? cmp : -cmp;
      });
      // stable secondary by first column
      const secondary = opts.columns[0];
      if (secondary && secondary.key !== sortKey) {
        next.sort((a, b) => {
          const primary = (() => {
            const av = col.getValue(a);
            const bv = col.getValue(b);
            const as = av == null ? '' : String(av);
            const bs = bv == null ? '' : String(bv);
            return as.localeCompare(bs, undefined, { numeric: true, sensitivity: 'base' }) * (sortDir === 'asc' ? 1 : -1);
          })();
          if (primary !== 0) return primary;
          return String(secondary.getValue(a) ?? '').localeCompare(String(secondary.getValue(b) ?? ''), undefined, {
            numeric: true,
          });
        });
      }
    }
    return next;
  }, [rows, query, filterValues, sortKey, sortDir, opts.columns, opts.searchKeys, opts.filters]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(safePage * pageSize, safePage * pageSize + pageSize);

  const toggleSort = (key: string) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('asc');
    }
    setPage(0);
  };

  const doExport = (filename: string, canExport = true) => {
    if (!canExport) return false;
    exportCsv(
      filename,
      opts.columns.map((c) => c.label),
      filtered.map((row) => opts.columns.map((c) => {
        const v = c.getValue(row);
        return v == null ? '' : String(v);
      })),
    );
    return true;
  };

  return {
    query,
    setQuery: (v: string) => {
      setQuery(v);
      setPage(0);
    },
    filterValues,
    setFilter: (key: string, value: string) => {
      setFilterValues((f) => ({ ...f, [key]: value }));
      setPage(0);
    },
    sortKey,
    sortDir,
    toggleSort,
    filtered,
    pageRows,
    page: safePage,
    pageCount,
    setPage,
    total: filtered.length,
    doExport,
  };
}

export function ListToolbar({
  query,
  onQuery,
  placeholder = 'Search…',
  filters,
  filterValues,
  onFilter,
  dateRange,
  onExport,
  exportLabel = 'Export CSV',
  right,
  searchInputRef,
}: {
  query: string;
  onQuery: (v: string) => void;
  placeholder?: string;
  filters?: FilterDef[];
  filterValues?: Record<string, string>;
  onFilter?: (key: string, value: string) => void;
  dateRange?: {
    from: string;
    to: string;
    onFrom: (v: string) => void;
    onTo: (v: string) => void;
    fromLabel?: string;
    toLabel?: string;
  };
  onExport?: () => void;
  exportLabel?: string;
  right?: ReactNode;
  searchInputRef?: Ref<HTMLInputElement>;
}) {
  return (
    <div className="list-toolbar">
      <div className="list-toolbar-search">
        <span className="list-toolbar-label" aria-hidden>
          &nbsp;
        </span>
        <div className="list-toolbar-search-field">
          <Search className="list-toolbar-search-icon" size={14} aria-hidden />
          <Input
            ref={searchInputRef}
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder={placeholder}
            aria-label="Search list"
          />
        </div>
      </div>
      {(filters ?? []).map((f) => (
        <div key={f.key} className="list-toolbar-filter">
          <label className="list-toolbar-label">{f.label}</label>
          <Select value={filterValues?.[f.key] ?? 'All'} onChange={(e) => onFilter?.(f.key, e.target.value)} aria-label={f.label}>
            <option value="All">All</option>
            {f.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>
      ))}
      {dateRange ? (
        <>
          <div className="list-toolbar-filter">
            <label className="list-toolbar-label">{dateRange.fromLabel ?? 'From'}</label>
            <Input
              type="date"
              value={dateRange.from}
              onChange={(e) => dateRange.onFrom(e.target.value)}
              aria-label={dateRange.fromLabel ?? 'From date'}
            />
          </div>
          <div className="list-toolbar-filter">
            <label className="list-toolbar-label">{dateRange.toLabel ?? 'To'}</label>
            <Input
              type="date"
              value={dateRange.to}
              onChange={(e) => dateRange.onTo(e.target.value)}
              aria-label={dateRange.toLabel ?? 'To date'}
            />
          </div>
        </>
      ) : null}
      {onExport ? (
        <div className="list-toolbar-action-wrap">
          <span className="list-toolbar-label" aria-hidden>
            &nbsp;
          </span>
          <Button type="button" variant="secondary" className="list-toolbar-action" onClick={onExport}>
            <Download size={14} /> {exportLabel}
          </Button>
        </div>
      ) : null}
      {right ? <div className="list-toolbar-right">{right}</div> : null}
    </div>
  );
}

export function DataListTable<T extends { id: string }>({
  columns,
  rows,
  sortKey,
  sortDir,
  onSort,
  emptyTitle = 'No results',
  emptyDescription = 'Try adjusting search or filters.',
  onRowClick,
  loading = false,
  activeRowId,
  mobileCards = true,
}: {
  columns: ListColumn<T>[];
  rows: T[];
  sortKey?: string;
  sortDir?: SortDir;
  onSort?: (key: string) => void;
  emptyTitle?: string;
  emptyDescription?: string;
  onRowClick?: (row: T) => void;
  loading?: boolean;
  /** Visually mark the active/selected row (detail sheet, highlight deep-link). */
  activeRowId?: string | null;
  /** Stack rows as cards on small screens (default on). */
  mobileCards?: boolean;
}) {
  if (loading) {
    return <LoadingState />;
  }
  if (!rows.length) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }
  return (
    <div className={`table-wrap${mobileCards ? ' queue-responsive' : ''}`}>
      <table className="data">
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                aria-sort={
                  sortKey === c.key ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined
                }
              >
                {c.sortable !== false && onSort ? (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm table-sort"
                    onClick={() => onSort(c.key)}
                  >
                    {c.label}
                    {sortKey === c.key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                  </button>
                ) : (
                  c.label
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const active = activeRowId != null && row.id === activeRowId;
            return (
              <tr
                key={row.id}
                data-row-id={row.id}
                className={active ? 'is-active' : undefined}
                aria-selected={active || undefined}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                onKeyDown={
                  onRowClick
                    ? (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onRowClick(row);
                        }
                      }
                    : undefined
                }
                tabIndex={onRowClick ? 0 : undefined}
                role={onRowClick ? 'button' : undefined}
                style={{ cursor: onRowClick ? 'pointer' : undefined }}
              >
                {columns.map((c) => (
                  <td key={c.key} data-label={c.label}>
                    {c.render ? c.render(row) : String(c.getValue(row) ?? '—')}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function PaginationBar({
  page,
  pageCount,
  total,
  onPage,
}: {
  page: number;
  pageCount: number;
  total: number;
  onPage: (p: number) => void;
}) {
  return (
    <div className="pagination-bar">
      <span className="muted" style={{ fontSize: 12 }}>
        {total} result{total === 1 ? '' : 's'} · page {page + 1} of {pageCount}
      </span>
      <div className="row">
        <Button type="button" size="sm" variant="secondary" disabled={page <= 0} onClick={() => onPage(page - 1)}>
          Prev
        </Button>
        <Button type="button" size="sm" variant="secondary" disabled={page >= pageCount - 1} onClick={() => onPage(page + 1)}>
          Next
        </Button>
      </div>
    </div>
  );
}
