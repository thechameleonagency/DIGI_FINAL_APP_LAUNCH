import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Search } from 'lucide-react';
import { db } from '../../data/db';
import type { Business, Invoice, Order, Payment, Product, ReturnRequest } from '../../domain/entities/types';
import { useSession } from '../../store/session';
import { Input } from './primitives';

type Hit = { label: string; sub?: string; to: string; group: string };

const EMPTY_ORDERS: Order[] = [];
const EMPTY_INVOICES: Invoice[] = [];
const EMPTY_PAYMENTS: Payment[] = [];
const EMPTY_RETURNS: ReturnRequest[] = [];
const EMPTY_PRODUCTS: Product[] = [];
const EMPTY_BUSINESSES: Business[] = [];

export function GlobalSearch({ portal }: { portal: 'pharmacy' | 'stockist' | 'admin' }) {
  const { business } = useSession();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  // PF-01: only subscribe while the search surface is active
  const searching = open || expanded || q.trim().length > 0;

  const orders = useLiveQuery(() => (searching ? db.orders.toArray() : EMPTY_ORDERS), [searching]) ?? EMPTY_ORDERS;
  const invoices =
    useLiveQuery(() => (searching ? db.invoices.toArray() : EMPTY_INVOICES), [searching]) ?? EMPTY_INVOICES;
  const payments =
    useLiveQuery(() => (searching ? db.payments.toArray() : EMPTY_PAYMENTS), [searching]) ?? EMPTY_PAYMENTS;
  const returns =
    useLiveQuery(() => (searching ? db.returns.toArray() : EMPTY_RETURNS), [searching]) ?? EMPTY_RETURNS;
  const products =
    useLiveQuery(() => (searching ? db.products.toArray() : EMPTY_PRODUCTS), [searching]) ?? EMPTY_PRODUCTS;
  const businesses =
    useLiveQuery(() => (searching ? db.businesses.toArray() : EMPTY_BUSINESSES), [searching]) ?? EMPTY_BUSINESSES;

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
          to:
            portal === 'admin'
              ? `/admin/payments?invoice=${encodeURIComponent(i.invoiceNo)}`
              : `/${portal}/invoices/${encodeURIComponent(i.invoiceNo)}`,
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
          to:
            portal === 'admin'
              ? `/admin/payments/${encodeURIComponent(p.paymentNo)}`
              : `/${portal}/payments?payment=${encodeURIComponent(p.paymentNo)}`,
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
            to: portal === 'pharmacy' ? `/pharmacy/stockists/${b.id}` : `/stockist/pharmacies/${b.id}`,
          });
        }
      }
    }

    return out.slice(0, 25);
  }, [q, business, portal, orders, invoices, payments, returns, products, businesses]);

  useEffect(() => {
    setActive(0);
  }, [q]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);
      if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setExpanded(true);
        setOpen(true);
        window.setTimeout(() => inputRef.current?.focus(), 0);
        return;
      }
      if (e.key === '/' && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setExpanded(true);
        setOpen(true);
        window.setTimeout(() => inputRef.current?.focus(), 0);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const go = (hit: Hit) => {
    navigate(hit.to);
    setQ('');
    setOpen(false);
    setActive(0);
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setOpen(false);
      setExpanded(false);
      e.currentTarget.blur();
      return;
    }
    if (!open || !hits.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(hits.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const hit = hits[active] ?? hits[0];
      if (hit) go(hit);
    }
  };

  return (
    <div ref={rootRef} className={`global-search${expanded ? ' is-expanded' : ''}`}>
      <button
        type="button"
        className="btn btn-secondary btn-sm global-search-toggle"
        aria-label="Open search"
        onClick={() => {
          setExpanded(true);
          setOpen(true);
          window.setTimeout(() => inputRef.current?.focus(), 0);
        }}
      >
        <Search size={16} />
      </button>
      <div className="row global-search-field" style={{ gap: 6 }}>
        <Search size={14} style={{ color: 'var(--muted)' }} aria-hidden />
        <Input
          ref={inputRef}
          aria-label="Global search"
          aria-expanded={open && !!q.trim()}
          aria-controls="global-search-results"
          aria-autocomplete="list"
          aria-activedescendant={
            open && q.trim() && hits[active] ? `global-search-option-${active}` : undefined
          }
          role="combobox"
          placeholder="Search… (/ or ⌘K)"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          onBlur={(e) => {
            const next = e.relatedTarget as Node | null;
            if (next && rootRef.current?.contains(next)) return;
            window.setTimeout(() => {
              setOpen(false);
              if (!q.trim()) setExpanded(false);
            }, 120);
          }}
        />
      </div>
      {open && q.trim() ? (
        <div
          id="global-search-results"
          role="listbox"
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
                id={`global-search-option-${i}`}
                type="button"
                role="option"
                aria-selected={i === active}
                className="btn btn-ghost btn-sm"
                style={{
                  width: '100%',
                  justifyContent: 'flex-start',
                  textAlign: 'left',
                  background: i === active ? 'var(--subtle)' : undefined,
                }}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => go(h)}
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
