import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  Bell,
  Clock3,
  PackageCheck,
  ShoppingBag,
  Store,
  Truck,
  Undo2,
  UserPlus,
  WalletCards,
} from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../data/db';
import { expiryRiskBand, lowStock, pharmacyOutstanding, remainingCredit } from '../../../domain/calc';
import { formatINR } from '../../../domain/utils/money';
import { AnnouncementStrip } from '../../../ui/components/AnnouncementStrip';
import { BannerStrip } from '../../../ui/components/BannerStrip';
import {
  HomeDashboardLayout,
  SupportAlertsPanel,
  TodaysActivityPanel,
} from '../../../ui/components/HomeActivityPanels';
import { HomeMetricCard, HomeMetricGrid } from '../../../ui/components/HomeMetrics';
import { QuickActions, type QuickActionItem } from '../../../ui/components/QuickActions';
import { PageHeader } from '../../../ui/components/primitives';
import { useBiz } from './useBiz';
import { useCan, useSession } from '../../../store/session';

function toneForCount(n: number, okWhenZero = true) {
  if (n <= 0) return okWhenZero ? ('success' as const) : ('neutral' as const);
  if (n >= 5) return 'danger' as const;
  return 'warning' as const;
}

export function PharmacyHome() {
  const { business } = useBiz();
  const { user } = useSession();
  const canSale = useCan('sale.record');
  const canStaff = useCan('staff.manage');
  const isDeliveryStaff = user?.role === 'DeliveryStaff';
  const orders = useLiveQuery(() => db.orders.where('pharmacyId').equals(business.id).toArray(), [business.id]) ?? [];
  const invoices = useLiveQuery(() => db.invoices.where('pharmacyId').equals(business.id).toArray(), [business.id]) ?? [];
  const connectionsRaw = useLiveQuery(
    () => db.connections.where('pharmacyId').equals(business.id).toArray(),
    [business.id],
  );
  const connectionsLoading = connectionsRaw === undefined;
  const connections = connectionsRaw ?? [];
  const returns = useLiveQuery(() => db.returns.where('pharmacyId').equals(business.id).toArray(), [business.id]) ?? [];
  const credits = useLiveQuery(() => db.creditNotes.where('pharmacyId').equals(business.id).toArray(), [business.id]) ?? [];
  const inventory = useLiveQuery(() => db.pharmacyInventory.where('pharmacyId').equals(business.id).toArray(), [business.id]) ?? [];
  const notifications =
    useLiveQuery(
      () => (user ? db.notifications.where('userId').equals(user.id).toArray() : []),
      [user?.id],
    ) ?? [];
  const businesses = useLiveQuery(() => db.businesses.toArray(), []) ?? [];
  const bizName = (id: string) => businesses.find((b) => b.id === id)?.name ?? 'Stockist';

  const awaitingDelivery = orders.filter((o) => ['Packed', 'Dispatched'].includes(o.status)).length;
  const overdue = invoices.filter(
    (i) => i.status === 'Overdue' || (!!i.dueDate && new Date(i.dueDate) < new Date() && i.outstanding > 0),
  ).length;
  const openReturns = returns.filter((r) => !['Closed', 'Rejected', 'Cancelled'].includes(r.status)).length;
  const availableCredit = credits.reduce((s, c) => s + remainingCredit(c), 0);
  const low = inventory.filter((i) => lowStock(i.onHand)).length;
  const near = inventory.filter((i) => i.expiryDate && ['Near', 'Critical', 'Expired'].includes(expiryRiskBand(i.expiryDate))).length;
  const activeConn = connections.filter((c) => c.status === 'Active').length;
  const outstanding = pharmacyOutstanding(invoices, business.id);
  const openOrders = orders.filter((o) => !['Delivered', 'Cancelled', 'Rejected', 'Closed'].includes(o.status)).length;

  if (isDeliveryStaff) {
    return (
      <div className="stack">
        <PageHeader title="Delivery home" subtitle="Customer home-delivery routes assigned to you" />
        <BannerStrip placement="Pharmacy Home" />
        <HomeMetricGrid>
          <HomeMetricCard
            title="Delivery board"
            value="Routes"
            icon={Truck}
            badge="Update stop status"
            tone="info"
            to="/pharmacy/delivery"
            linkLabel="Open delivery board"
            highlight
          />
        </HomeMetricGrid>
      </div>
    );
  }

  const verified = business.verificationStatus === 'Approved';
  const connected = activeConn > 0;
  const ordered = orders.length > 0;
  const paid = invoices.some((i) => i.paidAmount > 0);
  const setupDone = verified && connected && ordered && paid;

  return (
    <div className="stack">
      <PageHeader title="Pharmacy home" subtitle="Purchasing queues, payables, and next actions" />
      <BannerStrip placement="Pharmacy Home" />
      <AnnouncementStrip audience="Pharmacy" placement="Pharmacy Home" />
      {connectionsLoading ? (
        <p className="muted" role="status" style={{ margin: 0 }}>
          Loading workspace…
        </p>
      ) : !activeConn ? (
        <div className="banner-strip warning">
          No active stockist connections yet.{' '}
          <Link to="/pharmacy/connections">Find and connect</Link> to start ordering.
        </div>
      ) : null}

      <HomeMetricGrid>
        <HomeMetricCard
          title="Awaiting delivery"
          value={awaitingDelivery}
          icon={Truck}
          badge={awaitingDelivery ? 'Receive when it arrives' : 'Nothing inbound'}
          tone={awaitingDelivery ? 'info' : 'success'}
          to="/pharmacy/orders?awaiting=1"
          linkLabel="Open receive queue"
          highlight={awaitingDelivery > 0}
        />
        <HomeMetricCard
          title="Open orders"
          value={openOrders}
          icon={ShoppingBag}
          badge={openOrders ? 'In progress with stockists' : 'No open orders'}
          tone={openOrders ? 'neutral' : 'success'}
          to="/pharmacy/orders"
          linkLabel="View orders"
        />
        <HomeMetricCard
          title="Overdue payables"
          value={overdue}
          icon={AlertTriangle}
          badge={overdue ? 'Pay these first' : 'No overdue'}
          tone={toneForCount(overdue)}
          detail={formatINR(outstanding)}
          to="/pharmacy/payments?status=Overdue"
          linkLabel="Pay overdue"
        />
        <HomeMetricCard
          title="Outstanding"
          value={formatINR(outstanding)}
          icon={WalletCards}
          badge={outstanding > 0 ? 'Open invoice balance' : 'Cleared'}
          tone={outstanding > 0 ? 'info' : 'success'}
          to="/pharmacy/payments"
          linkLabel="Open payments"
        />
        <HomeMetricCard
          title="Open returns"
          value={openReturns}
          icon={Undo2}
          badge={openReturns ? 'Track with stockist' : 'No open returns'}
          tone={toneForCount(openReturns)}
          to="/pharmacy/returns"
          linkLabel="View returns"
        />
        <HomeMetricCard
          title="Available credit"
          value={formatINR(availableCredit)}
          icon={WalletCards}
          badge={availableCredit > 0 ? 'Apply to invoices' : 'No credit notes'}
          tone={availableCredit > 0 ? 'success' : 'neutral'}
          to="/pharmacy/payments?tab=Credits"
          linkLabel="Apply credit"
        />
        <HomeMetricCard
          title="Low stock"
          value={low}
          icon={AlertTriangle}
          badge={low ? 'Reorder soon' : 'Stock healthy'}
          tone={toneForCount(low)}
          to="/pharmacy/inventory?filter=low"
          linkLabel="View low stock"
        />
        <HomeMetricCard
          title="Near expiry"
          value={near}
          icon={Clock3}
          badge={near ? 'Move or return' : 'No near-expiry'}
          tone={toneForCount(near)}
          to="/pharmacy/expiry"
          linkLabel="Open expiry"
        />
        <HomeMetricCard
          title="Connections"
          value={activeConn}
          icon={Store}
          badge={activeConn ? 'Active stockists' : 'Connect to buy'}
          tone={activeConn ? 'success' : 'warning'}
          to="/pharmacy/connections"
          linkLabel="Manage connections"
        />
        <HomeMetricCard
          title="Unread alerts"
          value={notifications.filter((n) => n.status === 'Unread').length}
          icon={Bell}
          badge={
            notifications.some((n) => n.status === 'Unread') ? 'Needs attention' : 'Inbox clear'
          }
          tone={toneForCount(notifications.filter((n) => n.status === 'Unread').length)}
          to="/pharmacy/notifications"
          linkLabel="Open notifications"
        />
      </HomeMetricGrid>

      <QuickActions
        items={
          [
            {
              to: '/pharmacy/buy',
              title: 'New order',
              description: 'Browse connected stockist catalogues',
              icon: ShoppingBag,
              primary: true,
            },
            ...(canSale
              ? [
                  {
                    to: '/pharmacy/sales',
                    title: 'Record sale',
                    description: 'POS sale to a walk-in customer',
                    icon: PackageCheck,
                  },
                ]
              : []),
            {
              to: '/pharmacy/payments',
              title: 'Pay invoices',
              description: 'Submit proof against outstanding bills',
              icon: WalletCards,
            },
            {
              to: '/pharmacy/connections',
              title: 'Connect stockist',
              description: 'Find and request new suppliers',
              icon: Store,
            },
            ...(canStaff
              ? [
                  {
                    to: '/pharmacy/staff',
                    title: 'Invite staff',
                    description: 'Share pharmacy access with your team',
                    icon: UserPlus,
                  },
                ]
              : []),
          ] satisfies QuickActionItem[]
        }
      />

      <HomeDashboardLayout
        main={
          <TodaysActivityPanel
            badge={`${openOrders} open`}
            stats={[
              { label: 'Inbound', value: awaitingDelivery },
              { label: 'Open orders', value: openOrders },
              { label: 'Overdue', value: overdue },
              { label: 'Low stock', value: low },
            ]}
            items={orders
              .filter((o) => !['Delivered', 'Cancelled', 'Rejected', 'Closed'].includes(o.status))
              .slice(0, 6)
              .map((o) => ({
                id: o.id,
                title: bizName(o.stockistId),
                meta: `${o.orderNo} · ${o.status}`,
                badge: ['Packed', 'Dispatched'].includes(o.status) ? 'Receive soon' : o.status,
                to: `/pharmacy/orders/${o.orderNo}`,
              }))}
            emptyLabel="No open orders for today."
            primaryAction={{ to: '/pharmacy/orders', label: 'Open orders' }}
            secondaryAction={{ to: '/pharmacy/buy', label: 'New order' }}
          />
        }
        side={
          <SupportAlertsPanel
            notifications={notifications}
            notificationsPath="/pharmacy/notifications"
          />
        }
      />

      {!setupDone ? (
        <div className="card card-pad stack">
          <strong>Setup checklist</strong>
          <label style={{ fontSize: 13 }}>
            <input type="checkbox" readOnly checked={verified} /> Verify business
          </label>
          <label style={{ fontSize: 13 }}>
            <input type="checkbox" readOnly checked={connected} /> Connect to a stockist
          </label>
          <label style={{ fontSize: 13 }}>
            <input type="checkbox" readOnly checked={ordered} /> Place first order
          </label>
          <label style={{ fontSize: 13 }}>
            <input type="checkbox" readOnly checked={paid} /> Submit a payment
          </label>
        </div>
      ) : null}
    </div>
  );
}
