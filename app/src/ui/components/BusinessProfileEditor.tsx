import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { INDIAN_STATES, PHARMACY_TYPES } from '../../content/indiaRegions';
import { db } from '../../data/db';
import type { Business, User } from '../../domain/entities/types';
import { newId } from '../../domain/utils/ids';
import { isPin } from '../../domain/utils/validation';
import { addBusinessDocument, updateBusiness } from '../../services/businessService';
import { useSession } from '../../store/session';
import { useUi } from '../../store/ui';
import { FileLink } from './FileUpload';
import { Button, Field, Input, PageHeader, Select, StatusBadge } from './primitives';

type LocationRow = { id: string; name: string };

function locationsFromBusiness(business: Business): LocationRow[] {
  return (business.locations ?? []).map((l) => ({ id: l.id, name: l.name }));
}

function formFromBusiness(business: Business) {
  return {
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
    holidays: [...(business.holidays ?? [])],
    deliverySlots: [...(business.preferences?.deliverySlots ?? [])],
    instructions: business.preferences?.instructions ?? '',
    defaultReceiver: business.preferences?.defaultReceiver ?? '',
    deliveryFeeFlat: String(business.preferences?.deliveryFeeFlat ?? ''),
    deliveryFeeFreeAbove: String(business.preferences?.deliveryFeeFreeAbove ?? ''),
    locations: locationsFromBusiness(business),
  };
}

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

  const [form, setForm] = useState(() => formFromBusiness(business));
  const [dirty, setDirty] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [locationInput, setLocationInput] = useState('');
  const [slotInput, setSlotInput] = useState('');
  const [holidayDate, setHolidayDate] = useState('');
  const [holidayLabel, setHolidayLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form, v: string | string[] | LocationRow[]) => {
    setDirty(true);
    setForm((f) => ({ ...f, [k]: v }));
  };

  // Reset when switching businesses; ignore session refresh ticks while editing.
  useEffect(() => {
    setDirty(false);
    setForm(formFromBusiness(business));
    setLocationInput('');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: only on business id change
  }, [business.id]);

  useEffect(() => {
    if (dirty) return;
    setForm(formFromBusiness(business));
    setLocationInput('');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync on persisted updatedAt only when clean
  }, [business.id, business.updatedAt, dirty]);

  const save = async () => {
    setBusy(true);
    const nextLocations = isStockist
      ? form.locations
          .map((l) => ({ id: l.id, name: l.name.trim() }))
          .filter((l) => l.name.length > 0)
      : undefined;
    if (isStockist && nextLocations) {
      const seen = new Set<string>();
      for (const l of nextLocations) {
        const key = l.name.toLowerCase();
        if (seen.has(key)) {
          setBusy(false);
          pushToast({ tone: 'error', title: `Duplicate location “${l.name}”` });
          return;
        }
        seen.add(key);
      }
    }
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
        holidays: form.holidays,
        locations: nextLocations,
        preferences: {
          deliverySlots: form.deliverySlots,
          instructions: form.instructions.trim() || undefined,
          defaultReceiver: form.defaultReceiver.trim() || undefined,
          deliveryFeeFlat: form.deliveryFeeFlat ? Number(form.deliveryFeeFlat) : undefined,
          deliveryFeeFreeAbove: form.deliveryFeeFreeAbove ? Number(form.deliveryFeeFreeAbove) : undefined,
        },
      },
    });
    if (res.ok && nextLocations) {
      // Keep batch.location labels in sync when a named location is renamed (ids stay stable)
      const prevById = new Map((business.locations ?? []).map((l) => [l.id, l.name]));
      const ts = new Date().toISOString();
      for (const loc of nextLocations) {
        const prevName = prevById.get(loc.id);
        if (!prevName || prevName === loc.name) continue;
        const affected = await db.batches
          .where('stockistId')
          .equals(business.id)
          .filter((b) => (b.location ?? '') === prevName)
          .toArray();
        for (const b of affected) {
          await db.batches.update(b.id, { location: loc.name, updatedAt: ts });
        }
      }
    }
    setBusy(false);
    if (!res.ok) {
      pushToast({ tone: 'error', title: res.message });
      return;
    }
    setDirty(false);
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
        <div className="stack" style={{ gap: 8 }}>
          <strong style={{ fontSize: 13 }}>Delivery slots</strong>
          <div className="row">
            <Input
              placeholder="e.g. Morning 9–12"
              value={slotInput}
              onChange={(e) => setSlotInput(e.target.value)}
              style={{ flex: 1 }}
              aria-label="Add delivery slot"
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                const slot = slotInput.trim();
                if (!slot) return;
                if (form.deliverySlots.some((s) => s.toLowerCase() === slot.toLowerCase())) return;
                set('deliverySlots', [...form.deliverySlots, slot]);
                setSlotInput('');
              }}
            />
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                const slot = slotInput.trim();
                if (!slot) return;
                if (form.deliverySlots.some((s) => s.toLowerCase() === slot.toLowerCase())) return;
                set('deliverySlots', [...form.deliverySlots, slot]);
                setSlotInput('');
              }}
            >
              Add
            </Button>
          </div>
          <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
            {form.deliverySlots.map((s) => (
              <button
                key={s}
                type="button"
                className="chip"
                onClick={() => set('deliverySlots', form.deliverySlots.filter((x) => x !== s))}
              >
                {s} ×
              </button>
            ))}
          </div>
        </div>
        <Field label="Default receiver">
          <Input value={form.defaultReceiver} onChange={(e) => set('defaultReceiver', e.target.value)} />
        </Field>
        <Field label="Delivery instructions">
          <Input value={form.instructions} onChange={(e) => set('instructions', e.target.value)} />
        </Field>
        <div className="stack" style={{ gap: 8 }}>
          <strong style={{ fontSize: 13 }}>Holidays</strong>
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <Field label="Date">
              <Input type="date" value={holidayDate} onChange={(e) => setHolidayDate(e.target.value)} />
            </Field>
            <Field label="Label (optional)">
              <Input
                value={holidayLabel}
                onChange={(e) => setHolidayLabel(e.target.value)}
                placeholder="Republic Day"
              />
            </Field>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                if (!holidayDate) {
                  pushToast({ tone: 'error', title: 'Pick a holiday date' });
                  return;
                }
                const entry = holidayLabel.trim() ? `${holidayDate}|${holidayLabel.trim()}` : holidayDate;
                if (form.holidays.includes(entry) || form.holidays.some((h) => h.startsWith(`${holidayDate}|`) || h === holidayDate)) {
                  pushToast({ tone: 'error', title: 'Holiday already listed' });
                  return;
                }
                set('holidays', [...form.holidays, entry]);
                setHolidayDate('');
                setHolidayLabel('');
              }}
            >
              Add
            </Button>
          </div>
          <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
            {form.holidays.map((h) => {
              const [date, label] = h.split('|');
              return (
                <button
                  key={h}
                  type="button"
                  className="chip"
                  onClick={() => set('holidays', form.holidays.filter((x) => x !== h))}
                >
                  {label ? `${date} · ${label}` : date} ×
                </button>
              );
            })}
          </div>
        </div>
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
            <div className="stack" style={{ gap: 8 }}>
              <strong style={{ fontSize: 13 }}>Storage locations</strong>
              <p className="muted" style={{ fontSize: 12, margin: 0 }}>
                Each location keeps a stable id. Renaming updates batch location labels; reordering does not reassign
                ids.
              </p>
              {form.locations.map((loc) => (
                <div key={loc.id} className="row" style={{ gap: 8, alignItems: 'center' }}>
                  <Input
                    value={loc.name}
                    onChange={(e) =>
                      set(
                        'locations',
                        form.locations.map((l) => (l.id === loc.id ? { ...l, name: e.target.value } : l)),
                      )
                    }
                    placeholder="Location name"
                    aria-label={`Location ${loc.name || loc.id}`}
                    style={{ flex: 1 }}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => set('locations', form.locations.filter((l) => l.id !== loc.id))}
                  >
                    Remove
                  </Button>
                </div>
              ))}
              <div className="row" style={{ gap: 8 }}>
                <Input
                  value={locationInput}
                  onChange={(e) => setLocationInput(e.target.value)}
                  placeholder="New location name"
                  style={{ flex: 1 }}
                  aria-label="New storage location"
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter') return;
                    e.preventDefault();
                    const name = locationInput.trim();
                    if (!name) return;
                    if (form.locations.some((l) => l.name.trim().toLowerCase() === name.toLowerCase())) {
                      pushToast({ tone: 'error', title: 'Location already exists' });
                      return;
                    }
                    set('locations', [...form.locations, { id: newId(), name }]);
                    setLocationInput('');
                  }}
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    const name = locationInput.trim();
                    if (!name) return;
                    if (form.locations.some((l) => l.name.trim().toLowerCase() === name.toLowerCase())) {
                      pushToast({ tone: 'error', title: 'Location already exists' });
                      return;
                    }
                    set('locations', [...form.locations, { id: newId(), name }]);
                    setLocationInput('');
                  }}
                >
                  Add
                </Button>
              </div>
            </div>
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

      <div className={`sticky-save-bar${dirty ? ' is-dirty' : ''}`}>
        <span className="muted" style={{ fontSize: 13 }}>
          {dirty ? 'Unsaved changes' : 'All changes saved'}
        </span>
        <Button disabled={busy || !dirty} onClick={() => void save()}>
          {busy ? 'Saving…' : 'Save business profile'}
        </Button>
      </div>
    </div>
  );
}
