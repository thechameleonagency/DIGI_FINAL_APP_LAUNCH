import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  Boxes,
  Clock3,
  Package,
  PackagePlus,
  Route,
  Truck,
  Undo2,
  UserPlus,
  Wallet,
} from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../data/db';
import { availableQty, expiryRiskBand, lowStock, stockistReceivables } from '../../../domain/calc';
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
import { useCan } from '../../../store/session';
import { useBiz } from './useBiz';

function toneForCount(n: number, okWhenZero = true) {
  if (n <= 0) return okWhenZero ? ('success' as const) : ('neutral' as const);
  if (n >= 5) return 'danger' as const;
  return 'warning' as const;
}

export function StockistHome() {
  const { business, user } = useBiz();
  const canStaff = useCan('staff.manage');
  const notifications =
    useLiveQuery(() => db.notifications.where('userId').equals(user.id).toArray(), [user.id]) ?? [];
  const slaReminders = notifications.filter((n) => n.code === 'N-048' && n.status === 'Unread');
  const ordersRaw = useLiveQuery(() => db.orders.where('stockistId').equals(business.id).toArray(), [business.id]);
  const homeLoading = ordersRaw === undefined;
  const orders = ordersRaw ?? [];
  const invoices = useLiveQuery(() => db.invoices.where('stockistId').equals(business.id).toArray(), [business.id]) ?? [];
  const payments = useLiveQuery(() => db.payments.where({ stockistId: business.id, status: 'Submitted' }).toArray(), [business.id]) ?? [];
  const returns = useLiveQuery(() => db.returns.where('stockistId').equals(business.id).toArray(), [business.id]) ?? [];
  const deliveries = useLiveQuery(() => db.deliveries.where('stockistId').equals(business.id).toArray(), [business.id]) ?? [];
  const batches = useLiveQuery(() => db.batches.where('stockistId').equals(business.id).toArray(), [business.id]) ?? [];
  const products = useLiveQuery(() => db.products.where('stockistId').equals(business.id).toArray(), [business.id]) ?? [];
  const businesses = useLiveQuery(() => db.businesses.toArray(), []) ?? [];
  const isBoy = user.role === 'DeliveryStaff';
  const bizName = (id: string) => businesses.find((b) => b.id === id)?.name ?? 'Pharmacy';

  const acceptQueue = orders.filter((o) => o.status === 'Pending').length;
  const toPack = orders.filter((o) => o.status === 'Allocated').length;
  const toDispatch = orders.filter((o) => o.status === 'Packed').length;
  const outForDelivery = deliveries.filter((d) => d.status === 'OutForDelivery').length;
  const overdue = invoices.filter(
    (i) => i.status === 'Overdue' || (!!i.dueDate && new Date(i.dueDate) < new Date() && i.outstanding > 0),
  ).length;
  const returnsReview = returns.filter((r) => ['Submitted', 'UnderReview'].includes(r.status)).length;
  const low = batches.filter((b) => {
    const avail = availableQty(b);
    const p = products.find((x) => x.id === b.productId);
    return b.status === 'Available' && (lowStock(avail) || (p?.reorderLevel != null && avail <= p.reorderLevel));
  }).length;
  const near = batches.filter((b) => ['Near', 'Critical'].includes(expiryRiskBand(b.expiryDate))).length;
  const receivables = stockistReceivables(invoices, business.id);

  const myDeliveries = isBoy ? deliveries.filter((d) => d.assignedTo === user.id) : deliveries;
  const boyAssigned = myDeliveries.filter((d) => d.status === 'Assigned').length;
  const boyOut = myDeliveries.filter((d) => d.status === 'OutForDelivery').length;
  const boyDone = myDeliveries.filter((d) => d.status === 'Delivered').length;
  const boyFail = myDeliveries.filter((d) => d.status === 'Failed').length;

  if (isBoy) {
    return (
      <div className="stack">
        <PageHeader title="Delivery board" subtitle="Your assigned work only" />
        <HomeMetricGrid>
          <HomeMetricCard
            title="Assigned"
            value={boyAssigned}
            icon={Truck}
            badge={boyAssigned ? 'Ready to start' : 'Clear'}
            tone={toneForCount(boyAssigned)}
            to="/stockist/delivery"
            linkLabel="Open delivery"
          />
          <HomeMetricCard
            title="Out for delivery"
            value={boyOut}
            icon={Route}
            badge={boyOut ? 'In progress' : 'None active'}
            tone={boyOut ? 'info' : 'success'}
            to="/stockist/delivery"
            linkLabel="Update stops"
          />
          <HomeMetricCard
            title="Completed"
            value={boyDone}
            icon={Package}
            badge="Delivered"
            tone="success"
            to="/stockist/delivery"
            linkLabel="View board"
          />
          <HomeMetricCard
            title="Failed"
            value={boyFail}
            icon={AlertTriangle}
            badge={boyFail ? 'Needs follow-up' : 'No failures'}
            tone={toneForCount(boyFail)}
            to="/stockist/delivery"
            linkLabel="Review failed"
          />
        </HomeMetricGrid>
      </div>
    );
  }

  return (
    <div className="stack">
      <PageHeader title="Stockist home" subtitle="Fulfilment queues and receivables" />
      <BannerStrip placement="Stockist Home" />
      <AnnouncementStrip audience="Stockist" placement="Stockist Home" />
      {homeLoading ? (
        <p className="muted" role="status" style={{ margin: 0 }}>
          Loading workspace…
        </p>
      ) : null}

      <HomeMetricGrid>
        <HomeMetricCard
          title="Accept queue"
          value={acceptQueue}
          icon={Clock3}
          badge={acceptQueue ? 'Orders waiting' : 'Queue clear'}
          tone={toneForCount(acceptQueue)}
          to="/stockist/orders?status=Pending"
          linkLabel="Open accept queue"
          highlight={acceptQueue > 0}
        />
        <HomeMetricCard
          title="To pack"
          value={toPack}
          icon={Package}
          badge={toPack ? 'Allocated stock ready' : 'Nothing to pack'}
          tone={toneForCount(toPack)}
          to="/stockist/orders?status=Allocated"
          linkLabel="Open pack queue"
        />
        <HomeMetricCard
          title="To dispatch"
          value={toDispatch}
          icon={Truck}
          badge={toDispatch ? 'Packed — assign route' : 'Dispatch clear'}
          tone={toneForCount(toDispatch)}
          to="/stockist/orders?status=Packed"
          linkLabel="Open dispatch queue"
        />
        <HomeMetricCard
          title="Out for delivery"
          value={outForDelivery}
          icon={Route}
          badge={outForDelivery ? 'Active on road' : 'No active runs'}
          tone={outForDelivery ? 'info' : 'success'}
          to="/stockist/delivery"
          linkLabel="Open delivery board"
        />
        <HomeMetricCard
          title="Low stock"
          value={low}
          icon={AlertTriangle}
          badge={low ? 'Reorder soon' : 'Stock healthy'}
          tone={toneForCount(low)}
          to="/stockist/inventory?filter=low"
          linkLabel="View low stock"
        />
        <HomeMetricCard
          title="Near expiry"
          value={near}
          icon={Clock3}
          badge={near ? 'Move or discount' : 'No near-expiry'}
          tone={toneForCount(near)}
          to="/stockist/inventory?filter=near-expiry"
          linkLabel="View near expiry"
        />
        <HomeMetricCard
          title="Returns to review"
          value={returnsReview}
          icon={Undo2}
          badge={returnsReview ? 'Pharmacy returns waiting' : 'No open returns'}
          tone={toneForCount(returnsReview)}
          to="/stockist/returns"
          linkLabel="Review returns"
        />
        <HomeMetricCard
          title="Payments to review"
          value={payments.length}
          icon={Wallet}
          badge={payments.length ? 'Submitted — decide' : 'Inbox clear'}
          tone={toneForCount(payments.length)}
          to="/stockist/payments"
          linkLabel="Open payments"
          highlight={payments.length > 0}
        />
        <HomeMetricCard
          title="Overdue receivables"
          value={overdue}
          icon={AlertTriangle}
          badge={overdue ? 'Past due invoices' : 'No overdue'}
          tone={toneForCount(overdue)}
          detail={formatINR(receivables)}
          to="/stockist/payments?status=Overdue"
          linkLabel="View overdue"
        />
        <HomeMetricCard
          title="Receivables"
          value={formatINR(receivables)}
          icon={Wallet}
          badge={receivables > 0 ? 'Outstanding balance' : 'Fully collected'}
          tone={receivables > 0 ? 'info' : 'success'}
          to="/stockist/payments"
          linkLabel="Open money"
        />
        <HomeMetricCard
          title="Catalogue"
          value={products.filter((p) => p.status === 'Active').length}
          icon={Boxes}
          badge="Active SKUs"
          tone="neutral"
          to="/stockist/catalogue"
          linkLabel="Manage catalogue"
        />
        <HomeMetricCard
          title="Pharmacies"
          value="Network"
          icon={PackagePlus}
          badge="Connections & invites"
          tone="neutral"
          to="/stockist/pharmacies"
          linkLabel="Open pharmacies"
        />
      </HomeMetricGrid>

      <QuickActions
        items={
          [
            {
              to: '/stockist/manual-order',
              title: 'Manual order',
              description: 'Record an offline pharmacy order',
              icon: PackagePlus,
              primary: true,
            },
            {
              to: '/stockist/catalogue',
              title: 'Add product',
              description: 'Grow your active catalogue',
              icon: Boxes,
            },
            {
              to: '/stockist/inventory',
              title: 'Stock in',
              description: 'Receive or adjust batch stock',
              icon: Boxes,
            },
            {
              to: '/stockist/delivery',
              title: 'Delivery board',
              description: 'Assign routes and update stops',
              icon: Truck,
            },
            {
              to: '/stockist/payments',
              title: 'Review payments',
              description: 'Approve or hold submissions',
              icon: Wallet,
            },
            {
              to: '/stockist/batch-ordering',
              title: 'Batch plan',
              description: 'Plan fulfilment by route',
              icon: Route,
            },
            ...(canStaff
              ? [
                  {
                    to: '/stockist/staff',
                    title: 'Invite staff',
                    description: 'Add delivery or support users',
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
            badge={`${acceptQueue + toPack + toDispatch + outForDelivery} in progress`}
            stats={[
              { label: 'Accept', value: acceptQueue },
              { label: 'To pack', value: toPack },
              { label: 'Dispatch', value: toDispatch },
              { label: 'On road', value: outForDelivery },
            ]}
            items={[
              ...orders
                .filter((o) => ['Pending', 'Allocated', 'Packed'].includes(o.status))
                .slice(0, 5)
                .map((o) => ({
                  id: o.id,
                  title: bizName(o.pharmacyId),
                  meta: `${o.orderNo} · ${o.status}`,
                  badge: o.status === 'Pending' ? 'Needs accept' : o.status,
                  to: `/stockist/orders/${o.orderNo}`,
                })),
              ...deliveries
                .filter((d) => d.status === 'OutForDelivery')
                .slice(0, 3)
                .map((d) => ({
                  id: d.id,
                  title: bizName(d.pharmacyId),
                  meta: `Delivery · ${d.status}`,
                  badge: 'On Track',
                  to: '/stockist/delivery',
                })),
            ].slice(0, 6)}
            emptyLabel="No fulfilment work queued for today."
            primaryAction={{ to: '/stockist/delivery', label: 'Open delivery board' }}
            secondaryAction={{ to: '/stockist/orders', label: 'All orders' }}
          />
        }
        side={
          <>
            <SupportAlertsPanel
              notifications={notifications}
              notificationsPath="/stockist/notifications"
            />
          </>
        }
      />

      {slaReminders.length ? (
        <div className="card card-pad stack">
          <strong>SLA reminders</strong>
          {slaReminders.slice(0, 5).map((n) => (
            <div key={n.id} style={{ fontSize: 13 }}>
              {n.body}{' '}
              <Link to="/stockist/notifications" style={{ fontSize: 12 }}>
                Open
              </Link>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
