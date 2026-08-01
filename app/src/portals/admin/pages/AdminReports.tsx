import { exportAdminReport } from '../../../services/reportService';
import { ReportsHub } from '../../../ui/components/ReportsHub';
import { useBiz } from './useBiz';

const tiles = [
  { id: 'registrations', title: 'Registrations', description: 'Business registrations over time by type and status.' },
  {
    id: 'verification-throughput',
    title: 'Verification throughput',
    description: 'Submitted / approved / rejected counts and average days to approve.',
  },
  { id: 'gmv-monthly', title: 'GMV by month', description: 'Issued invoice grand totals grouped by month.' },
  { id: 'tickets', title: 'Support tickets', description: 'Ticket volume with status and resolution counts.' },
  {
    id: 'trade-commission',
    title: 'Trade commission',
    description: 'Baked-in commission from order-line snapshots (Generic % / Ethical flat / Offline flat).',
  },
] as const;

export function AdminReports() {
  const { user, business } = useBiz();
  return (
    <ReportsHub
      title="Platform reports"
      subtitle="Canned CSV exports include filter summary and generation timestamp"
      tiles={[...tiles]}
      exportReport={(reportId, from, to) =>
        exportAdminReport({
          actor: user,
          platform: business,
          report: reportId as (typeof tiles)[number]['id'],
          from,
          to,
        })
      }
    />
  );
}
