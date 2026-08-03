import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../data/db';
import { formatINR } from '../../../domain/utils/money';
import {
  deactivateManagedSupplier,
  listManagedSupplierBills,
  upsertManagedSupplier,
} from '../../../services/managedSupplierService';
import { useUi } from '../../../store/ui';
import { BillOcrWizard } from '../../../ui/components/BillOcrWizard';
import { Button, EmptyState, Field, Input, Modal, PageHeader, StatusBadge } from '../../../ui/components/primitives';
import { useBiz } from './useBiz';

export function PharmacyOfflineSuppliers() {
  const { business, user } = useBiz();
  const { pushToast } = useUi();
  const suppliers =
    useLiveQuery(() => db.managedSuppliers.where('pharmacyId').equals(business.id).toArray(), [business.id]) ?? [];
  const bills =
    useLiveQuery(() => listManagedSupplierBills(business.id), [business.id]) ?? [];
  const [form, setForm] = useState({ name: '', contact: '', phone: '', gst: '', address: '' });
  const [ocrSupplierId, setOcrSupplierId] = useState<string | null>(null);

  return (
    <div className="stack">
      <PageHeader
        title="Offline suppliers"
        subtitle="Local stockists not on Digi — purchase bills go to your shelf inventory (no platform commission)"
      />

      <div className="card card-pad stack">
        <strong>Add supplier</strong>
        <div className="grid-2">
          <Field label="Name">
            <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </Field>
          <Field label="Contact">
            <Input value={form.contact} onChange={(e) => setForm((f) => ({ ...f, contact: e.target.value }))} />
          </Field>
          <Field label="Phone">
            <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
          </Field>
          <Field label="GST">
            <Input value={form.gst} onChange={(e) => setForm((f) => ({ ...f, gst: e.target.value }))} />
          </Field>
        </div>
        <Button
          onClick={async () => {
            const res = await upsertManagedSupplier({
              actor: user,
              pharmacy: business,
              supplier: form,
            });
            if (!res.ok) {
              pushToast({ tone: 'error', title: res.message });
              return;
            }
            pushToast({ tone: 'success', title: 'Supplier saved' });
            setForm({ name: '', contact: '', phone: '', gst: '', address: '' });
          }}
        >
          Save supplier
        </Button>
      </div>

      {!suppliers.length ? (
        <EmptyState title="No offline suppliers" description="Add local wholesalers you buy from outside Digi." />
      ) : (
        <div className="stack">
          {suppliers.map((s) => (
            <div key={s.id} className="card card-pad stack">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <div>
                  <strong>{s.name}</strong>
                  <div className="muted" style={{ fontSize: 13 }}>
                    {s.contact} {s.phone ? `· ${s.phone}` : ''}
                  </div>
                </div>
                <StatusBadge status={s.active ? 'Active' : 'Inactive'} />
              </div>
              <div className="row" style={{ gap: 8 }}>
                <Button onClick={() => setOcrSupplierId(s.id)}>Upload bill (OCR)</Button>
                {s.active ? (
                  <Button
                    variant="secondary"
                    onClick={async () => {
                      await deactivateManagedSupplier({ actor: user, pharmacy: business, supplierId: s.id });
                    }}
                  >
                    Deactivate
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="card card-pad stack">
        <strong>Recent bills</strong>
        {!bills.length ? (
          <p className="muted">No bills imported yet.</p>
        ) : (
          <table className="data" style={{ width: '100%', fontSize: 13 }}>
            <thead>
              <tr>
                <th>Bill</th>
                <th>Supplier</th>
                <th>Date</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {bills.map((b) => (
                <tr key={b.id}>
                  <td>{b.billNo}</td>
                  <td>{suppliers.find((s) => s.id === b.supplierId)?.name ?? b.supplierId}</td>
                  <td>{b.date}</td>
                  <td>{formatINR(b.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal open={!!ocrSupplierId} onClose={() => setOcrSupplierId(null)} title="Supplier bill OCR">
        {ocrSupplierId ? (
          <BillOcrWizard
            mode="pharmacy-supplier"
            actor={user}
            business={business}
            supplierId={ocrSupplierId}
            onCancel={() => setOcrSupplierId(null)}
            onDone={() => pushToast({ tone: 'success', title: 'Bill imported to inventory' })}
          />
        ) : null}
      </Modal>
    </div>
  );
}
