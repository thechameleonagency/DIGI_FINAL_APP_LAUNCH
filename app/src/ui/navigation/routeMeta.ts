import { matchPath } from 'react-router-dom';

export type Crumb = {
  label: string;
  /** When set, segment is a link. Last crumb is never linked. */
  to?: string;
};

type Portal = 'admin' | 'pharmacy' | 'stockist';

type RouteDef = {
  pattern: string;
  /** Build crumbs from matched params. Parent list paths should be linked. */
  crumbs: (params: Record<string, string | undefined>, portal: Portal) => Crumb[];
};

const PORTAL_HOME: Record<Portal, { label: string; to: string }> = {
  admin: { label: 'Admin', to: '/admin' },
  pharmacy: { label: 'Pharmacy', to: '/pharmacy' },
  stockist: { label: 'Stockist', to: '/stockist' },
};

function home(portal: Portal): Crumb {
  return PORTAL_HOME[portal];
}

function decode(v?: string): string {
  if (!v) return '…';
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

/** Module label map for static segments under each portal. */
const MODULE_LABELS: Record<string, string> = {
  verifications: 'Verifications',
  network: 'Network',
  analytics: 'Analytics',
  orders: 'Orders',
  payments: 'Payments',
  plans: 'Plans',
  returns: 'Returns',
  support: 'Support',
  announcements: 'Announcements',
  'announcements-archive': 'Announcement archive',
  banners: 'Banners',
  counterfeit: 'Counterfeit',
  suspensions: 'Suspensions',
  audit: 'Audit',
  reports: 'Reports',
  settings: 'Settings & data',
  appearance: 'Appearance',
  staff: 'Staff',
  profile: 'Profile',
  help: 'Help',
  notifications: 'Notifications',
  buy: 'Buy',
  product: 'Product',
  compare: 'Compare',
  cart: 'Cart',
  wishlist: 'Wishlist',
  'smart-order': 'Smart order',
  history: 'History',
  'quick-order': 'Quick order',
  sales: 'Sales',
  delivery: 'Delivery',
  invoices: 'Invoices',
  inventory: 'Inventory',
  expiry: 'Expiry',
  connections: 'Connections',
  stockists: 'Stockists',
  ledger: 'Ledger',
  activity: 'Activity',
  upgrade: 'Upgrade',
  messages: 'Messages',
  business: 'Business',
  'delivery-preferences': 'Delivery preferences',
  more: 'Settings & data',
  'batch-ordering': 'Batch ordering',
  pharmacies: 'Pharmacies',
  managed: 'Managed',
  invites: 'Invites',
  catalogue: 'Catalogue',
  'price-history': 'Price history',
  movements: 'Movements',
  'bulk-bill': 'Bulk bill',
  procurement: 'Procurement',
  'credit-notes': 'Credit notes',
  'manual-order': 'Manual order',
};

const DETAIL_ROUTES: RouteDef[] = [
  {
    pattern: '/admin/verifications/:id',
    crumbs: (p) => [
      home('admin'),
      { label: 'Verifications', to: '/admin/verifications' },
      { label: decode(p.id).slice(0, 12) },
    ],
  },
  {
    pattern: '/admin/network/:id',
    crumbs: (p) => [
      home('admin'),
      { label: 'Network', to: '/admin/network' },
      { label: decode(p.id).slice(0, 12) },
    ],
  },
  {
    pattern: '/admin/orders/:orderNo',
    crumbs: (p) => [
      home('admin'),
      { label: 'Orders', to: '/admin/orders' },
      { label: decode(p.orderNo) },
    ],
  },
  {
    pattern: '/admin/payments/:paymentNo',
    crumbs: (p) => [
      home('admin'),
      { label: 'Payments', to: '/admin/payments' },
      { label: decode(p.paymentNo) },
    ],
  },
  {
    pattern: '/admin/returns/:returnNo',
    crumbs: (p) => [
      home('admin'),
      { label: 'Returns', to: '/admin/returns' },
      { label: decode(p.returnNo) },
    ],
  },
  {
    pattern: '/admin/support/:id',
    crumbs: (p) => [
      home('admin'),
      { label: 'Support', to: '/admin/support' },
      { label: decode(p.id).slice(0, 12) },
    ],
  },
  {
    pattern: '/pharmacy/orders/:orderNo',
    crumbs: (p) => [
      home('pharmacy'),
      { label: 'Orders', to: '/pharmacy/orders' },
      { label: decode(p.orderNo) },
    ],
  },
  {
    pattern: '/pharmacy/payments/:paymentNo',
    crumbs: (p) => [
      home('pharmacy'),
      { label: 'Payments', to: '/pharmacy/payments' },
      { label: decode(p.paymentNo) },
    ],
  },
  {
    pattern: '/pharmacy/invoices/:invoiceNo',
    crumbs: (p) => [
      home('pharmacy'),
      { label: 'Invoices', to: '/pharmacy/invoices' },
      { label: decode(p.invoiceNo) },
    ],
  },
  {
    pattern: '/pharmacy/returns/:returnNo',
    crumbs: (p) => [
      home('pharmacy'),
      { label: 'Returns', to: '/pharmacy/returns' },
      { label: decode(p.returnNo) },
    ],
  },
  {
    pattern: '/pharmacy/product/:productId',
    crumbs: (p) => [
      home('pharmacy'),
      { label: 'Buy', to: '/pharmacy/buy' },
      { label: 'Product', to: undefined },
      { label: decode(p.productId).slice(0, 12) },
    ],
  },
  {
    pattern: '/pharmacy/buy/:stockistId',
    crumbs: (p) => [
      home('pharmacy'),
      { label: 'Buy', to: '/pharmacy/buy' },
      { label: decode(p.stockistId).slice(0, 12) },
    ],
  },
  {
    pattern: '/pharmacy/stockists/:stockistId',
    crumbs: (p) => [
      home('pharmacy'),
      { label: 'Connections', to: '/pharmacy/connections' },
      { label: decode(p.stockistId).slice(0, 12) },
    ],
  },
  {
    pattern: '/pharmacy/ledger/:stockistId',
    crumbs: (p) => [
      home('pharmacy'),
      { label: 'Connections', to: '/pharmacy/connections' },
      { label: 'Ledger' },
      { label: decode(p.stockistId).slice(0, 12) },
    ],
  },
  {
    pattern: '/pharmacy/sales/:id',
    crumbs: (p) => [
      home('pharmacy'),
      { label: 'Sales', to: '/pharmacy/sales' },
      { label: decode(p.id).slice(0, 12) },
    ],
  },
  {
    pattern: '/pharmacy/support/:id',
    crumbs: (p) => [
      home('pharmacy'),
      { label: 'Support', to: '/pharmacy/support' },
      { label: decode(p.id).slice(0, 12) },
    ],
  },
  {
    pattern: '/pharmacy/smart-order/history',
    crumbs: () => [
      home('pharmacy'),
      { label: 'Smart order', to: '/pharmacy/smart-order' },
      { label: 'History' },
    ],
  },
  {
    pattern: '/stockist/orders/:orderNo',
    crumbs: (p) => [
      home('stockist'),
      { label: 'Orders', to: '/stockist/orders' },
      { label: decode(p.orderNo) },
    ],
  },
  {
    pattern: '/stockist/invoices/:invoiceNo',
    crumbs: (p) => [
      home('stockist'),
      { label: 'Payments', to: '/stockist/payments' },
      { label: decode(p.invoiceNo) },
    ],
  },
  {
    pattern: '/stockist/returns/:returnNo',
    crumbs: (p) => [
      home('stockist'),
      { label: 'Returns', to: '/stockist/returns' },
      { label: decode(p.returnNo) },
    ],
  },
  {
    pattern: '/stockist/pharmacies/managed/:managedId',
    crumbs: (p) => [
      home('stockist'),
      { label: 'Pharmacies', to: '/stockist/pharmacies' },
      { label: 'Managed' },
      { label: decode(p.managedId).slice(0, 12) },
    ],
  },
  {
    pattern: '/stockist/pharmacies/:pharmacyId',
    crumbs: (p) => [
      home('stockist'),
      { label: 'Pharmacies', to: '/stockist/pharmacies' },
      { label: decode(p.pharmacyId).slice(0, 12) },
    ],
  },
  {
    pattern: '/stockist/support/:id',
    crumbs: (p) => [
      home('stockist'),
      { label: 'Support', to: '/stockist/support' },
      { label: decode(p.id).slice(0, 12) },
    ],
  },
];

function staticCrumbs(pathname: string, portal: Portal): Crumb[] | null {
  const prefix = `/${portal}`;
  if (pathname === prefix || pathname === `${prefix}/`) {
    return [{ label: 'Home' }];
  }
  if (!pathname.startsWith(`${prefix}/`)) return null;

  const rest = pathname.slice(prefix.length + 1).split('/').filter(Boolean);
  if (!rest.length) return [{ label: 'Home' }];

  const crumbs: Crumb[] = [home(portal)];
  let acc = prefix;
  for (let i = 0; i < rest.length; i++) {
    const seg = rest[i];
    acc += `/${seg}`;
    const label = MODULE_LABELS[seg] ?? seg;
    const isLast = i === rest.length - 1;
    crumbs.push(isLast ? { label } : { label, to: acc });
  }
  return crumbs;
}

/** Resolve breadcrumb trail for the current pathname within a portal. */
export function resolveBreadcrumbs(pathname: string, portal: Portal): Crumb[] {
  const path = pathname.split('?')[0] || pathname;

  for (const def of DETAIL_ROUTES) {
    const m = matchPath({ path: def.pattern, end: true }, path);
    if (m) {
      const crumbs = def.crumbs(m.params as Record<string, string | undefined>, portal);
      // Ensure last crumb is never a link
      if (crumbs.length) {
        const last = crumbs[crumbs.length - 1];
        crumbs[crumbs.length - 1] = { label: last.label };
      }
      return crumbs;
    }
  }

  return staticCrumbs(path, portal) ?? [home(portal)];
}

/** Parent path for "Back" — previous crumb with a `to`, else portal home. */
export function resolveParentPath(pathname: string, portal: Portal): string | null {
  const crumbs = resolveBreadcrumbs(pathname, portal);
  if (crumbs.length <= 1) return null;
  for (let i = crumbs.length - 2; i >= 0; i--) {
    if (crumbs[i].to) return crumbs[i].to!;
  }
  return PORTAL_HOME[portal].to;
}
