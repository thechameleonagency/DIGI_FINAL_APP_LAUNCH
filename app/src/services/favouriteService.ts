import type { Business, Favourite, User } from '../domain/entities/types';
import { fail, ok, type Result } from '../domain/errors/types';
import { newId } from '../domain/utils/ids';
import { db } from '../data/db';
import { assertCan } from './authService';

export async function setFavourite(params: {
  actor: User;
  pharmacy: Business;
  stockistId: string;
  favourite: boolean;
}): Promise<Result<Favourite | null>> {
  const perm = assertCan(params.actor, params.pharmacy, 'connection.request');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Favourite was not updated.');
  if (params.pharmacy.type !== 'Pharmacy') {
    return fail('BusinessRule', 'FAV_PHARM', 'Only pharmacies can favourite stockists.', 'Favourite was not updated.');
  }

  const existing = await db.favourites.where({ pharmacyId: params.pharmacy.id, stockistId: params.stockistId }).first();
  if (!params.favourite) {
    if (existing) await db.favourites.delete(existing.id);
    return ok(null);
  }
  if (existing) return ok(existing);
  const row: Favourite = {
    id: newId(),
    pharmacyId: params.pharmacy.id,
    stockistId: params.stockistId,
  };
  await db.favourites.add(row);
  return ok(row);
}

export async function setSupplierRating(params: {
  actor: User;
  pharmacy: Business;
  stockistId: string;
  rating?: number;
  note?: string;
}): Promise<Result<Favourite>> {
  const perm = assertCan(params.actor, params.pharmacy, 'connection.request');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Rating was not saved.');
  if (params.rating != null && (params.rating < 1 || params.rating > 5 || !Number.isInteger(params.rating))) {
    return fail('Validation', 'FAV_RATING', 'Rating must be an integer 1–5.', 'Rating was not saved.');
  }

  let row = await db.favourites.where({ pharmacyId: params.pharmacy.id, stockistId: params.stockistId }).first();
  if (!row) {
    row = {
      id: newId(),
      pharmacyId: params.pharmacy.id,
      stockistId: params.stockistId,
    };
  }
  const rating = params.rating ?? row.rating;
  if (rating == null) {
    return fail('Validation', 'FAV_RATING', 'Pick a rating 1–5 before saving a note.', 'Rating was not saved.');
  }
  row = {
    ...row,
    rating,
    note: params.note !== undefined ? params.note.trim() || undefined : row.note,
  };
  await db.favourites.put(row);
  return ok(row);
}

export function sortStockistsFavouritesFirst<T extends { id: string }>(
  stockists: T[],
  favouriteStockistIds: Set<string>,
): T[] {
  return [...stockists].sort((a, b) => {
    const af = favouriteStockistIds.has(a.id) ? 0 : 1;
    const bf = favouriteStockistIds.has(b.id) ? 0 : 1;
    if (af !== bf) return af - bf;
    return 0;
  });
}
