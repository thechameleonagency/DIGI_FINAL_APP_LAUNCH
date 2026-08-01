import { exportPharmacyReport } from '../../../services/reportService';
import { ReportsHub } from '../../../ui/components/ReportsHub';
import { useBiz } from './useBiz';

const tiles = [
  { id: 'purchases', title: 'Purchases', description: 'Orders by period and supplier.' },
  { id: 'gst-summary', title: 'GST summary', description: 'Input tax from purchase invoices in the period.' },
  { id: 'stock-aging', title: 'Stock aging', description: 'Pharmacy inventory by expiry band.' },
  { id: 'outstanding', title: 'Outstanding by supplier', description: 'Payables grouped by stockist.' },
] as const;

export function PharmacyReports() {
  const { user, business } = useBiz();
  return (
    <ReportsHub
      title="Pharmacy reports"
      subtitle="CSV exports include filter summary and timestamp"
      tiles={[...tiles]}
      exportReport={(reportId, from, to) =>
        exportPharmacyReport({
          actor: user,
          pharmacy: business,
          report: reportId as (typeof tiles)[number]['id'],
          from,
          to,
        })
      }
    />
  );
}
