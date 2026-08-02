import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { db } from '../../../data/db';
import { useUi } from '../../../store/ui';
import { DataListTable, ListToolbar, PaginationBar, useListControls } from '../../../ui/components/ListToolkit';
import { PageHeader, StatusBadge } from '../../../ui/components/primitives';
import { useLiveArray } from '../../../ui/hooks/useLiveArray';

export function AdminNetwork() {
  const { pushToast } = useUi();
  const navigate = useNavigate();
  const { items: businesses, loading: businessesLoading } = useLiveArray(() =>
    db.businesses.filter((b) => b.type !== 'Platform').toArray(),
  );
  const columns = useMemo(
    () => [
      {
        key: 'name',
        label: 'Name',
        getValue: (b: (typeof businesses)[0]) => b.name,
        render: (b: (typeof businesses)[0]) => <Link to={`/admin/network/${b.id}`}>{b.name}</Link>,
      },
      { key: 'type', label: 'Type', getValue: (b: (typeof businesses)[0]) => b.type },
      { key: 'city', label: 'City', getValue: (b: (typeof businesses)[0]) => b.city },
      {
        key: 'verificationStatus',
        label: 'Verification',
        getValue: (b: (typeof businesses)[0]) => b.verificationStatus,
        render: (b: (typeof businesses)[0]) => <StatusBadge status={b.verificationStatus} />,
      },
      {
        key: 'accountStatus',
        label: 'Account',
        getValue: (b: (typeof businesses)[0]) => b.accountStatus,
        render: (b: (typeof businesses)[0]) => <StatusBadge status={b.accountStatus} />,
      },
    ],
    [],
  );
  const list = useListControls(businesses, {
    columns,
    searchKeys: [(b) => `${b.name} ${b.gstNumber ?? ''} ${b.city} ${b.email}`],
    filters: [
      { key: 'type', label: 'Type', options: ['Pharmacy', 'Stockist'].map((t) => ({ value: t, label: t })) },
      {
        key: 'accountStatus',
        label: 'Account',
        options: ['Active', 'Suspended', 'Deactivated'].map((t) => ({ value: t, label: t })),
      },
    ],
    defaultSortKey: 'name',
    defaultSortDir: 'asc',
  });
  return (
    <div className="stack">
      <PageHeader title="Network directory" subtitle="Open a business for profile, documents, users, and account actions" />
      <ListToolbar
        query={list.query}
        onQuery={list.setQuery}
        placeholder="Search name / GST / city"
        filters={[
          { key: 'type', label: 'Type', options: ['Pharmacy', 'Stockist'].map((t) => ({ value: t, label: t })) },
          {
            key: 'accountStatus',
            label: 'Account',
            options: ['Active', 'Suspended', 'Deactivated'].map((t) => ({ value: t, label: t })),
          },
        ]}
        filterValues={list.filterValues}
        onFilter={list.setFilter}
        onExport={() => {
          list.doExport('network-directory.csv');
          pushToast({ tone: 'success', title: 'Network export ready' });
        }}
      />
      <DataListTable
        columns={columns}
        rows={list.pageRows}
        sortKey={list.sortKey}
        sortDir={list.sortDir}
        onSort={list.toggleSort}
        loading={businessesLoading}
        onRowClick={(b) => navigate(`/admin/network/${b.id}`)}
      />
      <PaginationBar page={list.page} pageCount={list.pageCount} total={list.total} onPage={list.setPage} />
    </div>
  );
}
