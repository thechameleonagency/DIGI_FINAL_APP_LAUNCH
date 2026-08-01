import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Search } from 'lucide-react';
import { db } from '../../data/db';
import { useSession } from '../../store/session';
import { Input } from './primitives';

type Hit = { label: string; sub?: string; to: string; group: string };

export function GlobalSearch({ portal }: { portal: 'pharmacy' | 'stockist' | 'admin' }) {
  const { business } = useSession();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);

  const orders = useLiveQuery(() => db.orders.toArray(), []) ?? [];
  const invoices = useLiveQuery(() => db.invoices.toArray(), []) ?? [];
  const payments = useLiveQuery(() => db.payments.toArray(), []) ?? [];
  const returns = useLiveQuery(() => db.returns.toArray(), []) ?? [];
  const products = useLiveQuery(() => db.products.toArray(), []) ?? [];
  const businesses = useLiveQuery(() => db.businesses.toArray(), []) ?? [];

  const hits = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query || !business) return [] as Hit[];
    const out: Hit[] = [];
    const pages: Hit[] =
      portal === 'pharmacy'
        ? [
            { group: 'Pages', label: 'Buy', to: '/pharmacy/buy' },
            { group: 'Pages', label: 'Orders', to: '/pharmacy/orders' },
            { group: 'Pages', label: 'Payments', to: '/pharmacy/payments' },
            { group: 'Pages', label: 'Returns', to: '/pharmacy/returns' },
            { group: 'Pages', label: 'Connections', to: '/pharmacy/connections' },
            { group: 'Pages', label: 'Messages', to: '/pharmacy/messages' },
            { group: 'Pages', label: 'Support', to: '/pharmacy/support' },
          ]
        : portal === 'stockist'
          ? [
              { group: 'Pages', label: 'Orders', to: '/stockist/orders' },
              { group: 'Pages', label: 'Catalogue', to: '/stockist/catalogue' },
              { group: 'Pages', label: 'Payments', to: '/stockist/payments' },
              { group: 'Pages', label: 'Returns', to: '/stockist/returns' },
              { group: 'Pages', label: 'Pharmacies', to: '/stockist/pharmacies' },
              { group: 'Pages', label: 'Messages', to: '/stockist/messages' },
              { group: 'Pages', label: 'Delivery', to: '/stockist/delivery' },
            ]
          : [
              { group: 'Pages', label: 'Verifications', to: '/admin/verifications' },
              { group: 'Pages', label: 'Network', to: '/admin/network' },
              { group: 'Pages', label: 'Orders', to: '/admin/orders' },
              { group: 'Pages', label: 'Payments', to: '/admin/payments' },
              { group: 'Pages', label: 'Returns', to: '/admin/returns' },
              { group: 'Pages', label: 'Support', to: '/admin/support' },
              { group: 'Pages', label: 'Audit', to: '/admin/audit' },
            ];
    for (const p of pages) {
      if (p.label.toLowerCase().includes(query)) out.push(p);
    }

    const scopedOrders =
      portal === 'admin'
        ? orders
        : orders.filter((o) => (portal === 'pharmacy' ? o.pharmacyId === business.id : o.stockistId === business.id));
    for (const o of scopedOrders) {
      if (o.orderNo.toLowerCase().includes(query)) {
        out.push({
          group: 'Orders',
          label: o.orderNo,
          sub: o.status,
          to: portal === 'admin' ? `/admin/orders/${encodeURIComponent(o.orderNo)}` : `/${portal}/orders/${o.orderNo}`,
        });
      }
    }

    const scopedInvoices =
      portal === 'admin'
        ? invoices
        : invoices.filter((i) => (portal === 'pharmacy' ? i.pharmacyId === business.id : i.stockistId === business.id));
    for (const i of scopedInvoices) {
      if (i.invoiceNo.toLowerCase().includes(query)) {
        out.push({
          group: 'Invoices',
          label: i.invoiceNo,
          sub: i.status,
          to: portal === 'admin' ? '/admin/payments' : `/${portal}/payments`,
        });
      }
    }

    const scopedPayments =
      portal === 'admin'
        ? payments
        : payments.filter((p) => (portal === 'pharmacy' ? p.pharmacyId === business.id : p.stockistId === business.id));
    for (const p of scopedPayments) {
      if (p.paymentNo.toLowerCase().includes(query) || (p.reference ?? '').toLowerCase().includes(query)) {
        out.push({
          group: 'Payments',
          label: p.paymentNo,
          sub: p.reference ?? p.status,
          to: portal === 'admin' ? `/admin/payments/${encodeURIComponent(p.paymentNo)}` : `/${portal}/payments`,
        });
      }
    }

    const scopedReturns =
      portal === 'admin'
        ? returns
        : returns.filter((r) => (portal === 'pharmacy' ? r.pharmacyId === business.id : r.stockistId === business.id));
    for (const r of scopedReturns) {
      if (r.returnNo.toLowerCase().includes(query)) {
        out.push({
          group: 'Returns',
          label: r.returnNo,
          sub: r.status,
          to: `/${portal}/returns`,
        });
      }
    }

    if (portal === 'stockist') {
      for (const p of products.filter((x) => x.stockistId === business.id)) {
        if (`${p.name} ${p.sku} ${p.brand}`.toLowerCase().includes(query)) {
          out.push({ group: 'Products', label: p.name, sub: p.sku, to: '/stockist/catalogue' });
        }
      }
    }

    if (portal === 'admin') {
      for (const b of businesses.filter((x) => x.type !== 'Platform')) {
        if (`${b.name} ${b.gstNumber ?? ''} ${b.city}`.toLowerCase().includes(query)) {
          out.push({
            group: 'Businesses',
            label: b.name,
            sub: `${b.type} · ${b.city}`,
            to: `/admin/network/${b.id}`,
          });
        }
      }
    } else {
      const partners = businesses.filter((b) =>
        portal === 'pharmacy' ? b.type === 'Stockist' : b.type === 'Pharmacy',
      );
      for (const b of partners) {
        if (`${b.name} ${b.city}`.toLowerCase().includes(query)) {
          out.push({
            group: 'Partners',
            label: b.name,
            sub: b.city,
            to: portal === 'pharmacy' ? '/pharmacy/connections' : '/stockist/pharmacies',
          });
        }
      }
    }

    return out.slice(0, 25);
  }, [q, business, portal, orders, invoices, payments, returns, products, businesses]);

  return (
    <div style={{ position: 'relative', minWidth: 180, maxWidth: 280, flex: 1 }}>
      <div className="row" style={{ gap: 6 }}>
        <Search size={14} style={{ color: 'var(--muted)' }} />
        <Input
          aria-label="Global search"
          placeholder="Search docs / names…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
      </div>
      {open && q.trim() ? (
        <div
          className="card"
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            zIndex: 40,
            maxHeight: 320,
            overflow: 'auto',
            marginTop: 4,
            padding: 8,
          }}
        >
          {!hits.length ? (
            <div className="muted" style={{ fontSize: 12, padding: 8 }}>
              No matches
            </div>
          ) : (
            hits.map((h, i) => (
              <button
                key={`${h.to}-${h.label}-${i}`}
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ width: '100%', justifyContent: 'flex-start', textAlign: 'left' }}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  navigate(h.to);
                  setQ('');
                  setOpen(false);
                }}
              >
                <span>
                  <span className="muted" style={{ fontSize: 10 }}>
                    {h.group}
                  </span>
                  <div>{h.label}</div>
                  {h.sub ? <div className="muted" style={{ fontSize: 11 }}>{h.sub}</div> : null}
                </span>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
