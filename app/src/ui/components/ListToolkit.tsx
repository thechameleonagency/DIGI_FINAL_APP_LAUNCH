import { useMemo, useState, type ReactNode } from 'react';
import { Download, Search } from 'lucide-react';
import { Button, EmptyState, Input, Select } from './primitives';

export type SortDir = 'asc' | 'desc';

export interface ListColumn<T> {
  key: string;
  label: string;
  sortable?: boolean;
  getValue: (row: T) => string | number | boolean | null | undefined;
  render?: (row: T) => ReactNode;
}

export interface FilterDef {
  key: string;
  label: string;
  options: { value: string; label: string }[];
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

export function useListControls<T>(
  rows: T[],
  opts: {
    columns: ListColumn<T>[];
    searchKeys: (keyof T | ((row: T) => string))[];
    filters?: FilterDef[];
    defaultSortKey?: string;
    defaultSortDir?: SortDir;
    pageSize?: number;
  },
) {
  const [query, setQuery] = useState('');
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [sortKey, setSortKey] = useState(opts.defaultSortKey ?? opts.columns[0]?.key ?? '');
  const [sortDir, setSortDir] = useState<SortDir>(opts.defaultSortDir ?? 'desc');
  const [page, setPage] = useState(0);
  const pageSize = opts.pageSize ?? 25;

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
  onExport,
  exportLabel = 'Export CSV',
  right,
}: {
  query: string;
  onQuery: (v: string) => void;
  placeholder?: string;
  filters?: FilterDef[];
  filterValues?: Record<string, string>;
  onFilter?: (key: string, value: string) => void;
  onExport?: () => void;
  exportLabel?: string;
  right?: ReactNode;
}) {
  return (
    <div className="row" style={{ marginBottom: 12, alignItems: 'flex-end' }}>
      <div style={{ position: 'relative', flex: '1 1 220px', maxWidth: 320 }}>
        <Search size={14} style={{ position: 'absolute', left: 10, top: 13, color: 'var(--muted)' }} />
        <Input
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder={placeholder}
          style={{ paddingLeft: 32 }}
          aria-label="Search list"
        />
      </div>
      {(filters ?? []).map((f) => (
        <div key={f.key} style={{ minWidth: 140 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>
            {f.label}
          </label>
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
      {onExport ? (
        <Button type="button" variant="secondary" size="sm" onClick={onExport}>
          <Download size={14} /> {exportLabel}
        </Button>
      ) : null}
      {right}
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
}: {
  columns: ListColumn<T>[];
  rows: T[];
  sortKey?: string;
  sortDir?: SortDir;
  onSort?: (key: string) => void;
  emptyTitle?: string;
  emptyDescription?: string;
  onRowClick?: (row: T) => void;
}) {
  if (!rows.length) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }
  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key}>
                {c.sortable !== false && onSort ? (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    style={{ padding: 0, height: 'auto', fontWeight: 600, color: 'inherit' }}
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
          {rows.map((row) => (
            <tr
              key={row.id}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              style={onRowClick ? { cursor: 'pointer' } : undefined}
            >
              {columns.map((c) => (
                <td key={c.key}>{c.render ? c.render(row) : String(c.getValue(row) ?? '—')}</td>
              ))}
            </tr>
          ))}
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
    <div className="row" style={{ justifyContent: 'space-between', marginTop: 10 }}>
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
