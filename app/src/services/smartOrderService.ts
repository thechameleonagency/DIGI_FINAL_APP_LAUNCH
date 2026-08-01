import type {
  Business,
  Product,
  SmartOrderAcceptedLine,
  SmartOrderRuleTag,
  SmartOrderRun,
  SmartOrderSellerOption,
  SmartOrderSuggestionLine,
  User,
} from '../domain/entities/types';
import { expiryRiskBand, lowStock, productAvailableSellable } from '../domain/calc';
import { fail, ok, type Result } from '../domain/errors/types';
import { newId } from '../domain/utils/ids';
import { db } from '../data/db';
import { assertCan } from './authService';
import { writeAudit } from './audit';
import { setCartLine } from './catalogueService';

export type SmartOrderScopeFlag = 'lowStock' | 'frequent' | 'nearExpiry';

export function productMatchKey(p: Pick<Product, 'name' | 'brand' | 'sku'>): string {
  return `${p.name}|${p.brand}`.toLowerCase();
}

function roundAvg(values: number[]): number {
  if (!values.length) return 0;
  return Math.max(1, Math.round(values.reduce((s, v) => s + v, 0) / values.length));
}

async function connectedSellableProducts(pharmacyId: string): Promise<
  { product: Product; stockistName: string; available: number }[]
> {
  const conns = await db.connections.where({ pharmacyId, status: 'Active' }).toArray();
  const stockistIds = conns.map((c) => c.stockistId);
  if (!stockistIds.length) return [];

  const catalogues = await db.catalogues.toArray();
  const activeCatStockists = new Set(
    catalogues.filter((c) => c.status === 'Active' && stockistIds.includes(c.stockistId)).map((c) => c.stockistId),
  );
  const stockists = await db.businesses.bulkGet([...activeCatStockists]);
  const nameById = new Map(stockists.filter(Boolean).map((s) => [s!.id, s!.name]));
  const products = await db.products
    .filter((p) => p.status === 'Active' && activeCatStockists.has(p.stockistId))
    .toArray();
  const batches = await db.batches.toArray();
  return products.map((product) => ({
    product,
    stockistName: nameById.get(product.stockistId) ?? product.stockistId.slice(0, 6),
    available: productAvailableSellable(batches.filter((b) => b.productId === product.id)),
  }));
}

function sellersForKey(
  key: string,
  sku: string | undefined,
  sellable: { product: Product; stockistName: string; available: number }[],
): SmartOrderSellerOption[] {
  const matches = sellable.filter(
    (s) => productMatchKey(s.product) === key || (!!sku && s.product.sku === sku),
  );
  const byStockist = new Map<string, SmartOrderSellerOption>();
  for (const m of matches) {
    const opt: SmartOrderSellerOption = {
      stockistId: m.product.stockistId,
      stockistName: m.stockistName,
      productId: m.product.id,
      ptr: m.product.ptr,
      available: m.available,
      moq: m.product.moq,
      maxQty: m.product.maxQty,
    };
    const prev = byStockist.get(opt.stockistId);
    if (!prev || opt.ptr < prev.ptr) byStockist.set(opt.stockistId, opt);
  }
  return [...byStockist.values()].sort((a, b) => a.ptr - b.ptr || a.stockistName.localeCompare(b.stockistName));
}

function finalizeLine(
  partial: {
    key: string;
    productName: string;
    brand: string;
    sku?: string;
    rules: SmartOrderRuleTag[];
    suggestedQty: number;
  },
  sellable: { product: Product; stockistName: string; available: number }[],
): SmartOrderSuggestionLine {
  const sellers = sellersForKey(partial.key, partial.sku, sellable);
  const cheapest = sellers[0];
  const moq = cheapest?.moq ?? 1;
  const qty = Math.max(partial.suggestedQty, moq);
  if (!sellers.length) {
    return {
      key: partial.key,
      productName: partial.productName,
      brand: partial.brand,
      rules: partial.rules,
      suggestedQty: qty,
      sellers: [],
      unavailableReason: 'Unavailable — no connected stockist sells this',
    };
  }
  return {
    key: partial.key,
    productName: partial.productName,
    brand: partial.brand,
    rules: partial.rules,
    suggestedQty: qty,
    sellers,
    selectedStockistId: cheapest.stockistId,
    selectedProductId: cheapest.productId,
  };
}

function mergeSuggestions(lines: SmartOrderSuggestionLine[]): SmartOrderSuggestionLine[] {
  const map = new Map<string, SmartOrderSuggestionLine>();
  for (const line of lines) {
    const prev = map.get(line.key);
    if (!prev) {
      map.set(line.key, { ...line, rules: [...line.rules] });
      continue;
    }
    const rules = [...new Set([...prev.rules, ...line.rules])] as SmartOrderRuleTag[];
    const suggestedQty = Math.max(prev.suggestedQty, line.suggestedQty);
    const sellers = prev.sellers.length ? prev.sellers : line.sellers;
    const cheapest = sellers[0];
    map.set(line.key, {
      ...prev,
      rules,
      suggestedQty,
      sellers,
      selectedStockistId: cheapest?.stockistId,
      selectedProductId: cheapest?.productId,
      unavailableReason: sellers.length ? undefined : prev.unavailableReason ?? line.unavailableReason,
    });
  }
  return [...map.values()].sort((a, b) => a.productName.localeCompare(b.productName));
}

