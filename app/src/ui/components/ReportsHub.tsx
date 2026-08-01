import { useState } from 'react';
import type { Business, User } from '../../domain/entities/types';
import type { Result } from '../../domain/errors/types';
import { downloadReportCsv, type ReportCsv } from '../../services/reportService';
import { useUi } from '../../store/ui';
import { useBusyAction } from '../hooks/useBusyAction';
import { Button, Field, Input, PageHeader } from './primitives';

export type ReportTile = {
  id: string;
  title: string;
  description: string;
};

export function ReportsHub({
  title,
  subtitle,
  tiles,
  exportReport,
}: {
  title: string;
  subtitle: string;
  tiles: ReportTile[];
  exportReport: (reportId: string, from?: string, to?: string) => Promise<Result<ReportCsv>>;
}) {
  const { pushToast } = useUi();
  const { busy, run } = useBusyAction();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const runExport = (id: string) =>
    void run(async () => {
      const res = await exportReport(id, from || undefined, to || undefined);
      if (!res.ok) {
        pushToast({ tone: 'error', title: res.message });
        return;
      }
      downloadReportCsv(res.data);
      pushToast({ tone: 'success', title: `Exported ${res.data.filename}` });
    });

  return (
    <div className="stack">
      <PageHeader title={title} subtitle={subtitle} />
      <div className="card card-pad grid-2">
        <Field label="From">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="To">
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
      </div>
      <div className="grid-2">
        {tiles.map((t) => (
          <div key={t.id} className="card card-pad stack">
            <strong>{t.title}</strong>
            <p className="muted" style={{ margin: 0 }}>
              {t.description}
            </p>
            <Button type="button" disabled={busy} onClick={() => void runExport(t.id)}>
              Download CSV
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

export function actorBiz(user: User, business: Business) {
  return { actor: user, business };
}
