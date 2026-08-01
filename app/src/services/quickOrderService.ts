import type { Business, Product, User } from '../domain/entities/types';
import { productAvailableSellable } from '../domain/calc';
import { fail, ok, type Result } from '../domain/errors/types';
import { db } from '../data/db';
import { assertCan } from './authService';
import { writeAudit } from './audit';
import { setCartLine } from './catalogueService';

export type ParsedQuickLine = {
  raw: string;
  phrase: string;
  qty?: number;
};

export type QuickOrderSeller = {
  stockistId: string;
  stockistName: string;
  productId: string;
  productName: string;
  brand: string;
  sku: string;
  ptr: number;
  moq: number;
  maxQty?: number;
  available: number;
};

export type MatchedQuickLine = {
  raw: string;
  phrase: string;
  qty: number;
  productId: string;
  stockistId: string;
  productName: string;
  unitPrice: number;
  sellers: QuickOrderSeller[];
};

export type UnmatchedQuickLine = {
  raw: string;
  phrase: string;
  qty?: number;
  reason: string;
};

/**
 * Deterministic line parser (CF-02 / PLAN/05 §9.2).
 * Patterns: `Dolo 650 x 20`, `20 Dolo 650`, `Dolo-650, 20`, `qty:10 …`, trailing/leading counts.
 */
export function parseQuickOrderText(text: string): ParsedQuickLine[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  return lines.map((raw) => {
    let work = raw;
    let qty: number | undefined;

    const qtyColon = work.match(/\bqty\s*:\s*(\d+)\b/i);
    if (qtyColon) {
      qty = Number(qtyColon[1]);
      work = work.replace(qtyColon[0], ' ').trim();
    }

    const xMatch = work.match(/^(.*?)(?:\s*[xX×]\s*)(\d+)\s*$/);
    if (qty == null && xMatch) {
      qty = Number(xMatch[2]);
      work = xMatch[1].trim();
    }

    // Trailing qty only with explicit comma (avoids treating "Dolo 650" strength as qty)
    const commaTrail = work.match(/^(.*?),\s*(\d+)\s*$/);
    if (qty == null && commaTrail && /[a-zA-Z]/.test(commaTrail[1])) {
      qty = Number(commaTrail[2]);
      work = commaTrail[1].trim();
    }

    const leading = work.match(/^(\d+)\s+(.+)$/);
    if (qty == null && leading && /[a-zA-Z]/.test(leading[2])) {
      qty = Number(leading[1]);
      work = leading[2].trim();
    }

    // Spaced dash only: "Dolo 650 - 20" (not "Dolo-650")
    const dashQty = work.match(/^(.*?)\s+-\s+(\d+)\s*$/);
    if (qty == null && dashQty && /[a-zA-Z]/.test(dashQty[1])) {
      qty = Number(dashQty[2]);
      work = dashQty[1].trim();
    }

    const phrase = work.replace(/\s+/g, ' ').trim();
    return { raw, phrase, qty: qty && qty > 0 ? qty : undefined };
  });
}

function scoreMatch(phrase: string, p: Pick<Product, 'name' | 'brand' | 'sku'>): number {
  const q = phrase.toLowerCase();
  const name = p.name.toLowerCase();
  const brand = p.brand.toLowerCase();
  const sku = p.sku.toLowerCase();
  if (!q) return 0;
  if (sku === q) return 100;
  if (name === q) return 90;
  if (`${name} ${brand}` === q || `${brand} ${name}` === q) return 85;
  let score = 0;
  if (name.includes(q) || q.includes(name)) score = Math.max(score, 70);
  if (brand.includes(q) || q.includes(brand)) score = Math.max(score, 40);
  if (sku.includes(q) || q.includes(sku)) score = Math.max(score, 60);
  // token contains
  const tokens = q.split(/[\s-]+/).filter(Boolean);
  if (tokens.length && tokens.every((t) => name.includes(t) || brand.includes(t) || sku.includes(t))) {
    score = Math.max(score, 55);
  }
  return score;
}

