import type { Business, ManagedSupplier, ManagedSupplierBill, User } from '../domain/entities/types';
import { fail, ok, type Result } from '../domain/errors/types';
import { nowIso } from '../domain/utils/clock';
import { newId } from '../domain/utils/ids';
import { db } from '../data/db';
import { writeAudit } from './audit';
import { assertCan } from './authService';

export async function upsertManagedSupplier(params: {
  actor: User;
  pharmacy: Business;
  supplier: {
    name: string;
    contact: string;
    phone?: string;
    email?: string;
    gst?: string;
    address?: string;
    terms?: string;
    note?: string;
    active?: boolean;
  };
  supplierId?: string;
}): Promise<Result<ManagedSupplier>> {
  const perm = assertCan(params.actor, params.pharmacy, 'inventory.adjust');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Supplier was not saved.');
  const name = params.supplier.name.trim();
  const contact = params.supplier.contact.trim();
  if (!name || !contact) {
    return fail('Validation', 'SUP_FIELDS', 'Name and contact are required.', 'Supplier was not saved.');
  }
  const ts = nowIso();
  if (params.supplierId) {
    const existing = await db.managedSuppliers.get(params.supplierId);
    if (!existing || existing.pharmacyId !== params.pharmacy.id) {
      return fail('NotFound', 'SUP_MISSING', 'Supplier not found.', 'Supplier was not saved.');
    }
    const next: ManagedSupplier = {
      ...existing,
      name,
      contact,
      phone: params.supplier.phone?.trim(),
      email: params.supplier.email?.trim(),
      gst: params.supplier.gst?.trim(),
      address: params.supplier.address?.trim(),
      terms: params.supplier.terms?.trim(),
      note: params.supplier.note?.trim(),
      active: params.supplier.active !== false,
      updatedAt: ts,
    };
    await db.managedSuppliers.put(next);
    return ok(next);
  }
  const row: ManagedSupplier = {
    id: newId(),
    pharmacyId: params.pharmacy.id,
    name,
    contact,
    phone: params.supplier.phone?.trim(),
    email: params.supplier.email?.trim(),
    gst: params.supplier.gst?.trim(),
    address: params.supplier.address?.trim(),
    terms: params.supplier.terms?.trim(),
    note: params.supplier.note?.trim(),
    active: params.supplier.active !== false,
    inviteStatus: 'None',
    createdAt: ts,
    updatedAt: ts,
  };
  await db.managedSuppliers.add(row);
  await writeAudit({
    actorId: params.actor.id,
    actorName: params.actor.name,
    businessId: params.pharmacy.id,
    entityType: 'ManagedSupplier',
    entityId: row.id,
    action: 'managedSupplier.create',
    after: { name },
  });
  return ok(row);
}

export async function listManagedSuppliers(pharmacyId: string): Promise<ManagedSupplier[]> {
  return db.managedSuppliers.where('pharmacyId').equals(pharmacyId).toArray();
}

export async function listManagedSupplierBills(
  pharmacyId: string,
  supplierId?: string,
): Promise<ManagedSupplierBill[]> {
  const all = await db.managedSupplierBills.where('pharmacyId').equals(pharmacyId).toArray();
  return supplierId ? all.filter((b) => b.supplierId === supplierId) : all;
}

export async function deactivateManagedSupplier(params: {
  actor: User;
  pharmacy: Business;
  supplierId: string;
}): Promise<Result<ManagedSupplier>> {
  const perm = assertCan(params.actor, params.pharmacy, 'inventory.adjust');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Supplier was not updated.');
  const existing = await db.managedSuppliers.get(params.supplierId);
  if (!existing || existing.pharmacyId !== params.pharmacy.id) {
    return fail('NotFound', 'SUP_MISSING', 'Supplier not found.', 'Supplier was not updated.');
  }
  const next = { ...existing, active: false, updatedAt: nowIso() };
  await db.managedSuppliers.put(next);
  return ok(next);
}
