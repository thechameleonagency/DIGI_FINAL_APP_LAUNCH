import type { ReactNode } from 'react';
import { PageHeader, Tabs } from './primitives';

export type ListPageTab = { id: string; label: ReactNode; count?: number };

/**
 * Canonical list-page layout: title/actions, optional tabs, selection summary,
 * toolbar, filters row, then table children. Compose with ListToolbar + DataListTable.
 */
export function ListPageChrome({
  title,
  subtitle,
  actions,
  backTo,
  backLabel,
  tabs,
  tab,
  onTab,
  selectionSummary,
  toolbar,
  filtersSlot,
  className,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  backTo?: string;
  backLabel?: string;
  tabs?: ListPageTab[];
  tab?: string;
  onTab?: (id: string) => void;
  selectionSummary?: ReactNode;
  toolbar?: ReactNode;
  filtersSlot?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div className={`list-page-chrome stack${className ? ` ${className}` : ''}`}>
      <PageHeader title={title} subtitle={subtitle} actions={actions} backTo={backTo} backLabel={backLabel} />
      {tabs && tabs.length && tab != null && onTab ? (
        <Tabs
          ariaLabel={`${title} sections`}
          value={tab}
          onChange={onTab}
          items={tabs.map((t) => ({
            id: t.id,
            label:
              t.count != null ? (
                <span>
                  {t.label} <span className="muted">({t.count})</span>
                </span>
              ) : (
                t.label
              ),
          }))}
        />
      ) : null}
      {selectionSummary ? <div className="list-page-chrome-selection">{selectionSummary}</div> : null}
      {toolbar ? <div className="list-page-chrome-toolbar">{toolbar}</div> : null}
      {filtersSlot ? <div className="list-page-chrome-filters">{filtersSlot}</div> : null}
      {children}
    </div>
  );
}