/** Pure-ish builder used by generateSmartOrderSuggestions + unit tests. */
export function buildSmartOrderSuggestions(input: {
  scopes: SmartOrderScopeFlag[];
  inventory: { productId: string; productName: string; onHand: number; expiryDate?: string; brand?: string; sku?: string; reorderLevel?: number }[];
  orderLinesByProduct: Map<string, { qtys: number[]; productName: string; brand: string; sku?: string }>;
  sellable: { product: Product; stockistName: string; available: number }[];
  nearExpiryDays: number;
  today?: Date;
}): SmartOrderSuggestionLine[] {
  const today = input.today ?? new Date();
  const wantAll = input.scopes.length === 3;
  const want = (f: SmartOrderScopeFlag) => wantAll || input.scopes.includes(f);
  const draft: SmartOrderSuggestionLine[] = [];

  if (want('lowStock')) {
    for (const item of input.inventory) {
      const threshold = item.reorderLevel ?? 10;
      if (!lowStock(item.onHand, threshold)) continue;
      const product = input.sellable.find((s) => s.product.id === item.productId)?.product;
      const key = product ? productMatchKey(product) : item.productName.toLowerCase();
      const brand = product?.brand ?? item.brand ?? '';
      const sku = product?.sku ?? item.sku;
      draft.push(
        finalizeLine(
          {
            key,
            productName: product?.name ?? item.productName,
            brand,
            sku,
            rules: ['LowStock'],
            suggestedQty: Math.max(1, threshold - item.onHand),
          },
          input.sellable,
        ),
      );
    }
  }

  if (want('frequent')) {
    for (const [productId, hist] of input.orderLinesByProduct) {
      if (hist.qtys.length < 2) continue;
      const product = input.sellable.find((s) => s.product.id === productId)?.product;
      const key = product ? productMatchKey(product) : `${hist.productName}|${hist.brand}`.toLowerCase();
      draft.push(
        finalizeLine(
          {
            key,
            productName: product?.name ?? hist.productName,
            brand: product?.brand ?? hist.brand,
            sku: product?.sku ?? hist.sku,
            rules: ['Frequent'],
            suggestedQty: roundAvg(hist.qtys),
          },
          input.sellable,
        ),
      );
    }
  }

  if (want('nearExpiry')) {
    for (const item of input.inventory) {
      if (!item.expiryDate) continue;
      const band = expiryRiskBand(item.expiryDate, input.nearExpiryDays, 30, today);
      if (band !== 'Near' && band !== 'Critical') continue;
      const product = input.sellable.find((s) => s.product.id === item.productId)?.product;
      const key = product ? productMatchKey(product) : item.productName.toLowerCase();
      draft.push(
        finalizeLine(
          {
            key,
            productName: product?.name ?? item.productName,
            brand: product?.brand ?? item.brand ?? '',
            sku: product?.sku ?? item.sku,
            rules: ['NearExpiry'],
            suggestedQty: Math.max(1, item.onHand),
          },
          input.sellable,
        ),
      );
    }
  }

  return mergeSuggestions(draft);
}

export async function generateSmartOrderSuggestions(params: {
  actor: User;
  pharmacy: Business;
  scopes: SmartOrderScopeFlag[];
}): Promise<Result<SmartOrderSuggestionLine[]>> {
  const perm = assertCan(params.actor, params.pharmacy, 'order.place');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Suggestions were not generated.');
  if (!params.scopes.length) {
    return fail('Validation', 'SMART_SCOPE', 'Select at least one suggestion scope.', 'Suggestions were not generated.');
  }

  const settings = await db.platformSettings.get('platform');
  const nearExpiryDays = settings?.expiryNearDays ?? 90;
  const inventory = await db.pharmacyInventory.where('pharmacyId').equals(params.pharmacy.id).toArray();
  const productsById = new Map((await db.products.bulkGet([...new Set(inventory.map((i) => i.productId))])).filter(Boolean).map((p) => [p!.id, p!]));
  const orders = await db.orders.where('pharmacyId').equals(params.pharmacy.id).toArray();
  const orderLinesByProduct = new Map<string, { qtys: number[]; productName: string; brand: string; sku?: string }>();
  for (const o of orders) {
    if (['Cancelled', 'Rejected', 'Draft'].includes(o.status)) continue;
    const seenInOrder = new Set<string>();
    for (const l of o.lines) {
      if (seenInOrder.has(l.productId)) continue;
      seenInOrder.add(l.productId);
      const prev = orderLinesByProduct.get(l.productId) ?? {
        qtys: [],
        productName: l.productName,
        brand: '',
        sku: undefined,
      };
      prev.qtys.push(l.acceptedQty ?? l.qty);
      const prod = await db.products.get(l.productId);
      if (prod) {
        prev.brand = prod.brand;
        prev.sku = prod.sku;
        prev.productName = prod.name;
      }
      orderLinesByProduct.set(l.productId, prev);
    }
  }

  const sellable = await connectedSellableProducts(params.pharmacy.id);
  const suggestions = buildSmartOrderSuggestions({
    scopes: params.scopes,
    inventory: inventory.map((i) => {
      const p = productsById.get(i.productId);
      return {
        productId: i.productId,
        productName: i.productName,
        onHand: i.onHand,
        expiryDate: i.expiryDate,
        brand: p?.brand,
        sku: p?.sku,
        reorderLevel: p?.reorderLevel,
      };
    }),
    orderLinesByProduct,
    sellable,
    nearExpiryDays,
  });
  return ok(suggestions);
}

