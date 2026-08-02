import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../data/db';
import { formatINR } from '../../../domain/utils/money';
import { parseNumberInput } from '../../../domain/utils/validation';
import { inviteManagedPharmacy, updateManagedPharmacy } from '../../../services/managedPharmacyService';
import { useUi } from '../../../store/ui';
import { useBusyAction } from '../../../ui/hooks/useBusyAction';
import { Button, EmptyState, Field, Input, PageHeader, StatusBadge, Textarea } from '../../../ui/components/primitives';
import { useBiz } from './useBiz';

export function StockistManagedPharmacyDetail() {
  const { managedId } = useParams();
  const { business, user } = useBiz();
  const { pushToast } = useUi();
  const { busy, run } = useBusyAction();
  const managed = useLiveQuery(() => (managedId ? db.managedPharmacies.get(managedId) : undefined), [managedId]);
  const settings = useLiveQuery(() => db.platformSettings.get('platform'));
  const orders =
    useLiveQuery(
      () => (managedId ? db.orders.where('stockistId').equals(business.id).filter((o) => o.managedPharmacyId === managedId).toArray() : []),
      [business.id, managedId],
    ) ?? [];
  const [note, setNote] = useState('');
  const [creditLimit, setCreditLimit] = useState('');
  const [limitError, setLimitError] = useState<string | undefined>();
  const [shareText, setShareText] = useState('');
  const [hydratedId, setHydratedId] = useState<string | null>(null);

  useEffect(() => {
    if (!managed) return;
    if (hydratedId === managed.id) return;
    setNote(managed.note ?? '');
    setCreditLimit(managed.creditLimit != null ? String(managed.creditLimit) : '');
    setHydratedId(managed.id);
  }, [managed, hydratedId]);

  if (!managed || managed.stockistId !== business.id) {
    return (
      <EmptyState
        title="Pharmacy not found"
        description="This managed pharmacy is missing or belongs to another stockist."
        action={
          <Link className="btn btn-primary" to="/stockist/pharmacies">
            Back
          </Link>
        }
      />
    );
  }

  const flatPerLine = settings?.offlineManagedFlatPerLine ?? 1;

  return (
    <div className="stack">
      <PageHeader
        title={managed.name}
        subtitle={`${managed.phone}${managed.city ? ` · ${managed.city}` : ''}`}
        actions={<StatusBadge status={managed.status} />}
      />
      <div className="card card-pad stack">
        <div className="muted" style={{ fontSize: 13 }}>
          GST {managed.gst ?? '—'} · DL {managed.drugLicense ?? '—'}
        </div>
        <div className="muted" style={{ fontSize: 13 }}>
          {managed.address ?? 'No address'} {managed.pincode ?? ''}
        </div>
        <div className="row">
          <Link className="btn btn-primary btn-sm" to={`/stockist/manual-order?managed=${managed.id}`}>
            Manual order
          </Link>
          {managed.linkedBusinessId ? (
            <Link className="btn btn-secondary btn-sm" to={`/stockist/pharmacies/${managed.linkedBusinessId}`}>
              Linked platform pharmacy
            </Link>
          ) : null}
          {managed.status !== 'Linked' ? (
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const res = await inviteManagedPharmacy({ actor: user, stockist: business, id: managed.id });
                  if (!res.ok) {
                    pushToast({ tone: 'error', title: res.message });
                    return;
                  }
                  setShareText(res.data.shareText ?? '');
                  pushToast({ tone: 'success', title: 'Invite ready' });
                })
              }
            >
              Invite to DigiSwasthya
            </Button>
          ) : null}
        </div>
      </div>
      {shareText ? (
        <div className="card card-pad stack">
          <strong>Share invite</strong>
          <Textarea value={shareText} readOnly rows={4} />
        </div>
      ) : null}
      <div className="card card-pad stack">
        <strong>Credit & notes</strong>
        <Field label="Credit limit (₹)" error={limitError} hint="Leave blank for no limit">
          <Input
            value={creditLimit}
            onChange={(e) => {
              setCreditLimit(e.target.value);
              setLimitError(undefined);
            }}
            inputMode="decimal"
            placeholder="No limit"
          />
        </Field>
        <Field label="Internal note" hint="Clear the field and save to remove the note">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
        </Field>
        <Button
          size="sm"
          variant="secondary"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              let nextLimit: number | undefined;
              if (creditLimit.trim()) {
                const parsed = parseNumberInput(creditLimit);
                if (parsed.status !== 'ok' || parsed.value <= 0) {
                  setLimitError('Enter a limit greater than zero, or leave blank');
                  return;
                }
                nextLimit = parsed.value;
              } else {
                nextLimit = undefined;
              }
              const res = await updateManagedPharmacy({
                actor: user,
                stockist: business,
                id: managed.id,
                patch: { note: note.trim() ? note.trim() : undefined, creditLimit: nextLimit },
              });
              pushToast(res.ok ? { tone: 'success', title: 'Saved' } : { tone: 'error', title: res.message });
            })
          }
        >
          Save
        </Button>
      </div>
      <div className="card card-pad stack">
        <strong>Orders ({orders.length})</strong>
        {!orders.length ? (
          <div className="muted">No orders yet for this managed pharmacy.</div>
        ) : (
          orders.map((o) => (
            <Link key={o.id} to={`/stockist/orders/${o.orderNo}`} className="row" style={{ justifyContent: 'space-between' }}>
              <span>{o.orderNo}</span>
              <span>{formatINR(o.grandTotal)}</span>
              <StatusBadge status={o.status} />
            </Link>
          ))
        )}
      </div>
      <div className="muted" style={{ fontSize: 13 }}>
        Offline trade uses {formatINR(flatPerLine)}/line commission (platform Generic/Ethical schedule does not apply until
        Linked + Active).
      </div>
    </div>
  );
}
