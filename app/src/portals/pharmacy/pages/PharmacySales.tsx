import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../data/db';
import { daysToExpiry } from '../../../domain/calc';
import type { CustomerSalePaymentMode } from '../../../domain/entities/types';
import { formatINR } from '../../../domain/utils/money';
import {
  createCustomerSale,
  returnCustomerSaleLines,
  saleTotals,
  voidCustomerSale,
} from '../../../services/salesService';
import { useCan } from '../../../store/session';
import { useUi } from '../../../store/ui';
import { useBusyAction } from '../../../ui/hooks/useBusyAction';
import { ConfirmDialog } from '../../../ui/components/ConfirmDialog';
import {
  Button,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  StatusBadge,
} from '../../../ui/components/primitives';
import { useBiz } from './useBiz';

type DraftLine = { inventoryId: string; qty: number; unitPrice: number };

export function PharmacySales() {
  const { id } = useParams();
  const { business, user } = useBiz();
  const { pushToast } = useUi();
  const { busy, run } = useBusyAction();
  const canRecord = useCan('sale.record');
  const sales =
    useLiveQuery(
      () => db.customerSales.where('pharmacyId').equals(business.id).reverse().sortBy('createdAt'),
      [business.id],
    ) ?? [];
  const inventory =
    useLiveQuery(() => db.pharmacyInventory.where('pharmacyId').equals(business.id).toArray(), [business.id]) ?? [];
  const products = useLiveQuery(() => db.products.toArray()) ?? [];

  const [newOpen, setNewOpen] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [phone, setPhone] = useState('');
  const [paymentMode, setPaymentMode] = useState<CustomerSalePaymentMode>('Cash');
  const [homeDelivery, setHomeDelivery] = useState(false);
  const [address, setAddress] = useState('');
  const [draftLines, setDraftLines] = useState<DraftLine[]>([]);
  const [pickInv, setPickInv] = useState('');
  const [voidId, setVoidId] = useState<string | null>(null);
  const [returnOpen, setReturnOpen] = useState(false);
  const [returnQtys, setReturnQtys] = useState<Record<string, number>>({});
  const [returnReason, setReturnReason] = useState('');

  const detail = id ? sales.find((s) => s.id === id || s.saleNo === id) : undefined;

  const sellableInv = useMemo(
    () =>
      inventory.filter((i) => i.onHand > 0 && (!i.expiryDate || daysToExpiry(i.expiryDate) > 0)),
    [inventory],
  );

  const daySales = useMemo(() => {
    const day = new Date().toISOString().slice(0, 10);
    return sales.filter((s) => s.createdAt.slice(0, 10) === day && s.status !== 'Voided');
  }, [sales]);
  const dayRevenue = daySales.reduce((sum, s) => sum + saleTotals(s).revenue, 0);
  const modeSplit = daySales.reduce(
    (acc, s) => {
      acc[s.paymentMode] = (acc[s.paymentMode] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  const resetForm = () => {
    setCustomerName('');
    setPhone('');
    setPaymentMode('Cash');
    setHomeDelivery(false);
    setAddress('');
    setDraftLines([]);
    setPickInv('');
  };

  const addDraftLine = () => {
    const item = sellableInv.find((i) => i.id === pickInv);
    if (!item) return;
    const mrp = products.find((p) => p.id === item.productId)?.mrp ?? 0;
    setDraftLines((prev) => [...prev, { inventoryId: item.id, qty: 1, unitPrice: mrp }]);
    setPickInv('');
  };

  if (detail) {
    const { revenue, activeLines } = saleTotals(detail);
    return (
      <div className="stack">
        <PageHeader
          title={detail.saleNo}
          subtitle={`${detail.customerName}${detail.phone ? ` · ${detail.phone}` : ''}`}
          actions={
            <Link className="btn btn-secondary btn-sm" to="/pharmacy/sales">
              All sales
            </Link>
          }
        />
        <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
          <StatusBadge status={detail.status} />
          {detail.homeDelivery && detail.deliveryStatus ? <StatusBadge status={detail.deliveryStatus} /> : null}
          <span className="muted" style={{ fontSize: 13 }}>
            {detail.paymentMode} · {new Date(detail.createdAt).toLocaleString()}
            {detail.homeDelivery ? ' · Home delivery' : ''}
          </span>
        </div>
        {detail.address ? (
          <div className="muted" style={{ fontSize: 13 }}>
            Deliver to: {detail.address}
            {detail.homeDelivery ? (
              <>
                {' · '}
                <Link to="/pharmacy/delivery">Delivery board</Link>
              </>
            ) : null}
          </div>
        ) : null}
        <div className="card card-pad">
          <table className="data">
            <thead>
              <tr>
                <th>Product</th>
                <th>Batch</th>
                <th>Qty</th>
                <th>Returned</th>
                <th>Price</th>
                <th>Net</th>
              </tr>
            </thead>
            <tbody>
              {activeLines.map((l) => (
                <tr key={l.productRef}>
                  <td>{l.productName}</td>
                  <td className="muted">{l.batchAllocations.map((a) => a.batchNumber ?? '—').join(', ')}</td>
                  <td>{l.qty}</td>
                  <td>{l.returnedQty}</td>
                  <td>{formatINR(l.unitPrice)}</td>
                  <td>{formatINR(l.netQty * l.unitPrice)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ marginTop: 12, fontWeight: 600 }}>Net total {formatINR(revenue)}</div>
        </div>
        {canRecord && detail.status !== 'Voided' && detail.status !== 'Returned' ? (
          <div className="row">
            {!detail.returnedLines.length ? (
              <Button variant="danger" onClick={() => setVoidId(detail.id)}>
                Void sale
              </Button>
            ) : null}
            <Button variant="secondary" onClick={() => setReturnOpen(true)}>
              Return lines
            </Button>
          </div>
        ) : null}
        {detail.voidReason ? (
          <div className="muted" style={{ fontSize: 13 }}>
            Void reason: {detail.voidReason}
          </div>
        ) : null}

        <ConfirmDialog
          open={!!voidId}
          title="Void sale"
          body="Stock will be restored to the original batches."
          requireReason
          tone="danger"
          confirmLabel="Void sale"
          onClose={() => setVoidId(null)}
          onConfirm={async (reason) => {
            const res = await voidCustomerSale({
              actor: user,
              pharmacy: business,
              saleId: voidId!,
              reason: reason!,
            });
            pushToast(res.ok ? { tone: 'info', title: 'Sale voided' } : { tone: 'error', title: res.message });
            setVoidId(null);
          }}
        />

        <Modal
          open={returnOpen}
          title="Return sale lines"
          onClose={() => setReturnOpen(false)}
          footer={
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <Button variant="secondary" onClick={() => setReturnOpen(false)}>
                Cancel
              </Button>
              <Button
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const returns = detail.lines
                      .map((l) => ({ productRef: l.productRef, qty: returnQtys[l.productRef] ?? 0 }))
                      .filter((r) => r.qty > 0);
                    const res = await returnCustomerSaleLines({
                      actor: user,
                      pharmacy: business,
                      saleId: detail.id,
                      returns,
                      reason: returnReason,
                    });
                    pushToast(res.ok ? { tone: 'success', title: 'Return recorded' } : { tone: 'error', title: res.message });
                    if (res.ok) {
                      setReturnOpen(false);
                      setReturnQtys({});
                      setReturnReason('');
                    }
                  })
                }
              >
                Confirm return
              </Button>
            </div>
          }
        >
          <div className="stack">
            {detail.lines.map((l) => {
              const max = l.qty - l.returnedQty;
              if (max <= 0) return null;
              return (
                <Field key={l.productRef} label={`${l.productName} (max ${max})`}>
                  <Input
                    type="number"
                    min={0}
                    max={max}
                    value={returnQtys[l.productRef] ?? 0}
                    onChange={(e) => setReturnQtys((prev) => ({ ...prev, [l.productRef]: Number(e.target.value) }))}
                  />
                </Field>
              );
            })}
            <Field label="Reason">
              <Input value={returnReason} onChange={(e) => setReturnReason(e.target.value)} />
            </Field>
          </div>
        </Modal>
      </div>
    );
  }

  return (
    <div className="stack">
      <PageHeader
        title="Customer sales"
        subtitle="Retail POS from pharmacy inventory — not B2B trade"
        actions={
          canRecord ? (
            <Button size="sm" onClick={() => setNewOpen(true)}>
              New sale
            </Button>
          ) : null
        }
      />

      <div className="row" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div className="card card-pad" style={{ minWidth: 140 }}>
          <div className="muted" style={{ fontSize: 12 }}>
            Today count
          </div>
          <strong>{daySales.length}</strong>
        </div>
        <div className="card card-pad" style={{ minWidth: 140 }}>
          <div className="muted" style={{ fontSize: 12 }}>
            Today revenue
          </div>
          <strong>{formatINR(dayRevenue)}</strong>
        </div>
        <div className="card card-pad" style={{ minWidth: 180 }}>
          <div className="muted" style={{ fontSize: 12 }}>
            Mode split
          </div>
          <strong style={{ fontSize: 13 }}>
            {Object.keys(modeSplit).length
              ? Object.entries(modeSplit)
                  .map(([k, v]) => `${k} ${v}`)
                  .join(' · ')
              : '—'}
          </strong>
        </div>
      </div>

      {!sales.length ? (
        <EmptyState
          title="No customer sales yet"
          description="Record walk-in or phone sales from received pharmacy stock."
          action={
            canRecord ? (
              <Button onClick={() => setNewOpen(true)}>New sale</Button>
            ) : undefined
          }
        />
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Sale</th>
                <th>Customer</th>
                <th>Mode</th>
                <th>Total</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {sales.map((s) => (
                <tr key={s.id}>
                  <td>
                    <Link to={`/pharmacy/sales/${s.saleNo}`}>{s.saleNo}</Link>
                    <div className="muted" style={{ fontSize: 11 }}>
                      {new Date(s.createdAt).toLocaleString()}
                    </div>
                  </td>
                  <td>{s.customerName}</td>
                  <td>{s.paymentMode}</td>
                  <td>{formatINR(saleTotals(s).revenue)}</td>
                  <td>
                    <StatusBadge status={s.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={newOpen}
        title="New sale"
        onClose={() => {
          setNewOpen(false);
          resetForm();
        }}
        footer={
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <Button
              variant="secondary"
              onClick={() => {
                setNewOpen(false);
                resetForm();
              }}
            >
              Cancel
            </Button>
            <Button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const res = await createCustomerSale({
                    actor: user,
                    pharmacy: business,
                    customerName,
                    phone,
                    paymentMode,
                    homeDelivery,
                    address,
                    lines: draftLines,
                  });
                  if (!res.ok) {
                    pushToast({ tone: 'error', title: res.message });
                    return;
                  }
                  pushToast({ tone: 'success', title: 'Sale recorded', message: res.data.saleNo });
                  setNewOpen(false);
                  resetForm();
                })
              }
            >
              Save sale
            </Button>
          </div>
        }
      >
        <div className="stack">
          <Field label="Customer name">
            <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
          </Field>
          <Field label="Phone (optional)">
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
          <Field label="Payment mode">
            <Select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value as CustomerSalePaymentMode)}>
              <option value="Cash">Cash</option>
              <option value="UPI">UPI</option>
              <option value="Credit">Credit</option>
            </Select>
          </Field>
          <label style={{ fontSize: 13 }}>
            <input type="checkbox" checked={homeDelivery} onChange={(e) => setHomeDelivery(e.target.checked)} /> Home
            delivery
          </label>
          {homeDelivery ? (
            <Field label="Delivery address">
              <Input value={address} onChange={(e) => setAddress(e.target.value)} />
            </Field>
          ) : null}

          <strong>Lines</strong>
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <Field label="From inventory">
              <Select value={pickInv} onChange={(e) => setPickInv(e.target.value)}>
                <option value="">Select…</option>
                {sellableInv.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.productName} · on hand {i.onHand}
                    {i.batchNumber ? ` · ${i.batchNumber}` : ''}
                  </option>
                ))}
              </Select>
            </Field>
            <Button variant="secondary" disabled={!pickInv} onClick={addDraftLine}>
              Add line
            </Button>
          </div>
          {draftLines.map((l, idx) => {
            const item = inventory.find((i) => i.id === l.inventoryId);
            return (
              <div key={`${l.inventoryId}-${idx}`} className="row" style={{ alignItems: 'flex-end' }}>
                <div style={{ flex: 1, fontSize: 13 }}>{item?.productName ?? l.inventoryId}</div>
                <Field label="Qty">
                  <Input
                    type="number"
                    min={1}
                    max={item?.onHand ?? 1}
                    value={l.qty}
                    onChange={(e) =>
                      setDraftLines((prev) =>
                        prev.map((x, i) => (i === idx ? { ...x, qty: Number(e.target.value) } : x)),
                      )
                    }
                  />
                </Field>
                <Field label="Unit price">
                  <Input
                    type="number"
                    min={0}
                    value={l.unitPrice}
                    onChange={(e) =>
                      setDraftLines((prev) =>
                        prev.map((x, i) => (i === idx ? { ...x, unitPrice: Number(e.target.value) } : x)),
                      )
                    }
                  />
                </Field>
                <Button size="sm" variant="secondary" onClick={() => setDraftLines((prev) => prev.filter((_, i) => i !== idx))}>
                  Remove
                </Button>
              </div>
            );
          })}
        </div>
      </Modal>
    </div>
  );
}