export function matchQuickOrderLines(params: {
  parsed: ParsedQuickLine[];
  sellable: QuickOrderSeller[];
}): { matched: MatchedQuickLine[]; unmatched: UnmatchedQuickLine[] } {
  const matched: MatchedQuickLine[] = [];
  const unmatched: UnmatchedQuickLine[] = [];

  for (const line of params.parsed) {
    if (!line.phrase) {
      unmatched.push({ raw: line.raw, phrase: line.phrase, qty: line.qty, reason: 'Empty product phrase' });
      continue;
    }

    const scored = params.sellable
      .map((s) => ({
        s,
        score: scoreMatch(line.phrase, { name: s.productName, brand: s.brand, sku: s.sku }),
      }))
      .filter((x) => x.score > 0)
      .sort(
        (a, b) =>
          b.score - a.score ||
          a.s.ptr - b.s.ptr ||
          a.s.stockistName.localeCompare(b.s.stockistName),
      );

    if (!scored.length) {
      unmatched.push({
        raw: line.raw,
        phrase: line.phrase,
        qty: line.qty,
        reason: 'No matching connected product',
      });
      continue;
    }

    const bestScore = scored[0].score;
    const candidates = scored.filter((x) => x.score === bestScore).map((x) => x.s);
    // Deduplicate by stockist keeping cheapest
    const byStockist = new Map<string, QuickOrderSeller>();
    for (const c of candidates) {
      const prev = byStockist.get(c.stockistId);
      if (!prev || c.ptr < prev.ptr) byStockist.set(c.stockistId, c);
    }
    const sellers = [...byStockist.values()].sort(
      (a, b) => a.ptr - b.ptr || a.stockistName.localeCompare(b.stockistName),
    );
    const pick = sellers[0];
    let qty = line.qty ?? pick.moq;
    if (qty < pick.moq) qty = pick.moq;
    if (pick.maxQty != null && qty > pick.maxQty) {
      unmatched.push({
        raw: line.raw,
        phrase: line.phrase,
        qty: line.qty,
        reason: `Quantity exceeds max (${pick.maxQty})`,
      });
      continue;
    }

    matched.push({
      raw: line.raw,
      phrase: line.phrase,
      qty,
      productId: pick.productId,
      stockistId: pick.stockistId,
      productName: pick.productName,
      unitPrice: pick.ptr,
      sellers,
    });
  }

  // E-CF-02b: merge duplicate products (same productId) with summed qty
  const merged = new Map<string, MatchedQuickLine>();
  for (const m of matched) {
    const prev = merged.get(m.productId);
    if (!prev) {
      merged.set(m.productId, { ...m });
      continue;
    }
    const qty = prev.qty + m.qty;
    const cap = prev.sellers.find((s) => s.productId === prev.productId)?.maxQty;
    merged.set(m.productId, {
      ...prev,
      qty: cap != null ? Math.min(qty, cap) : qty,
      raw: `${prev.raw} + ${m.raw}`,
    });
  }

  return { matched: [...merged.values()], unmatched };
}

async function loadSellable(pharmacyId: string): Promise<QuickOrderSeller[]> {
  const conns = await db.connections.where({ pharmacyId, status: 'Active' }).toArray();
  const stockistIds = new Set(conns.map((c) => c.stockistId));
  if (!stockistIds.size) return [];
  const catalogues = await db.catalogues.toArray();
  const activeCat = new Set(
    catalogues.filter((c) => c.status === 'Active' && stockistIds.has(c.stockistId)).map((c) => c.stockistId),
  );
  const stockists = await db.businesses.bulkGet([...activeCat]);
  const nameById = new Map(stockists.filter(Boolean).map((s) => [s!.id, s!.name]));
  const products = await db.products.filter((p) => p.status === 'Active' && activeCat.has(p.stockistId)).toArray();
  const batches = await db.batches.toArray();
  return products.map((p) => ({
    stockistId: p.stockistId,
    stockistName: nameById.get(p.stockistId) ?? p.stockistId.slice(0, 6),
    productId: p.id,
    productName: p.name,
    brand: p.brand,
    sku: p.sku,
    ptr: p.ptr,
    moq: p.moq,
    maxQty: p.maxQty,
    available: productAvailableSellable(batches.filter((b) => b.productId === p.id)),
  }));
}

export async function resolveQuickOrder(params: {
  actor: User;
  pharmacy: Business;
  text: string;
}): Promise<Result<{ matched: MatchedQuickLine[]; unmatched: UnmatchedQuickLine[]; parsedCount: number }>> {
  const perm = assertCan(params.actor, params.pharmacy, 'order.place');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Quick Order was not parsed.');
  const parsed = parseQuickOrderText(params.text);
  if (!parsed.length) {
    return fail('Validation', 'QUICK_EMPTY', 'Paste at least one product line.', 'Quick Order was not parsed.');
  }
  const sellable = await loadSellable(params.pharmacy.id);
  const { matched, unmatched } = matchQuickOrderLines({ parsed, sellable });
  return ok({ matched, unmatched, parsedCount: parsed.length });
}

export async function confirmQuickOrder(params: {
  actor: User;
  pharmacy: Business;
  lines: { productId: string; stockistId: string; qty: number; productName: string }[];
}): Promise<Result<{ added: number; skipped: string[] }>> {
  const perm = assertCan(params.actor, params.pharmacy, 'order.place');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Cart was not updated.');
  if (!params.lines.length) {
    return fail('Validation', 'QUICK_NONE', 'No matched lines to add.', 'Cart was not updated.');
  }

  let added = 0;
  const skipped: string[] = [];
  for (const line of params.lines) {
    if (line.qty <= 0) continue;
    const res = await setCartLine({
      actor: params.actor,
      pharmacy: params.pharmacy,
      stockistId: line.stockistId,
      productId: line.productId,
      qty: line.qty,
    });
    if (!res.ok) skipped.push(`${line.productName}: ${res.message}`);
    else added += 1;
  }

  if (!added) {
    return fail('BusinessRule', 'QUICK_CART', skipped.join('; ') || 'Nothing added.', 'Cart was not updated.');
  }

  await writeAudit({
    actorId: params.actor.id,
    actorName: params.actor.name,
    businessId: params.pharmacy.id,
    entityType: 'Cart',
    entityId: params.pharmacy.id,
    action: 'quickOrder.confirm',
    after: { added, skipped: skipped.length },
  });
  return ok({ added, skipped });
}
