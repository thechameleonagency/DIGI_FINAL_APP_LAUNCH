import type { Product } from '../domain/entities/types';
import { db } from '../data/db';
import { calcInclusiveOrderLine, priceForPlatformPharmacy } from './pricingService';

export type RecommendMatch = {
  productId: string;
  productName: string;
  stockistId: string;
  stockistName: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
  available: number;
  moq: number;
  deliveryHintDays: number;
};

export type ParsedDemandLine = {
  key: string;
  name: string;
  qty: number;
  /** Offline bill unit cost when comparing savings. */
  offlineUnitCost?: number;
};

export type SmartRecommendResult = {
  bestSingle: {
    stockistId: string;
    stockistName: string;
    items: RecommendMatch[];
    total: number;
    coverage: number;
    missing: string[];
  } | null;
  cheapestSplit: {
    items: RecommendMatch[];
    byStockist: { stockistId: string; stockistName: string; items: RecommendMatch[]; subtotal: number }[];
    total: number;
    savingsVsSingle: number;
  };
  fastest: {
    items: RecommendMatch[];
    byStockist: { stockistId: string; stockistName: string; items: RecommendMatch[]; subtotal: number }[];
    total: number;
  };
  notFound: string[];
  /** When offline bill rates provided: Digi best total vs bill. */
  billCompare?: {
    billTotal: number;
    digiBestTotal: number;
    savedAmount: number;
    digiIsCheaper: boolean;
  };
};

function fuzzyMatch(searchTerm: string, productName: string): boolean {
  const search = searchTerm.toLowerCase().trim();
  const product = productName.toLowerCase().trim();
  if (product === search) return true;
  if (product.includes(search) || search.includes(product)) return true;
  const searchWords = search.split(/\s+/);
  const productWords = product.split(/\s+/);
  return searchWords.some((sw) => productWords.some((pw) => pw.includes(sw) || sw.includes(pw)));
}

function availableQty(batches: { onHand: number; reserved: number; status: string }[]): number {
  return batches
    .filter((b) => b.status === 'Available')
    .reduce((s, b) => s + Math.max(0, b.onHand - b.reserved), 0);
}

/**
 * Multi-stockist optimizer (ported from greetings-pal smart-order-recommend).
 * Uses inclusive pharmacy prices (commission + bank fee baked in).
 */
