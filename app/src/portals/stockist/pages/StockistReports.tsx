import { exportStockistReport } from '../../../services/reportService';
import { ReportsHub } from '../../../ui/components/ReportsHub';
import { useBiz } from './useBiz';

const tiles = [
  { id: 'sales', title: 'Sales', description: 'Issued invoices by period and pharmacy.' },
  { id: 'gst-summary', title: 'GST summary', description: 'Output tax from issued invoices.' },
  { id: 'outstanding', title: 'Outstanding & aging', description: 'Receivables by pharmacy with aging band.' },
  { id: 'stock-aging', title: 'Stock aging', description: 'Batch quantities, expiry bands, and value at PTR.' },
  {
    id: 'schedule-compliance',
    title: 'H / H1 / X / NDPS register',
    description: 'Scheduled-drug B2B order lines for the period.',
  },
] as const;

export function StockistReports() {
  const { user, business } = useBiz();
  return (
    <ReportsHub
      title="Stockist reports"
      subtitle="CSV exports include filter summary and timestamp"
      tiles={[...tiles]}
      exportReport={(reportId, from, to) =>
        exportStockistReport({
          actor: user,
          stockist: business,
          report: reportId as (typeof tiles)[number]['id'],
          from,
          to,
        })
      }
    />
  );
}
