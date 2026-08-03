import type { Address, Business, Order, User } from '../../domain/entities/types';
import type { Result } from '../../domain/errors/types';
import { placeOrder } from '../../services/orderService';
import { db } from '../db';

/** Resolve paymentMode the same way PharmacyCart does: Credit only when in Circle. */
export async function resolveSeedPaymentMode(
  pharmacyId: string,
  stockistId: string,
  override?: 'PayFirst' | 'Credit' | 'Cash',
): Promise<'PayFirst' | 'Credit' | 'Cash'> {
  if (override) return override;
  const conn = await db.connections
    .where('[pharmacyId+stockistId]')
    .equals([pharmacyId, stockistId])
    .and((c) => c.status === 'Active')
    .first();
  return conn?.inCircle ? 'Credit' : 'PayFirst';
}

/** placeOrder with Circle-aware paymentMode (mirrors PharmacyCart). */
export async function seedPlaceOrder(params: {
  actor: User;
  pharmacy: Business;
  stockistId: string;
  address: Address;
  notes?: string;
  idempotencyKey: string;
  paymentMode?: 'PayFirst' | 'Credit' | 'Cash';
  productIds?: string[];
}): Promise<Result<Order>> {
  const paymentMode = await resolveSeedPaymentMode(
    params.pharmacy.id,
    params.stockistId,
    params.paymentMode,
  );
  return placeOrder({
    actor: params.actor,
    pharmacy: params.pharmacy,
    stockistId: params.stockistId,
    address: params.address,
    notes: params.notes,
    idempotencyKey: params.idempotencyKey,
    paymentMode,
    productIds: params.productIds,
  });
}