export async function recommendSmartOrder(params: {
  pharmacyId: string;
  demand: ParsedDemandLine[];
  billTotal?: number;
}): Promise<SmartRecommendResult> {
  const connections = await db.connections
    .where('pharmacyId')
    .equals(params.pharmacyId)
    .filter((c) => c.status === 'Active')
    .toArray();
  const stockistIds = connections.map((c) => c.stockistId);
  const settings = await db.platformSettings.get('platform');

  const allProducts: Product[] = [];
  for (const sid of stockistIds) {
    const products = await db.products
      .where('stockistId')
      .equals(sid)
      .filter((p) => p.status === 'Active' && p.listedForSale !== false)
      .toArray();
    allProducts.push(...products);
  }
  const businesses = await db.businesses.bulkGet(stockistIds);
  const nameById = new Map(
    businesses.filter(Boolean).map((b) => [b!.id, b!.name] as const),
  );

  const batches = await db.batches.where('stockistId').anyOf(stockistIds).toArray();
  const batchesByProduct = new Map<string, typeof batches>();
  for (const b of batches) {
    const arr = batchesByProduct.get(b.productId) ?? [];
    arr.push(b);
    batchesByProduct.set(b.productId, arr);
  }

  type MatchBag = {
    key: string;
    name: string;
    qty: number;
    offlineUnitCost?: number;
    matches: RecommendMatch[];
  };

  const matched: MatchBag[] = [];
  const notFound: string[] = [];

  for (const line of params.demand) {
    const candidates = allProducts.filter((p) => fuzzyMatch(line.name, p.name));
    const matches: RecommendMatch[] = [];
    for (const p of candidates) {
      const avail = availableQty(batchesByProduct.get(p.id) ?? []);
      if (avail < line.qty) continue;
      const priced = priceForPlatformPharmacy(p, settings);
      const money = calcInclusiveOrderLine(priced, line.qty, p.gstPercent);
      const stockist = await db.businesses.get(p.stockistId);
      const holidayPenalty = stockist?.holidays?.length ? 1 : 0;
      matches.push({
        productId: p.id,
        productName: p.name,
        stockistId: p.stockistId,
        stockistName: nameById.get(p.stockistId) ?? 'Stockist',
        qty: line.qty,
        unitPrice: money.unitPrice,
        lineTotal: money.lineTotal,
        available: avail,
        moq: p.moq,
        deliveryHintDays: 1 + holidayPenalty + (p.stockistId.charCodeAt(0) % 3),
      });
    }
    if (!matches.length) {
      notFound.push(line.name);
      matched.push({ key: line.key, name: line.name, qty: line.qty, offlineUnitCost: line.offlineUnitCost, matches: [] });
    } else {
      matched.push({ key: line.key, name: line.name, qty: line.qty, offlineUnitCost: line.offlineUnitCost, matches });
    }
  }

  // Per-stockist coverage map
  const stockistMap = new Map<
    string,
    {
      stockistId: string;
      stockistName: string;
      items: RecommendMatch[];
      total: number;
      coverage: number;
      missing: string[];
    }
  >();

  for (const item of matched) {
    for (const m of item.matches) {
      if (!stockistMap.has(m.stockistId)) {
        stockistMap.set(m.stockistId, {
          stockistId: m.stockistId,
          stockistName: m.stockistName,
          items: [],
          total: 0,
          coverage: 0,
          missing: [],
        });
      }
      const s = stockistMap.get(m.stockistId)!;
      s.items.push(m);
      s.total += m.lineTotal;
      s.coverage += 1;
    }
  }

  for (const item of matched) {
    for (const s of stockistMap.values()) {
      if (!item.matches.some((m) => m.stockistId === s.stockistId)) {
        s.missing.push(item.name);
      }
    }
  }

  const allStockists = [...stockistMap.values()];
  const bestSingle =
    allStockists
      .filter((s) => s.coverage > 0)
      .sort((a, b) => {
        if (a.coverage !== b.coverage) return b.coverage - a.coverage;
        return a.total - b.total;
      })[0] ?? null;

  // Cheapest split
  const cheapestItems: RecommendMatch[] = [];
  for (const item of matched) {
    if (!item.matches.length) continue;
    const cheapest = item.matches.reduce((a, b) => (b.lineTotal < a.lineTotal ? b : a));
    cheapestItems.push(cheapest);
  }
  const cheapestByStockist = new Map<string, { stockistId: string; stockistName: string; items: RecommendMatch[]; subtotal: number }>();
  for (const m of cheapestItems) {
    if (!cheapestByStockist.has(m.stockistId)) {
      cheapestByStockist.set(m.stockistId, {
        stockistId: m.stockistId,
        stockistName: m.stockistName,
        items: [],
        subtotal: 0,
      });
    }
    const g = cheapestByStockist.get(m.stockistId)!;
    g.items.push(m);
    g.subtotal += m.lineTotal;
  }
  const cheapestTotal = cheapestItems.reduce((s, m) => s + m.lineTotal, 0);

  // Fastest delivery
  const fastestItems: RecommendMatch[] = [];
  for (const item of matched) {
    if (!item.matches.length) continue;
    const fastest = item.matches.reduce((a, b) => (b.deliveryHintDays < a.deliveryHintDays ? b : a));
    fastestItems.push(fastest);
  }
  const fastestByStockist = new Map<string, { stockistId: string; stockistName: string; items: RecommendMatch[]; subtotal: number }>();
  for (const m of fastestItems) {
    if (!fastestByStockist.has(m.stockistId)) {
      fastestByStockist.set(m.stockistId, {
        stockistId: m.stockistId,
        stockistName: m.stockistName,
        items: [],
        subtotal: 0,
      });
    }
    const g = fastestByStockist.get(m.stockistId)!;
    g.items.push(m);
    g.subtotal += m.lineTotal;
  }
  const fastestTotal = fastestItems.reduce((s, m) => s + m.lineTotal, 0);

  const digiBest = Math.min(
    bestSingle?.total ?? Number.POSITIVE_INFINITY,
    cheapestTotal || Number.POSITIVE_INFINITY,
  );

  let billCompare: SmartRecommendResult['billCompare'];
  if (params.billTotal != null && params.billTotal > 0 && Number.isFinite(digiBest)) {
    const saved = params.billTotal - digiBest;
    billCompare = {
      billTotal: params.billTotal,
      digiBestTotal: digiBest,
      savedAmount: Math.abs(saved),
      digiIsCheaper: saved > 0,
    };
  } else {
    // Derive bill total from offline unit costs if present
    const offlineTotal = matched.reduce((s, m) => {
      if (m.offlineUnitCost == null) return s;
      return s + m.offlineUnitCost * m.qty;
    }, 0);
    if (offlineTotal > 0 && Number.isFinite(digiBest)) {
      const saved = offlineTotal - digiBest;
      billCompare = {
        billTotal: offlineTotal,
        digiBestTotal: digiBest,
        savedAmount: Math.abs(saved),
        digiIsCheaper: saved > 0,
      };
    }
  }

  return {
    bestSingle: bestSingle
      ? {
          stockistId: bestSingle.stockistId,
          stockistName: bestSingle.stockistName,
          items: bestSingle.items,
          total: bestSingle.total,
          coverage: bestSingle.coverage,
          missing: bestSingle.missing,
        }
      : null,
    cheapestSplit: {
      items: cheapestItems,
      byStockist: [...cheapestByStockist.values()],
      total: cheapestTotal,
      savingsVsSingle: bestSingle ? Math.max(0, bestSingle.total - cheapestTotal) : 0,
    },
    fastest: {
      items: fastestItems,
      byStockist: [...fastestByStockist.values()],
      total: fastestTotal,
    },
    notFound,
    billCompare,
  };
}

/** Push recommendation matches into per-stockist carts. */
export async function acceptRecommendationToCarts(params: {
  actor: import('../domain/entities/types').User;
  pharmacy: import('../domain/entities/types').Business;
  items: RecommendMatch[];
}): Promise<void> {
  const { setCartLine } = await import('./catalogueService');
  for (const item of params.items) {
    await setCartLine({
      actor: params.actor,
      pharmacy: params.pharmacy,
      stockistId: item.stockistId,
      productId: item.productId,
      qty: item.qty,
    });
  }
}
