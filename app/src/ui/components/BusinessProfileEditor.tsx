import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { INDIAN_STATES, PHARMACY_TYPES } from '../../content/indiaRegions';
import { db } from '../../data/db';
import type { Business, User } from '../../domain/entities/types';
import { isPin } from '../../domain/utils/validation';
import { addBusinessDocument, updateBusiness } from '../../services/businessService';
import { useSession } from '../../store/session';
import { useUi } from '../../store/ui';
import { FileLink } from './FileUpload';
import { Button, Field, Input, PageHeader, Select, StatusBadge } from './primitives';

export function BusinessProfileEditor({
  actor,
  business,
}: {
  actor: User;
  business: Business;
}) {
  const { refreshEntities, user } = useSession();
  const { pushToast } = useUi();
  const locked = business.verificationStatus === 'Approved';
  const isStockist = business.type === 'Stockist';
  const verification = useLiveQuery(
    () => db.verifications.where('businessId').equals(business.id).reverse().sortBy('updatedAt'),
    [business.id],
  )?.[0];

  const [form, setForm] = useState({
    name: business.name,
    legalName: business.legalName ?? '',
    pharmacyType: business.pharmacyType ?? 'Retail',
    panNumber: business.panNumber ?? '',
    phone: business.phone,
    email: business.email,
    city: business.city,
    state: business.state,
    pincode: business.pincode,
    address: business.address,
    gstNumber: business.gstNumber ?? '',
    drugLicenseNumber: business.drugLicenseNumber ?? '',
    upiId: business.upiId ?? '',
    bankAccountNumber: business.bankAccountNumber ?? '',
    bankIfsc: business.bankIfsc ?? '',
    bankName: business.bankName ?? '',
    accountHolderName: business.accountHolderName ?? '',
    servicePins: business.servicePins ?? [],
    holidays: (business.holidays ?? []).join(', '),
    deliverySlots: (business.preferences?.deliverySlots ?? []).join(', '),
    instructions: business.preferences?.instructions ?? '',
    defaultReceiver: business.preferences?.defaultReceiver ?? '',
    deliveryFeeFlat: String(business.preferences?.deliveryFeeFlat ?? ''),
    deliveryFeeFreeAbove: String(business.preferences?.deliveryFeeFreeAbove ?? ''),
    locations: (business.locations ?? []).map((l) => l.name).join(', '),
  });
  const [pinInput, setPinInput] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form, v: string | string[]) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    setForm({
      name: business.name,
      legalName: business.legalName ?? '',
      pharmacyType: business.pharmacyType ?? 'Retail',
      panNumber: business.panNumber ?? '',
      phone: business.phone,
      email: business.email,
      city: business.city,
      state: business.state,
      pincode: business.pincode,
      address: business.address,
      gstNumber: business.gstNumber ?? '',
      drugLicenseNumber: business.drugLicenseNumber ?? '',
      upiId: business.upiId ?? '',
      bankAccountNumber: business.bankAccountNumber ?? '',
      bankIfsc: business.bankIfsc ?? '',
      bankName: business.bankName ?? '',
      accountHolderName: business.accountHolderName ?? '',
      servicePins: business.servicePins ?? [],
      holidays: (business.holidays ?? []).join(', '),
      deliverySlots: (business.preferences?.deliverySlots ?? []).join(', '),
      instructions: business.preferences?.instructions ?? '',
      defaultReceiver: business.preferences?.defaultReceiver ?? '',
      deliveryFeeFlat: String(business.preferences?.deliveryFeeFlat ?? ''),
      deliveryFeeFreeAbove: String(business.preferences?.deliveryFeeFreeAbove ?? ''),
      locations: (business.locations ?? []).map((l) => l.name).join(', '),
    });
  }, [business]);

  const save = async () => {
    setBusy(true);
    const res = await updateBusiness({
      actor,
      business,
      patch: {
        name: form.name,
        legalName: form.legalName,
        pharmacyType: isStockist ? undefined : form.pharmacyType,
        panNumber: form.panNumber,
        phone: form.phone,
        email: form.email,
        city: form.city,
        state: form.state,
        pincode: form.pincode,
        address: form.address,
        gstNumber: form.gstNumber,
        drugLicenseNumber: form.drugLicenseNumber,
        upiId: form.upiId,
        bankAccountNumber: form.bankAccountNumber,
        bankIfsc: form.bankIfsc,
        bankName: form.bankName,
        accountHolderName: form.accountHolderName,
        servicePins: isStockist ? form.servicePins : undefined,
        holidays: form.holidays
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        locations: isStockist
          ? form.locations
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
              .map((name, i) => ({ id: `loc-${i}`, name }))
          : undefined,
        preferences: {
          deliverySlots: form.deliverySlots
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
          instructions: form.instructions.trim() || undefined,
          defaultReceiver: form.defaultReceiver.trim() || undefined,
          deliveryFeeFlat: form.deliveryFeeFlat ? Number(form.deliveryFeeFlat) : undefined,
          deliveryFeeFreeAbove: form.deliveryFeeFreeAbove ? Number(form.deliveryFeeFreeAbove) : undefined,
        },
      },
    });
    setBusy(false);
    if (!res.ok) {
      pushToast({ tone: 'error', title: res.message });
      return;
    }
    if (user) refreshEntities(user, res.data);
    pushToast({ tone: 'success', title: 'Business profile saved' });
  };

  const docs = verification?.documents ?? [];

  return (
    <div className="stack">
      <PageHeader
        title="Business profile"
        subtitle="Workspace brand, identity, bank, preferences"
        actions={
          <div className="row">
            <StatusBadge status={business.verificationStatus} />
            <StatusBadge status={business.accountStatus} />
          </div>
        }
      />

      <div className="card card-pad stack">
        <strong>Workspace brand</strong>
        <Field label="Display name (shown in shell)">
          <Input value={form.name} onChange={(e) => set('name', e.target.value)} />
        </Field>
        <Field label="Legal name (optional)">
          <Input value={form.legalName} onChange={(e) => set('legalName', e.target.value)} />
        </Field>
        {!isStockist ? (
          <Field label="Pharmacy type">
            <Select value={form.pharmacyType} onChange={(e) => set('pharmacyType', e.target.value)}>
              {PHARMACY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
      </div>

      <div className="card card-pad stack">
        <strong>Identity</strong>
        {locked ? (
          <p className="muted" style={{ fontSize: 12, margin: 0 }}>
            GSTIN and drug license are locked after verification approval.
          </p>
        ) : null}
        <Field label="GSTIN">
          <Input value={form.gstNumber} disabled={locked} onChange={(e) => set('gstNumber', e.target.value.toUpperCase())} />
        </Field>
        <Field label="Drug license number">
          <Input value={form.drugLicenseNumber} disabled={locked} onChange={(e) => set('drugLicenseNumber', e.target.value)} />
        </Field>
        <Field label="PAN">
          <Input value={form.panNumber} onChange={(e) => set('panNumber', e.target.value.toUpperCase())} />
        </Field>
        <div className="grid-2">
          <Field label="Phone">
            <Input value={form.phone} onChange={(e) => set('phone', e.target.value)} />
          </Field>
          <Field label="Email">
            <Input value={form.email} onChange={(e) => set('email', e.target.value)} />
          </Field>
        </div>
        <Field label="State">
          <Select value={form.state} onChange={(e) => set('state', e.target.value)}>
            {INDIAN_STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid-2">
          <Field label="City">
            <Input value={form.city} onChange={(e) => set('city', e.target.value)} />
          </Field>
          <Field label="Pincode">
            <Input value={form.pincode} onChange={(e) => set('pincode', e.target.value)} />
          </Field>
        </div>
        <Field label="Address">
          <Input value={form.address} onChange={(e) => set('address', e.target.value)} />
        </Field>
      </div>

      <div className="card card-pad stack">
        <strong>Bank / UPI</strong>
        <Field label="Account holder">
          <Input value={form.accountHolderName} onChange={(e) => set('accountHolderName', e.target.value)} />
        </Field>
        <Field label="Account number">
          <Input value={form.bankAccountNumber} onChange={(e) => set('bankAccountNumber', e.target.value)} />
        </Field>
        <div className="grid-2">
          <Field label="IFSC">
            <Input value={form.bankIfsc} onChange={(e) => set('bankIfsc', e.target.value.toUpperCase())} />
          </Field>
          <Field label="Bank name">
            <Input value={form.bankName} onChange={(e) => set('bankName', e.target.value)} />
          </Field>
        </div>
        <Field label="UPI ID">
          <Input value={form.upiId} onChange={(e) => set('upiId', e.target.value)} />
        </Field>
      </div>

      {isStockist ? (
        <div className="card card-pad stack">
          <strong>Serviceable PINs</strong>
          <div className="row">
            <Input
              placeholder="6-digit PIN"
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              style={{ flex: 1 }}
              aria-label="Add serviceable PIN"
            />
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                if (!isPin(pinInput)) {
                  pushToast({ tone: 'error', title: 'Invalid PIN' });
                  return;
                }
                if (form.servicePins.includes(pinInput.trim())) return;
                set('servicePins', [...form.servicePins, pinInput.trim()]);
                setPinInput('');
              }}
            >
              Add
            </Button>
          </div>
          <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
            {form.servicePins.map((p) => (
              <button
                key={p}
                type="button"
                className="chip"
                onClick={() => set('servicePins', form.servicePins.filter((x) => x !== p))}
              >
                {p} ×
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="card card-pad stack">
        <strong>Preferences</strong>
        <Field label="Delivery slots (comma-separated)">
          <Input value={form.deliverySlots} onChange={(e) => set('deliverySlots', e.target.value)} />
        </Field>
        <Field label="Default receiver">
          <Input value={form.defaultReceiver} onChange={(e) => set('defaultReceiver', e.target.value)} />
        </Field>
        <Field label="Delivery instructions">
          <Input value={form.instructions} onChange={(e) => set('instructions', e.target.value)} />
        </Field>
        <Field label="Holidays (comma-separated dates/labels)">
          <Input value={form.holidays} onChange={(e) => set('holidays', e.target.value)} placeholder="2026-01-26|Republic Day, 2026-08-15" />
        </Field>
        {isStockist ? (
          <>
            <Field label="Delivery fee (flat ₹, optional)">
              <Input
                type="number"
                value={form.deliveryFeeFlat}
                onChange={(e) => set('deliveryFeeFlat', e.target.value)}
                placeholder="0 = none"
              />
            </Field>
            <Field label="Free delivery above goods subtotal ₹ (optional)">
              <Input
                type="number"
                value={form.deliveryFeeFreeAbove}
                onChange={(e) => set('deliveryFeeFreeAbove', e.target.value)}
              />
            </Field>
            <p className="muted" style={{ fontSize: 12, margin: 0 }}>
              Fee is applied only at invoice issue; changing the rule never edits issued invoices.
            </p>
            <Field label="Storage locations (comma-separated)">
              <Input
                value={form.locations}
                onChange={(e) => set('locations', e.target.value)}
                placeholder="Main Warehouse, Branch Depot"
              />
            </Field>
          </>
        ) : null}
      </div>

      <div className="card card-pad stack">
        <strong>Documents</strong>
        {!docs.length ? (
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>
            No documents on file.
          </p>
        ) : (
          docs.map((d) => (
            <div key={d.fileId} style={{ fontSize: 13 }}>
              <strong>{d.label}</strong>
              {d.licenseNumber ? <span className="muted"> · {d.licenseNumber}</span> : null}
              <div>
                <FileLink fileId={d.fileId} />
              </div>
            </div>
          ))
        )}
        <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer', alignSelf: 'flex-start' }}>
          Upload document
          <input
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            hidden
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              const res = await addBusinessDocument({
                actor,
                business,
                kind: isStockist ? 'WholesaleLicense' : 'PharmacyCert',
                label: file.name,
                file,
              });
              pushToast(res.ok ? { tone: 'success', title: 'Document uploaded' } : { tone: 'error', title: res.message });
            }}
          />
        </label>
      </div>

      <Button disabled={busy} onClick={() => void save()}>
        {busy ? 'Saving…' : 'Save business profile'}
      </Button>
    </div>
  );
}
