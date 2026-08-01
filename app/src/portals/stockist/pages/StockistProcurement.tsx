import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../data/db';
import {
  createPurchaseBill,
  createPurchaseOrder,
  createSupplierReturn,
  deleteOrDeactivateSupplier,
  listRequiredStock,
  parsePurchaseBillText,
  receivePurchaseOrder,
  sendSupplierReturn,
  settleSupplierReturn,
  transitionPurchaseOrder,
  upsertSupplier,
} from '../../../services/procurementService';
import { useUi } from '../../../store/ui';
import { useBusyAction } from '../../../ui/hooks/useBusyAction';
import { FileUpload } from '../../../ui/components/FileUpload';
import {
  Button,
  EmptyState,
  Field,
  Input,
  Money,
  PageHeader,
  Select,
  StatusBadge,
  Textarea,
} from '../../../ui/components/primitives';
import { useBiz } from './useBiz';

type Tab = 'Suppliers' | 'POs' | 'Receive' | 'Bills' | 'Returns' | 'Required';

export function StockistProcurement() {
  const { business, user } = useBiz();
  const { pushToast } = useUi();
  const { busy, run } = useBusyAction();
  const [tab, setTab] = useState<Tab>('Suppliers');
  const suppliers =
    useLiveQuery(() => db.suppliers.where('stockistId').equals(business.id).toArray(), [business.id]) ?? [];
  const pos =
    useLiveQuery(() => db.purchaseOrders.where('stockistId').equals(business.id).reverse().sortBy('createdAt'), [
      business.id,
    ]) ?? [];
  const bills =
    useLiveQuery(() => db.purchaseBills.where('stockistId').equals(business.id).toArray(), [business.id]) ?? [];
  const returns =
    useLiveQuery(() => db.supplierReturns.where('stockistId').equals(business.id).toArray(), [business.id]) ?? [];
  const products =
    useLiveQuery(() => db.products.where('stockistId').equals(business.id).toArray(), [business.id]) ?? [];
  const batches =
    useLiveQuery(() => db.batches.where('stockistId').equals(business.id).toArray(), [business.id]) ?? [];

  const [supName, setSupName] = useState('');
  const [supContact, setSupContact] = useState('');
  const [supGst, setSupGst] = useState('');

  const [poSupplierId, setPoSupplierId] = useState('');
  const [poProductId, setPoProductId] = useState('');
  const [poQty, setPoQty] = useState('10');
  const [poCost, setPoCost] = useState('0');

  const [recvPoId, setRecvPoId] = useState('');
  const [recvProductId, setRecvProductId] = useState('');
  const [recvQty, setRecvQty] = useState('');
  const [recvBatch, setRecvBatch] = useState('');
  const [recvExpiry, setRecvExpiry] = useState('');
  const [confirmOver, setConfirmOver] = useState(false);

  const [billSupplierId, setBillSupplierId] = useState('');
  const [billNo, setBillNo] = useState('');
  const [billDate, setBillDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [billAmount, setBillAmount] = useState('');
  const [billFile, setBillFile] = useState<string | undefined>();
  const [billPaste, setBillPaste] = useState('');

  const [retSupplierId, setRetSupplierId] = useState('');
  const [retBatchId, setRetBatchId] = useState('');
  const [retQty, setRetQty] = useState('');
  const [retReason, setRetReason] = useState('');

  const [required, setRequired] = useState<
    { productId: string; name: string; onHand: number; reorderLevel: number; suggestedQty: number }[]
  >([]);

  const openRecvPos = useMemo(
    () => pos.filter((p) => p.status === 'Sent' || p.status === 'PartiallyReceived'),
    [pos],
  );
  const recvPo = openRecvPos.find((p) => p.id === recvPoId);
  const supplierName = (id: string) => suppliers.find((s) => s.id === id)?.name ?? id.slice(0, 6);

  return (
    <div className="stack">
      <PageHeader title="Procurement" subtitle="Suppliers, POs, receiving, bills & manufacturer returns" />
      <div className="tabs">
        {(['Suppliers', 'POs', 'Receive', 'Bills', 'Returns', 'Required'] as Tab[]).map((t) => (
          <button
            key={t}
            className={`tab${tab === t ? ' active' : ''}`}
            onClick={() => {
              setTab(t);
              if (t === 'Required') void listRequiredStock(business.id).then(setRequired);
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'Suppliers' && (
        <div className="stack">
          <div className="card card-pad stack">
            <strong>Add supplier</strong>
            <Field label="Name">
              <Input value={supName} onChange={(e) => setSupName(e.target.value)} />
            </Field>
            <Field label="Contact">
              <Input value={supContact} onChange={(e) => setSupContact(e.target.value)} />
            </Field>
            <Field label="GST (optional)">
              <Input value={supGst} onChange={(e) => setSupGst(e.target.value)} />
            </Field>
            <Button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const res = await upsertSupplier({
                    actor: user,
                    stockist: business,
                    name: supName,
                    contact: supContact,
                    gst: supGst || undefined,
                  });
                  pushToast(res.ok ? { tone: 'success', title: 'Supplier saved' } : { tone: 'error', title: res.message });
                  if (res.ok) {
                    setSupName('');
                    setSupContact('');
                    setSupGst('');
                  }
                })
              }
            >
              Save supplier
            </Button>
          </div>
          {!suppliers.length ? (
            <EmptyState title="No suppliers" description="Local supplier records only — not platform partners." />
          ) : (
            suppliers.map((s) => (
              <div key={s.id} className="card card-pad row" style={{ justifyContent: 'space-between' }}>
                <div>
                  <strong>{s.name}</strong>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {s.contact}
                    {s.gst ? ` · ${s.gst}` : ''}
                    {!s.active ? ' · inactive' : ''}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() =>
                    void run(async () => {
                      const res = await deleteOrDeactivateSupplier({ actor: user, stockist: business, id: s.id });
                      pushToast(
                        res.ok
                          ? { tone: 'info', title: res.data === true ? 'Deleted' : 'Deactivated (open POs)' }
                          : { tone: 'error', title: res.message },
                      );
                    })
                  }
                >
                  Remove
                </Button>
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'POs' && (
        <div className="stack">
          <div className="card card-pad stack">
            <strong>New draft PO</strong>
            <Field label="Supplier">
              <Select value={poSupplierId} onChange={(e) => setPoSupplierId(e.target.value)}>
                <option value="">Select</option>
                {suppliers
                  .filter((s) => s.active)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </Select>
            </Field>
            <Field label="Product">
              <Select value={poProductId} onChange={(e) => setPoProductId(e.target.value)}>
                <option value="">Select</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="grid-2">
              <Field label="Qty">
                <Input type="number" value={poQty} onChange={(e) => setPoQty(e.target.value)} />
              </Field>
              <Field label="Expected cost">
                <Input type="number" value={poCost} onChange={(e) => setPoCost(e.target.value)} />
              </Field>
            </div>
            <Button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const res = await createPurchaseOrder({
                    actor: user,
                    stockist: business,
                    supplierId: poSupplierId,
                    lines: [{ productId: poProductId, qty: Number(poQty), expectedCost: Number(poCost) }],
                  });
                  pushToast(res.ok ? { tone: 'success', title: res.data.poNo } : { tone: 'error', title: res.message });
                })
              }
            >
              Create draft
            </Button>
          </div>
          {pos.map((po) => (
            <div key={po.id} className="card card-pad stack">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <strong>{po.poNo}</strong>
                <StatusBadge status={po.status} />
              </div>
              <div className="muted" style={{ fontSize: 12 }}>
                {supplierName(po.supplierId)} · {po.lines.length} lines
              </div>
              <div className="row">
                {po.status === 'Draft' ? (
                  <Button
                    size="sm"
                    onClick={() =>
                      void run(async () => {
                        const res = await transitionPurchaseOrder({
                          actor: user,
                          stockist: business,
                          poId: po.id,
                          to: 'Sent',
                        });
                        pushToast(res.ok ? { tone: 'success', title: 'PO sent' } : { tone: 'error', title: res.message });
                      })
                    }
                  >
                    Mark sent
                  </Button>
                ) : null}
                {po.status === 'Draft' || po.status === 'Sent' ? (
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() =>
                      void run(async () => {
                        const res = await transitionPurchaseOrder({
                          actor: user,
                          stockist: business,
                          poId: po.id,
                          to: 'Cancelled',
                        });
                        pushToast(
                          res.ok ? { tone: 'info', title: 'Cancelled' } : { tone: 'error', title: res.message },
                        );
                      })
                    }
                  >
                    Cancel
                  </Button>
                ) : null}
                {po.status === 'Received' || po.status === 'PartiallyReceived' ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      void run(async () => {
                        const res = await transitionPurchaseOrder({
                          actor: user,
                          stockist: business,
                          poId: po.id,
                          to: 'Closed',
                        });
                        pushToast(res.ok ? { tone: 'success', title: 'Closed' } : { tone: 'error', title: res.message });
                      })
                    }
                  >
                    Close
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'Receive' && (
        <div className="card card-pad stack">
          <Field label="Open PO">
            <Select
              value={recvPoId}
              onChange={(e) => {
                setRecvPoId(e.target.value);
                setRecvProductId('');
              }}
            >
              <option value="">Select</option>
              {openRecvPos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.poNo} ({p.status})
                </option>
              ))}
            </Select>
          </Field>
          {recvPo ? (
            <>
              <Field label="Product">
                <Select value={recvProductId} onChange={(e) => setRecvProductId(e.target.value)}>
                  <option value="">Select</option>
                  {recvPo.lines.map((l) => (
                    <option key={l.productId} value={l.productId}>
                      {l.productName ?? l.productId} (recv {l.receivedQty}/{l.qty})
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="grid-2">
                <Field label="Qty">
                  <Input value={recvQty} onChange={(e) => setRecvQty(e.target.value)} type="number" />
                </Field>
                <Field label="Batch">
                  <Input value={recvBatch} onChange={(e) => setRecvBatch(e.target.value)} />
                </Field>
              </div>
              <Field label="Expiry">
                <Input type="date" value={recvExpiry} onChange={(e) => setRecvExpiry(e.target.value)} />
              </Field>
              <label className="row" style={{ fontSize: 13 }}>
                <input type="checkbox" checked={confirmOver} onChange={(e) => setConfirmOver(e.target.checked)} />
                Confirm over-receipt if qty exceeds ordered
              </label>
              <Button
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const res = await receivePurchaseOrder({
                      actor: user,
                      stockist: business,
                      poId: recvPoId,
                      confirmOverReceipt: confirmOver,
                      lines: [
                        {
                          productId: recvProductId,
                          qty: Number(recvQty),
                          batchNumber: recvBatch,
                          expiryDate: recvExpiry,
                        },
                      ],
                    });
                    pushToast(
                      res.ok
                        ? { tone: 'success', title: `Received → ${res.data.status}` }
                        : { tone: 'error', title: res.message },
                    );
                  })
                }
              >
                Record receipt
              </Button>
            </>
          ) : (
            <p className="muted">Send a PO first, then receive against it.</p>
          )}
        </div>
      )}

      {tab === 'Bills' && (
        <div className="stack">
          <div className="card card-pad stack">
            <strong>Purchase bill</strong>
            <Field label="Paste bill text (optional)">
              <Textarea
                rows={3}
                value={billPaste}
                onChange={(e) => setBillPaste(e.target.value)}
                placeholder={'Bill INV-88\nAmount: 1500\nDolo 10 x 12'}
              />
            </Field>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                const parsed = parsePurchaseBillText(billPaste);
                if (parsed.billNo) setBillNo(parsed.billNo);
                if (parsed.amount != null) setBillAmount(String(parsed.amount));
                pushToast({
                  tone: 'info',
                  title: 'Parsed',
                  message: `${parsed.lines.length} line(s)${parsed.billNo ? `, bill ${parsed.billNo}` : ''}`,
                });
              }}
            >
              Parse paste
            </Button>
            <Field label="Supplier">
              <Select value={billSupplierId} onChange={(e) => setBillSupplierId(e.target.value)}>
                <option value="">Select</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="grid-2">
              <Field label="Bill no.">
                <Input value={billNo} onChange={(e) => setBillNo(e.target.value)} />
              </Field>
              <Field label="Date">
                <Input type="date" value={billDate} onChange={(e) => setBillDate(e.target.value)} />
              </Field>
            </div>
            <Field label="Amount">
              <Input type="number" value={billAmount} onChange={(e) => setBillAmount(e.target.value)} />
            </Field>
            <FileUpload label="Attachment (optional)" value={billFile} onChange={setBillFile} />
            <Button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const res = await createPurchaseBill({
                    actor: user,
                    stockist: business,
                    supplierId: billSupplierId,
                    billNo,
                    date: billDate,
                    amount: Number(billAmount),
                    fileId: billFile,
                  });
                  pushToast(res.ok ? { tone: 'success', title: 'Bill saved' } : { tone: 'error', title: res.message });
                })
              }
            >
              Save bill
            </Button>
          </div>
          {bills.map((b) => (
            <div key={b.id} className="card card-pad row" style={{ justifyContent: 'space-between' }}>
              <div>
                <strong>{b.billNo}</strong>
                <div className="muted" style={{ fontSize: 12 }}>
                  {supplierName(b.supplierId)} · {b.date}
                </div>
              </div>
              <Money value={b.amount} />
            </div>
          ))}
        </div>
      )}

      {tab === 'Returns' && (
        <div className="stack">
          <div className="card card-pad stack">
            <strong>Supplier return (draft)</strong>
            <Field label="Supplier">
              <Select value={retSupplierId} onChange={(e) => setRetSupplierId(e.target.value)}>
                <option value="">Select</option>
                {suppliers.filter((s) => s.active).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Batch">
              <Select value={retBatchId} onChange={(e) => setRetBatchId(e.target.value)}>
                <option value="">Select</option>
                {batches
                  .filter((b) => b.onHand - b.reserved > 0)
                  .map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.batchNumber} (avail {b.onHand - b.reserved})
                    </option>
                  ))}
              </Select>
            </Field>
            <Field label="Qty">
              <Input type="number" value={retQty} onChange={(e) => setRetQty(e.target.value)} />
            </Field>
            <Field label="Reason">
              <Input value={retReason} onChange={(e) => setRetReason(e.target.value)} />
            </Field>
            <Button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const res = await createSupplierReturn({
                    actor: user,
                    stockist: business,
                    supplierId: retSupplierId,
                    lines: [{ batchId: retBatchId, qty: Number(retQty), reason: retReason }],
                  });
                  pushToast(res.ok ? { tone: 'success', title: res.data.retNo } : { tone: 'error', title: res.message });
                })
              }
            >
              Create draft
            </Button>
          </div>
          {returns.map((r) => (
            <div key={r.id} className="card card-pad stack">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <strong>{r.retNo}</strong>
                <StatusBadge status={r.status} />
              </div>
              {r.status === 'Draft' ? (
                <Button
                  size="sm"
                  onClick={() =>
                    void run(async () => {
                      const res = await sendSupplierReturn({ actor: user, stockist: business, id: r.id });
                      pushToast(
                        res.ok ? { tone: 'success', title: 'Sent (stock decremented)' } : { tone: 'error', title: res.message },
                      );
                    })
                  }
                >
                  Send (decrement stock)
                </Button>
              ) : null}
              {r.status === 'Sent' ? (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    void run(async () => {
                      const note = window.prompt('Settlement note') ?? '';
                      const res = await settleSupplierReturn({
                        actor: user,
                        stockist: business,
                        id: r.id,
                        settledNote: note,
                      });
                      pushToast(res.ok ? { tone: 'success', title: 'Settled' } : { tone: 'error', title: res.message });
                    })
                  }
                >
                  Settle
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {tab === 'Required' && (
        <div className="stack">
          <Button size="sm" variant="secondary" onClick={() => void listRequiredStock(business.id).then(setRequired)}>
            Refresh
          </Button>
          {!required.length ? (
            <EmptyState title="Nothing below reorder level" description="Set reorderLevel on products to drive this view." />
          ) : (
            required.map((r) => (
              <div key={r.productId} className="card card-pad row" style={{ justifyContent: 'space-between' }}>
                <div>
                  <strong>{r.name}</strong>
                  <div className="muted" style={{ fontSize: 12 }}>
                    On hand {r.onHand} · reorder {r.reorderLevel} · suggest {r.suggestedQty}
                  </div>
                </div>
                <Button
                  size="sm"
                  disabled={!suppliers.some((s) => s.active)}
                  onClick={() =>
                    void run(async () => {
                      const supplier = suppliers.find((s) => s.active);
                      if (!supplier) return;
                      const res = await createPurchaseOrder({
                        actor: user,
                        stockist: business,
                        supplierId: supplier.id,
                        lines: [{ productId: r.productId, qty: r.suggestedQty, expectedCost: 0 }],
                      });
                      pushToast(
                        res.ok
                          ? { tone: 'success', title: `Draft ${res.data.poNo}` }
                          : { tone: 'error', title: res.message },
                      );
                    })
                  }
                >
                  Draft PO
                </Button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
