import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../data/db';
import { cartTotals } from '../../../domain/calc';
import { pluralize } from '../../../domain/utils/pluralize';
import { getCart } from '../../../services/catalogueService';
import { priceForPlatformPharmacy } from '../../../services/pricingService';
import { Button, EmptyState, Money } from '../../../ui/components/primitives';
import { useBiz } from './useBiz';

/** Compact cart summary for the topbar sheet — full checkout stays on /pharmacy/cart. */
export function PharmacyCartSheet({ onClose }: { onClose?: () => void }) {
  const { business } = useBiz();
  const connections =
    useLiveQuery(() => db.connections.where({ pharmacyId: business.id, status: 'Active' }).toArray(), [business.id]) ??
    [];
  const stockists = useLiveQuery(() => db.businesses.where('type').equals('Stockist').toArray()) ?? [];
  const settings = useLiveQuery(() => db.platformSettings.get('platform'));
  const [stockistId, setStockistId] = useState('');
  const sid = stockistId || connections[0]?.stockistId || '';
  const products =
    useLiveQuery(
      () => (sid ? db.products.where('stockistId').equals(sid).toArray() : []),
      [sid],
    ) ?? [];
  const [cart, setCart] = useState<Awaited<ReturnType<typeof getCart>> | null>(null);
  const stockist = stockists.find((s) => s.id === sid);

  useEffect(() => {
    if (sid) void getCart(business.id, sid).then(setCart);
    else setCart(null);
  }, [business.id, sid]);

  const lines = cart?.lines ?? [];
  const priced = lines
    .map((l) => {
      const p = products.find((x) => x.id === l.productId);
      if (!p) return null;
      return { ...l, name: p.name, unitPrice: priceForPlatformPharmacy(p, settings).unitPrice, gstPercent: p.gstPercent };
    })
    .filter(Boolean) as { productId: string; qty: number; name: string; unitPrice: number; gstPercent: number }[];
  const totals = cartTotals(priced.map((l) => ({ qty: l.qty, unitPrice: l.unitPrice, gstPercent: l.gstPercent })));

  return (
    <div className="stack">
      {connections.length > 1 ? (
        <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
          {connections.map((c) => (
            <Button
              key={c.stockistId}
              size="sm"
              variant={c.stockistId === sid ? 'primary' : 'secondary'}
              type="button"
              onClick={() => setStockistId(c.stockistId)}
            >
              {stockists.find((s) => s.id === c.stockistId)?.name ?? c.stockistId.slice(0, 8)}
            </Button>
          ))}
        </div>
      ) : null}

      {!sid || !lines.length ? (
        <EmptyState
          title="Cart is empty"
          description="Add products from Buy, then check out on the full cart page."
          action={
            <Link className="btn btn-primary btn-sm" to="/pharmacy/buy" onClick={() => onClose?.()}>
              Browse Buy
            </Link>
          }
        />
      ) : (
        <>
          <div className="muted" style={{ fontSize: 13 }}>
            {stockist?.name ?? 'Stockist'} · {pluralize(lines.length, 'line')}
          </div>
          <div className="stack" style={{ gap: 8 }}>
            {priced.map((l) => (
              <div key={l.productId} className="row" style={{ justifyContent: 'space-between', fontSize: 13 }}>
                <span>
                  {l.name} × {l.qty}
                </span>
                <Money value={l.unitPrice * l.qty} />
              </div>
            ))}
          </div>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <strong>Est. total</strong>
            <strong>
              <Money value={totals.grandTotal} />
            </strong>
          </div>
          <Link className="btn btn-primary" to="/pharmacy/cart" onClick={() => onClose?.()}>
            Go to checkout
          </Link>
          <Button variant="secondary" type="button" onClick={() => onClose?.()}>
            Keep shopping
          </Button>
        </>
      )}
    </div>
  );
}