export async function completeSmartOrderRun(params: {
  actor: User;
  pharmacy: Business;
  scopes: SmartOrderScopeFlag[];
  suggestions: SmartOrderSuggestionLine[];
  /** Lines the user chose to accept (qty/stockist already edited). */
  accept: { key: string; qty: number; stockistId: string; productId: string }[];
}): Promise<Result<SmartOrderRun>> {
  const perm = assertCan(params.actor, params.pharmacy, 'order.place');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Smart Order was not completed.');

  const acceptedLines: SmartOrderAcceptedLine[] = [];
  const errors: string[] = [];

  for (const line of params.accept) {
    if (line.qty <= 0) continue;
    const suggestion = params.suggestions.find((s) => s.key === line.key);
    if (!suggestion || suggestion.unavailableReason) {
      errors.push(`${line.key}: unavailable`);
      continue;
    }
    const seller = suggestion.sellers.find((s) => s.productId === line.productId && s.stockistId === line.stockistId);
    if (!seller) {
      errors.push(`${suggestion.productName}: invalid stockist`);
      continue;
    }
    const res = await setCartLine({
      actor: params.actor,
      pharmacy: params.pharmacy,
      stockistId: line.stockistId,
      productId: line.productId,
      qty: line.qty,
    });
    if (!res.ok) {
      errors.push(`${suggestion.productName}: ${res.message}`);
      continue;
    }
    acceptedLines.push({
      key: line.key,
      productName: suggestion.productName,
      stockistId: line.stockistId,
      productId: line.productId,
      qty: line.qty,
      unitPrice: seller.ptr,
    });
  }

  if (params.accept.length && !acceptedLines.length) {
    return fail(
      'BusinessRule',
      'SMART_CART_FAIL',
      errors.join('; ') || 'No lines could be added to cart.',
      'Smart Order was not completed.',
    );
  }

  const run: SmartOrderRun = {
    id: newId(),
    pharmacyId: params.pharmacy.id,
    scope: params.scopes.join(','),
    suggestions: params.suggestions,
    acceptedLines,
    createdBy: params.actor.id,
    createdAt: new Date().toISOString(),
  };
  await db.smartOrderRuns.add(run);
  await writeAudit({
    actorId: params.actor.id,
    actorName: params.actor.name,
    businessId: params.pharmacy.id,
    entityType: 'SmartOrderRun',
    entityId: run.id,
    action: 'smartOrder.complete',
    after: { scope: run.scope, accepted: acceptedLines.length, suggested: params.suggestions.length },
  });
  return ok(run);
}

export async function reapplySmartOrderRun(params: {
  actor: User;
  pharmacy: Business;
  runId: string;
}): Promise<Result<{ added: number; skipped: string[] }>> {
  const perm = assertCan(params.actor, params.pharmacy, 'order.place');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Run was not re-applied.');
  const run = await db.smartOrderRuns.get(params.runId);
  if (!run || run.pharmacyId !== params.pharmacy.id) {
    return fail('NotFound', 'SMART_RUN', 'Smart Order run not found.', 'Run was not re-applied.');
  }

  // Re-validate against current catalogue using accepted lines as a seed, regenerating sellers
  const sellable = await connectedSellableProducts(params.pharmacy.id);
  let added = 0;
  const skipped: string[] = [];
  for (const line of run.acceptedLines) {
    const sellers = sellersForKey(line.key, undefined, sellable);
    const match =
      sellers.find((s) => s.productId === line.productId) ??
      sellers.find((s) => s.stockistId === line.stockistId) ??
      sellers[0];
    if (!match) {
      skipped.push(`${line.productName}: no connected seller`);
      continue;
    }
    const qty = Math.max(line.qty, match.moq);
    const res = await setCartLine({
      actor: params.actor,
      pharmacy: params.pharmacy,
      stockistId: match.stockistId,
      productId: match.productId,
      qty,
    });
    if (!res.ok) skipped.push(`${line.productName}: ${res.message}`);
    else added += 1;
  }
  if (!added && run.acceptedLines.length) {
    return fail('BusinessRule', 'SMART_REAPPLY', skipped.join('; ') || 'Nothing could be re-applied.', 'Cart was not updated.');
  }
  return ok({ added, skipped });
}

export async function listSmartOrderRuns(pharmacyId: string): Promise<SmartOrderRun[]> {
  return db.smartOrderRuns.where('pharmacyId').equals(pharmacyId).reverse().sortBy('createdAt');
}
