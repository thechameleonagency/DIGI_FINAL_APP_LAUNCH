import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../data/db';
import { pairOutstanding } from '../../../domain/calc';
import { formatINR } from '../../../domain/utils/money';
import { parseNumberInput } from '../../../domain/utils/validation';
import {
  blockConnection,
  disconnectConnection,
  respondConnection,
  unblockConnection,
} from '../../../services/connectionService';
import { useUi } from '../../../store/ui';
import { ConfirmDialog } from '../../../ui/components/ConfirmDialog';
import { Button, EmptyState, Field, Input, Modal, PageHeader, StatusBadge } from '../../../ui/components/primitives';
import { useBiz } from './useBiz';

export function StockistConnections() {
  const { business, user } = useBiz();
  const { pushToast } = useUi();
  const connections = useLiveQuery(() => db.connections.where('stockistId').equals(business.id).toArray(), [business.id]) ?? [];
  const pharmacies = useLiveQuery(() => db.businesses.where('type').equals('Pharmacy').toArray()) ?? [];
  const invoices = useLiveQuery(() => db.invoices.where('stockistId').equals(business.id).toArray(), [business.id]) ?? [];
  const [tab, setTab] = useState('Requested');
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [blockId, setBlockId] = useState<string | null>(null);
  const [disconnectId, setDisconnectId] = useState<string | null>(null);
  const [approveId, setApproveId] = useState<string | null>(null);
  const [creditDays, setCreditDays] = useState('30');
  const [creditLimit, setCreditLimit] = useState('100000');
  const [creditErrors, setCreditErrors] = useState<{ days?: string; limit?: string }>({});

  const filtered = tab === 'All' ? connections : connections.filter((c) => c.status === tab);
  const approveTarget = approveId ? connections.find((c) => c.id === approveId) : undefined;
  const approvePharmacy = approveTarget ? pharmacies.find((p) => p.id === approveTarget.pharmacyId) : undefined;

  return (
    <div className="stack">
      <PageHeader title="Pharmacies" subtitle="Connection requests and active partners" />
      <ConfirmDialog
        open={!!rejectId}
        title="Reject connection"
        body="Tell the pharmacy why this request was declined."
        requireReason
        tone="danger"
        confirmLabel="Reject request"
        onClose={() => setRejectId(null)}
        onConfirm={async (reason) => {
          const res = await respondConnection({
            actor: user,
            stockist: business,
            connectionId: rejectId!,
            decision: 'Rejected',
            reason: reason!,
          });
          pushToast(res.ok ? { tone: 'info', title: 'Rejected' } : { tone: 'error', title: res.message });
          setRejectId(null);
        }}
      />
      <ConfirmDialog
        open={!!blockId}
        title="Block connection"
        body="Blocked partners cannot place new orders."
        requireReason
        tone="danger"
        confirmLabel="Block"
        onClose={() => setBlockId(null)}
        onConfirm={async (reason) => {
          const res = await blockConnection({
            actor: user,
            stockist: business,
            connectionId: blockId!,
            reason: reason!,
          });
          pushToast(res.ok ? { tone: 'warning', title: 'Connection blocked' } : { tone: 'error', title: res.message });
          setBlockId(null);
        }}
      />
      <ConfirmDialog
        open={!!disconnectId}
        title="Disconnect pharmacy"
        body="Disconnect ends the active trading relationship."
        requireReason
        tone="danger"
        confirmLabel="Disconnect"
        onClose={() => setDisconnectId(null)}
        onConfirm={async (reason) => {
          const res = await disconnectConnection({
            actor: user,
            business,
            connectionId: disconnectId!,
            reason: reason!,
          });
          pushToast(res.ok ? { tone: 'info', title: 'Disconnected' } : { tone: 'error', title: res.message });
          setDisconnectId(null);
        }}
      />
      <Modal
        open={!!approveId}
        title="Approve connection"
        onClose={() => {
          setApproveId(null);
          setCreditErrors({});
        }}
        footer={
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <Button
              variant="secondary"
              onClick={() => {
                setApproveId(null);
                setCreditErrors({});
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={async () => {
                const daysParsed = parseNumberInput(creditDays);
                const limitParsed = parseNumberInput(creditLimit);
                const next: typeof creditErrors = {};
                if (daysParsed.status === 'empty') next.days = 'Credit days are required';
                else if (
                  daysParsed.status === 'invalid' ||
                  !Number.isInteger(daysParsed.value) ||
                  daysParsed.value < 0
                ) {
                  next.days = 'Enter a whole number of days (0 or more)';
                }
                if (limitParsed.status === 'empty') next.limit = 'Credit limit is required';
                else if (limitParsed.status === 'invalid' || limitParsed.value <= 0) {
                  next.limit = 'Enter a credit limit greater than zero';
                }
                if (Object.keys(next).length || daysParsed.status !== 'ok' || limitParsed.status !== 'ok') {
                  setCreditErrors(next);
                  return;
                }
                const res = await respondConnection({
                  actor: user,
                  stockist: business,
                  connectionId: approveId!,
                  decision: 'Active',
                  creditDays: daysParsed.value,
                  creditLimit: limitParsed.value,
                });
                pushToast(res.ok ? { tone: 'success', title: 'Connection approved' } : { tone: 'error', title: res.message });
                if (res.ok) {
                  setApproveId(null);
                  setCreditErrors({});
                }
              }}
            >
              Approve & add
            </Button>
          </div>
        }
      >
        <div className="stack" style={{ fontSize: 13 }}>
          <div>
            <strong>{approvePharmacy?.name}</strong>
            <div className="muted">
              GST {approvePharmacy?.gstNumber ?? '—'} · DL {approvePharmacy?.drugLicenseNumber ?? '—'}
            </div>
            <div className="muted">
              {approvePharmacy?.address}, {approvePharmacy?.city} {approvePharmacy?.pincode}
            </div>
            <div className="muted">
              {approvePharmacy?.phone} · {approvePharmacy?.email}
            </div>
          </div>
          <Field label="Credit days" error={creditErrors.days}>
            <Input
              type="number"
              min={0}
              value={creditDays}
              onChange={(e) => {
                setCreditDays(e.target.value);
                setCreditErrors((err) => ({ ...err, days: undefined }));
              }}
            />
          </Field>
          <Field label="Credit limit (₹)" error={creditErrors.limit}>
            <Input
              type="number"
              min={1}
              value={creditLimit}
              onChange={(e) => {
                setCreditLimit(e.target.value);
                setCreditErrors((err) => ({ ...err, limit: undefined }));
              }}
            />
          </Field>
        </div>
      </Modal>

      <div className="row">
        {['Requested', 'Active', 'Blocked', 'Rejected', 'Disconnected', 'All'].map((t) => (
          <Button key={t} size="sm" variant={tab === t ? 'primary' : 'secondary'} onClick={() => setTab(t)}>
            {t}
          </Button>
        ))}
      </div>
      {!filtered.length ? (
        <EmptyState
          title={`No ${tab === 'All' ? 'pharmacies' : tab.toLowerCase()} connections`}
          description="Pharmacy connection requests appear here. Share your profile so pharmacies can find you."
          action={
            <Link className="btn btn-primary" to="/stockist">
              Back to home
            </Link>
          }
        />
      ) : (
        filtered.map((c) => {
          const p = pharmacies.find((x) => x.id === c.pharmacyId);
          const outstanding = pairOutstanding(invoices, c.pharmacyId, business.id);
          return (
            <div key={c.id} className="card card-pad row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <strong>
                  <Link to={`/stockist/pharmacies/${c.pharmacyId}`}>{p?.name ?? 'Pharmacy'}</Link>
                </strong>
                <div className="muted" style={{ fontSize: 12 }}>
                  {p?.city} · GST {p?.gstNumber} · DL {p?.drugLicenseNumber}
                </div>
                {c.status === 'Active' || c.status === 'Blocked' ? (
                  <div style={{ fontSize: 12, marginTop: 4 }}>
                    Outstanding {formatINR(outstanding)}
                    {c.creditLimit != null ? ` · Limit ${formatINR(c.creditLimit)}` : ''}
                    {c.creditDays != null ? ` · ${c.creditDays}d` : ''}
                  </div>
                ) : null}
              </div>
              <div className="row" style={{ flexWrap: 'wrap' }}>
                <StatusBadge status={c.status} />
                {c.status === 'Requested' ? (
                  <>
                    <Button
                      size="sm"
                      onClick={() => {
                        setApproveId(c.id);
                        setCreditDays(String(c.creditDays ?? 30));
                        setCreditLimit(String(c.creditLimit ?? 100000));
                      }}
                    >
                      Review / Approve
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => setRejectId(c.id)}>
                      Reject
                    </Button>
                  </>
                ) : null}
                {c.status === 'Active' ? (
                  <>
                    <Button size="sm" variant="secondary" onClick={() => setBlockId(c.id)}>
                      Block
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => setDisconnectId(c.id)}>
                      Disconnect
                    </Button>
                  </>
                ) : null}
                {c.status === 'Blocked' ? (
                  <Button
                    size="sm"
                    onClick={async () => {
                      const res = await unblockConnection({ actor: user, stockist: business, connectionId: c.id });
                      pushToast(res.ok ? { tone: 'success', title: 'Unblocked' } : { tone: 'error', title: res.message });
                    }}
                  >
                    Unblock
                  </Button>
                ) : null}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
