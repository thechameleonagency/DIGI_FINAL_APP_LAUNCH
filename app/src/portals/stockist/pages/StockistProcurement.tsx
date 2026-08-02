import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../data/db';
import { localTodayKey } from '../../../domain/utils/dateKeys';
import { pluralize } from '../../../domain/utils/pluralize';
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
import { ConfirmDialog } from '../../../ui/components/ConfirmDialog';
import { FileUpload } from '../../../ui/components/FileUpload';
import {
  Button,
  EmptyState,
  Field,
  Input,
  Modal,
  Money,
  PageHeader,
  Select,
  StatusBadge,
  Tabs,
  Textarea,
} from '../../../ui/components/primitives';
import { useBiz } from './useBiz';

type Tab = 'Suppliers' | 'POs' | 'Receive' | 'Bills' | 'Returns' | 'Required';
type PoLineDraft = { productId: string; qty: string; expectedCost: string };
type RecvLineDraft = { productId: string; qty: string; batchNumber: string; expiryDate: string };

const OPEN_PO_STATUSES = ['Draft', 'Sent', 'PartiallyReceived'] as const;

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
  const [poLines, setPoLines] = useState<PoLineDraft[]>([]);

  const [recvPoId, setRecvPoId] = useState('');
  const [recvProductId, setRecvProductId] = useState('');
  const [recvQty, setRecvQty] = useState('');
  const [recvBatch, setRecvBatch] = useState('');
  const [recvExpiry, setRecvExpiry] = useState('');
  const [recvLines, setRecvLines] = useState<RecvLineDraft[]>([]);
  const [confirmOver, setConfirmOver] = useState(false);

  const [billSupplierId, setBillSupplierId] = useState('');
  const [billNo, setBillNo] = useState('');
  const [billDate, setBillDate] = useState(() => localTodayKey());
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

  const [supplierModalOpen, setSupplierModalOpen] = useState(false);
  const [poModalOpen, setPoModalOpen] = useState(false);
  const [receiveModalOpen, setReceiveModalOpen] = useState(false);
  const [billModalOpen, setBillModalOpen] = useState(false);
  const [returnModalOpen, setReturnModalOpen] = useState(false);

  const [settleId, setSettleId] = useState<string | null>(null);
  const [removeSupplierId, setRemoveSupplierId] = useState<string | null>(null);
  const [sendReturnId, setSendReturnId] = useState<string | null>(null);

  const openPoModal = (prefill?: { productId: string; qty: string; supplierId?: string }) => {
    if (prefill) {
      setPoSupplierId(prefill.supplierId ?? '');
      setPoProductId(prefill.productId);
      setPoQty(prefill.qty);
      setPoCost('0');
      setPoLines([{ productId: prefill.productId, qty: prefill.qty, expectedCost: '0' }]);
    } else {
      setPoSupplierId('');
      setPoProductId('');
      setPoQty('10');
      setPoCost('0');
      setPoLines([]);
    }
    setTab('POs');
    setPoModalOpen(true);
  };

  const openReceiveModal = (poId?: string) => {
    if (poId) setRecvPoId(poId);
    setRecvProductId('');
    setRecvQty('');
    setRecvBatch('');
    setRecvExpiry('');
    setRecvLines([]);
    setConfirmOver(false);
    setReceiveModalOpen(true);
  };

  const openBillModal = () => {
    setBillSupplierId('');
    setBillNo('');
    setBillDate(localTodayKey());
    setBillAmount('');
    setBillFile(undefined);
    setBillPaste('');
    setBillModalOpen(true);
  };

  const openReturnModal = () => {
    setRetSupplierId('');
    setRetBatchId('');
    setRetQty('');
    setRetReason('');
    setReturnModalOpen(true);
  };

  const openSupplierModal = () => {
    setSupName('');
    setSupContact('');
    setSupGst('');
    setSupplierModalOpen(true);
  };

  const openRecvPos = useMemo(
    () => pos.filter((p) => p.status === 'Sent' || p.status === 'PartiallyReceived'),
    [pos],
  );
  const recvPo = openRecvPos.find((p) => p.id === recvPoId);
  const supplierName = (id: string) => suppliers.find((s) => s.id === id)?.name ?? id.slice(0, 6);
  const productName = (id: string) => products.find((p) => p.id === id)?.name ?? id.slice(0, 6);

  const openPoCountForSupplier = (supplierId: string) =>
    pos.filter((p) => p.supplierId === supplierId && OPEN_PO_STATUSES.includes(p.status as (typeof OPEN_PO_STATUSES)[number]))
      .length;

  const removeSupplierTarget = removeSupplierId ? suppliers.find((s) => s.id === removeSupplierId) : undefined;
  const removeSupplierOpenPoCount = removeSupplierId ? openPoCountForSupplier(removeSupplierId) : 0;

  const sendReturnTarget = sendReturnId ? returns.find((r) => r.id === sendReturnId) : undefined;
  const sendReturnQty = sendReturnTarget?.lines.reduce((sum, l) => sum + l.qty, 0) ?? 0;

  return (
    <div className="stack">
      <PageHeader title="Procurement" subtitle="Suppliers, POs, receiving, bills & manufacturer returns" />
      <Tabs
        ariaLabel="Procurement"
        value={tab}
        onChange={(t) => {
          setTab(t);
          if (t === 'Required') void listRequiredStock(business.id).then(setRequired);
        }}
        items={(['Suppliers', 'POs', 'Receive', 'Bills', 'Returns', 'Required'] as Tab[]).map((t) => ({
          id: t,
          label: t,
        }))}
      />

      {tab === 'Suppliers' && (
        <div className="stack">
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <Button size="sm" onClick={openSupplierModal}>
              Add supplier
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
                  onClick={() => setRemoveSupplierId(s.id)}
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
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <Button size="sm" onClick={() => openPoModal()}>
              New draft PO
            </Button>
          </div>
          {!pos.length ? (
            <EmptyState title="No purchase orders" description="Create a draft PO against an active supplier." />
          ) : (
            pos.map((po) => (
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
            ))
          )}
        </div>
      )}

      {tab === 'Receive' && (
        <div className="stack">
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <Button size="sm" disabled={!openRecvPos.length} onClick={() => openReceiveModal()}>
              Record receipt
            </Button>
          </div>
          {!openRecvPos.length ? (
            <EmptyState title="Nothing to receive" description="Send a PO first, then receive against it." />
          ) : (
            openRecvPos.map((p) => (
              <div key={p.id} className="card card-pad row" style={{ justifyContent: 'space-between' }}>
                <div>
                  <strong>{p.poNo}</strong>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {supplierName(p.supplierId)} · {p.status}
                  </div>
                </div>
                <Button size="sm" variant="secondary" onClick={() => openReceiveModal(p.id)}>
                  Receive
                </Button>
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'Bills' && (
        <div className="stack">
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <Button size="sm" onClick={openBillModal}>
              Add bill
            </Button>
          </div>
          {!bills.length ? (
            <EmptyState title="No bills" description="Record supplier purchase bills for reconciliation." />
          ) : (
            bills.map((b) => (
              <div key={b.id} className="card card-pad row" style={{ justifyContent: 'space-between' }}>
                <div>
                  <strong>{b.billNo}</strong>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {supplierName(b.supplierId)} · {b.date}
                  </div>
                </div>
                <Money value={b.amount} />
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'Returns' && (
        <div className="stack">
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <Button size="sm" onClick={openReturnModal}>
              New supplier return
            </Button>
          </div>
          {!returns.length ? (
            <EmptyState title="No returns" description="Draft a return to send stock back to a supplier." />
          ) : (
            returns.map((r) => (
              <div key={r.id} className="card card-pad stack">
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <strong>{r.retNo}</strong>
                  <StatusBadge status={r.status} />
                </div>
                {r.status === 'Draft' ? (
                  <Button size="sm" onClick={() => setSendReturnId(r.id)}>
                    Send (decrement stock)
                  </Button>
                ) : null}
                {r.status === 'Sent' ? (
                  <Button size="sm" variant="secondary" onClick={() => setSettleId(r.id)}>
                    Settle
                  </Button>
                ) : null}
              </div>
            ))
          )}
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
                    openPoModal({
                      productId: r.productId,
                      qty: String(r.suggestedQty),
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

      <Modal
        open={supplierModalOpen}
        title="Add supplier"
        onClose={() => setSupplierModalOpen(false)}
        footer={
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setSupplierModalOpen(false)}>
              Cancel
            </Button>
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
                    setSupplierModalOpen(false);
                  }
                })
              }
            >
              Save supplier
            </Button>
          </div>
        }
      >
        <div className="stack">
          <Field label="Name">
            <Input value={supName} onChange={(e) => setSupName(e.target.value)} />
          </Field>
          <Field label="Contact">
            <Input value={supContact} onChange={(e) => setSupContact(e.target.value)} />
          </Field>
          <Field label="GST (optional)">
            <Input value={supGst} onChange={(e) => setSupGst(e.target.value)} />
          </Field>
        </div>
      </Modal>

      <Modal
        open={poModalOpen}
        title="New draft PO"
        onClose={() => setPoModalOpen(false)}
        footer={
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setPoModalOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={busy || !poSupplierId || !poLines.length}
              onClick={() =>
                void run(async () => {
                  const res = await createPurchaseOrder({
                    actor: user,
                    stockist: business,
                    supplierId: poSupplierId,
                    lines: poLines.map((l) => ({
                      productId: l.productId,
                      qty: Number(l.qty),
                      expectedCost: Number(l.expectedCost),
                    })),
                  });
                  pushToast(res.ok ? { tone: 'success', title: res.data.poNo } : { tone: 'error', title: res.message });
                  if (res.ok) setPoModalOpen(false);
                })
              }
            >
              Create draft
            </Button>
          </div>
        }
      >
        <div className="stack">
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
          {!poSupplierId ? (
            <p className="muted" style={{ fontSize: 12, margin: 0 }}>
              Choose a supplier before creating the draft PO.
            </p>
          ) : null}
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
            size="sm"
            variant="secondary"
            onClick={() => {
              if (!poProductId || !poQty) {
                pushToast({ tone: 'error', title: 'Select product and qty' });
                return;
              }
              setPoLines([...poLines, { productId: poProductId, qty: poQty, expectedCost: poCost }]);
              setPoProductId('');
              setPoQty('10');
              setPoCost('0');
            }}
          >
            Add line
          </Button>
          {poLines.length ? (
            <div className="stack" style={{ gap: 6 }}>
              <div className="muted" style={{ fontSize: 12 }}>
                Staged lines ({poLines.length})
              </div>
              {poLines.map((line, idx) => (
                <div key={`${line.productId}-${idx}`} className="card card-pad row" style={{ justifyContent: 'space-between' }}>
                  <div style={{ fontSize: 13 }}>
                    <strong>{productName(line.productId)}</strong>
                    <div className="muted" style={{ fontSize: 12 }}>
                      Qty {line.qty} · cost {line.expectedCost}
                    </div>
                  </div>
                  <Button size="sm" variant="danger" onClick={() => setPoLines(poLines.filter((_, i) => i !== idx))}>
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted" style={{ fontSize: 12, margin: 0 }}>
              Add at least one line to create the draft PO.
            </p>
          )}
        </div>
      </Modal>

      <Modal
        open={receiveModalOpen}
        title="Record receipt"
        onClose={() => setReceiveModalOpen(false)}
        footer={
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setReceiveModalOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={busy || !recvPo || !recvLines.length}
              onClick={() =>
                void run(async () => {
                  const res = await receivePurchaseOrder({
                    actor: user,
                    stockist: business,
                    poId: recvPoId,
                    confirmOverReceipt: confirmOver,
                    lines: recvLines.map((l) => ({
                      productId: l.productId,
                      qty: Number(l.qty),
                      batchNumber: l.batchNumber,
                      expiryDate: l.expiryDate,
                    })),
                  });
                  pushToast(
                    res.ok
                      ? { tone: 'success', title: `Received → ${res.data.status}` }
                      : { tone: 'error', title: res.message },
                  );
                  if (res.ok) setReceiveModalOpen(false);
                })
              }
            >
              Record receipt
            </Button>
          </div>
        }
      >
        <div className="stack">
          <Field label="Open PO">
            <Select
              value={recvPoId}
              onChange={(e) => {
                setRecvPoId(e.target.value);
                setRecvProductId('');
                setRecvLines([]);
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
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  if (!recvProductId || !recvQty || !recvBatch || !recvExpiry) {
                    pushToast({ tone: 'error', title: 'Fill product, qty, batch, and expiry' });
                    return;
                  }
                  setRecvLines([
                    ...recvLines,
                    {
                      productId: recvProductId,
                      qty: recvQty,
                      batchNumber: recvBatch,
                      expiryDate: recvExpiry,
                    },
                  ]);
                  setRecvProductId('');
                  setRecvQty('');
                  setRecvBatch('');
                  setRecvExpiry('');
                }}
              >
                Add line
              </Button>
              {recvLines.length ? (
                <div className="stack" style={{ gap: 6 }}>
                  <div className="muted" style={{ fontSize: 12 }}>
                    Staged lines ({recvLines.length})
                  </div>
                  {recvLines.map((line, idx) => (
                    <div key={`${line.productId}-${line.batchNumber}-${idx}`} className="card card-pad row" style={{ justifyContent: 'space-between' }}>
                      <div style={{ fontSize: 13 }}>
                        <strong>{productName(line.productId)}</strong>
                        <div className="muted" style={{ fontSize: 12 }}>
                          Qty {line.qty} · batch {line.batchNumber} · exp {line.expiryDate}
                        </div>
                      </div>
                      <Button size="sm" variant="danger" onClick={() => setRecvLines(recvLines.filter((_, i) => i !== idx))}>
                        Remove
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted" style={{ fontSize: 12, margin: 0 }}>
                  Add at least one line to record the receipt.
                </p>
              )}
              <label className="row" style={{ fontSize: 13 }}>
                <input type="checkbox" checked={confirmOver} onChange={(e) => setConfirmOver(e.target.checked)} />
                Confirm over-receipt if qty exceeds ordered
              </label>
            </>
          ) : (
            <p className="muted">Select an open PO to receive against.</p>
          )}
        </div>
      </Modal>

      <Modal
        open={billModalOpen}
        title="Purchase bill"
        onClose={() => setBillModalOpen(false)}
        footer={
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setBillModalOpen(false)}>
              Cancel
            </Button>
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
                  if (res.ok) setBillModalOpen(false);
                })
              }
            >
              Save bill
            </Button>
          </div>
        }
      >
        <div className="stack">
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
                message: `${pluralize(parsed.lines.length, 'line')}${parsed.billNo ? `, bill ${parsed.billNo}` : ''}`,
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
        </div>
      </Modal>

      <Modal
        open={returnModalOpen}
        title="Supplier return (draft)"
        onClose={() => setReturnModalOpen(false)}
        footer={
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setReturnModalOpen(false)}>
              Cancel
            </Button>
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
                  if (res.ok) setReturnModalOpen(false);
                })
              }
            >
              Create draft
            </Button>
          </div>
        }
      >
        <div className="stack">
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
        </div>
      </Modal>

      <ConfirmDialog
        open={!!settleId}
        title="Settle supplier return?"
        requireReason
        reasonLabel="Settlement note"
        reasonPlaceholder="Required settlement note"
        confirmLabel="Settle"
        onClose={() => setSettleId(null)}
        onConfirm={async (note) => {
          if (!settleId || !note) return;
          const res = await settleSupplierReturn({
            actor: user,
            stockist: business,
            id: settleId,
            settledNote: note,
          });
          pushToast(res.ok ? { tone: 'success', title: 'Settled' } : { tone: 'error', title: res.message });
          if (res.ok) setSettleId(null);
        }}
      />

      <ConfirmDialog
        open={!!removeSupplierId}
        title="Remove supplier?"
        tone="danger"
        confirmLabel="Remove"
        body={
          removeSupplierTarget ? (
            <p>
              <strong>{removeSupplierTarget.name}</strong>{' '}
              {removeSupplierOpenPoCount > 0
                ? `has ${removeSupplierOpenPoCount} open PO${removeSupplierOpenPoCount === 1 ? '' : 's'} — will be deactivated.`
                : 'will be permanently deleted.'}
            </p>
          ) : null
        }
        onClose={() => setRemoveSupplierId(null)}
        onConfirm={async () => {
          if (!removeSupplierId) return;
          const res = await deleteOrDeactivateSupplier({ actor: user, stockist: business, id: removeSupplierId });
          pushToast(
            res.ok
              ? { tone: 'info', title: res.data === true ? 'Deleted' : 'Deactivated (open POs)' }
              : { tone: 'error', title: res.message },
          );
          if (res.ok) setRemoveSupplierId(null);
        }}
      />

      <ConfirmDialog
        open={!!sendReturnId}
        title="Send supplier return?"
        tone="danger"
        confirmLabel="Send (decrement stock)"
        body={
          sendReturnTarget ? (
            <p>
              Send return <strong>{sendReturnTarget.retNo}</strong> with total qty <strong>{sendReturnQty}</strong>?
              Stock will be decremented for each batch line.
            </p>
          ) : null
        }
        onClose={() => setSendReturnId(null)}
        onConfirm={async () => {
          if (!sendReturnId) return;
          const res = await sendSupplierReturn({ actor: user, stockist: business, id: sendReturnId });
          pushToast(
            res.ok ? { tone: 'success', title: 'Sent (stock decremented)' } : { tone: 'error', title: res.message },
          );
          if (res.ok) setSendReturnId(null);
        }}
      />
    </div>
  );
}
