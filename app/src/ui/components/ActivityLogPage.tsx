import { useEffect, useState } from 'react';
import type { AuditLog } from '../../domain/entities/types';
import { exportOwnActivityCsv, listOwnActivity } from '../../services/activityLogService';
import { useSession } from '../../store/session';
import { useUi } from '../../store/ui';
import { useBusyAction } from '../hooks/useBusyAction';
import { Button, EmptyState, Field, Input, PageHeader } from './primitives';

export function ActivityLogPage() {
  const { user, business } = useSession();
  const { pushToast } = useUi();
  const { busy, run } = useBusyAction();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [action, setAction] = useState('');
  const [rows, setRows] = useState<AuditLog[]>([]);

  const refresh = () =>
    void run(async () => {
      if (!user || !business) return;
      const res = await listOwnActivity({
        actor: user,
        business,
        filters: { from: from || undefined, to: to || undefined, action: action || undefined },
      });
      if (!res.ok) {
        pushToast({ tone: 'error', title: res.message });
        return;
      }
      setRows(res.data);
    });

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, business?.id]);

  if (!user || !business) return null;

  return (
    <div className="stack">
      <PageHeader
        title="Activity log"
        subtitle="Own-business audit trail only (CF-37)"
        actions={
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const res = await exportOwnActivityCsv({
                  actor: user,
                  business,
                  filters: { from: from || undefined, to: to || undefined, action: action || undefined },
                });
                if (!res.ok) {
                  pushToast({ tone: 'error', title: res.message });
                  return;
                }
                const blob = new Blob([res.data.csv], { type: 'text/csv;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = res.data.filename;
                a.click();
                URL.revokeObjectURL(url);
                pushToast({ tone: 'success', title: 'Activity exported' });
              })
            }
          >
            Export CSV
          </Button>
        }
      />
      <div className="card card-pad grid-3">
        <Field label="From">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="To">
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
        <Field label="Action contains">
          <Input value={action} onChange={(e) => setAction(e.target.value)} placeholder="e.g. order." />
        </Field>
      </div>
      <Button type="button" onClick={() => void refresh()} disabled={busy}>
        Refresh
      </Button>
      {!rows.length ? (
        <EmptyState title="No activity" description="Actions for this business appear here as they are audited." />
      ) : (
        <div className="card" style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th>When</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Target</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{new Date(r.at).toLocaleString()}</td>
                  <td>{r.actorName}</td>
                  <td>{r.action}</td>
                  <td>
                    {r.entityType} · {r.entityId.slice(0, 8)}
                  </td>
                  <td>{r.reason ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
