import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../data/db';
import { normalizeHolidays } from '../../../domain/calc/deliveryCommerce';
import type { DeliveryRule, DeliveryRuleType, HolidayEntry, PinDeliverySetting, Weekday } from '../../../domain/entities/types';
import { localTodayKey } from '../../../domain/utils/dateKeys';
import { formatINR } from '../../../domain/utils/money';
import { updateBusiness } from '../../../services/businessService';
import {
  getDeliveryRules,
  replaceDeliveryDates,
  replaceDeliveryRules,
  replacePinDeliverySettings,
} from '../../../services/deliveryCommerceService';
import {
  assignDelivery,
  returnFailedDeliveryToStockist,
  updateDeliveryStatus,
} from '../../../services/fulfilmentService';
import {
  deleteStockistRoute,
  mapsDeepLink,
  mapsDirectionsLink,
  optimizeStopOrder,
  scheduleDelivery,
  setRouteStops,
  upsertStockistRoute,
} from '../../../services/routeService';
import { useCan } from '../../../store/session';
import { useUi } from '../../../store/ui';
import { ConfirmDialog } from '../../../ui/components/ConfirmDialog';
import { FileLink, FileUpload } from '../../../ui/components/FileUpload';
import { usePersistedPageSize } from '../../../ui/hooks/usePersistedPageSize';
import { ListPageChrome } from '../../../ui/components/ListPageChrome';
import { ListToolbar, PaginationBar, useListControls, useTableSectionRef } from '../../../ui/components/ListToolkit';
import { PharmacyDeliveryPrefs } from '../../../ui/components/PharmacyDeliveryPrefs';
import { useLiveArray } from '../../../ui/hooks/useLiveArray';
import { Button, DeleteButton, EmptyState, Field, Input, LoadingState, Modal, Select, StatusBadge } from '../../../ui/components/primitives';
import { useBiz } from './useBiz';

const WEEKDAYS: Weekday[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const RULE_TYPES: DeliveryRuleType[] = ['order_amount', 'flat_fee', 'delivery_date', 'distance'];

type DeliveryTab = 'Board' | 'Routes' | 'Execute' | 'Dates' | 'Fees' | 'PINs' | 'Holidays';

type RuleDraft = Omit<DeliveryRule, 'id' | 'stockistId'> & { key: string };
type PinDraft = Omit<PinDeliverySetting, 'id' | 'stockistId'> & { key: string };

export function StockistDelivery() {
  const { business, user } = useBiz();
  const { pageSize, setPageSize } = usePersistedPageSize('stockist-delivery');
  const tableRef = useTableSectionRef();
  const { pushToast } = useUi();
  const canAssign = useCan('delivery.assign');
  const canRoutes = useCan('route.manage');
  const { items: deliveries, loading: deliveriesLoading } = useLiveArray(
    () => db.deliveries.where('stockistId').equals(business.id).toArray(),
    [business.id],
  );
  const pharmacies = useLiveQuery(() => db.businesses.where('type').equals('Pharmacy').toArray()) ?? [];
  const orders = useLiveQuery(() => db.orders.where('stockistId').equals(business.id).toArray(), [business.id]) ?? [];
  const staff = useLiveQuery(
    () => db.users.where('businessId').equals(business.id).filter((u) => u.role === 'DeliveryStaff' && u.status === 'Active').toArray(),
    [business.id],
  ) ?? [];
  const routes =
    useLiveQuery(() => db.stockistRoutes.where('stockistId').equals(business.id).toArray(), [business.id]) ?? [];
  const isBoy = user.role === 'DeliveryStaff';
  const visible = isBoy ? deliveries.filter((d) => d.assignedTo === user.id) : deliveries;

  const [tab, setTab] = useState<DeliveryTab>(isBoy ? 'Execute' : 'Board');
  const [failId, setFailId] = useState<string | null>(null);
  const [deleteRouteId, setDeleteRouteId] = useState<string | null>(null);
  const [restockId, setRestockId] = useState<string | null>(null);
  const restockDelivery = restockId ? deliveries.find((d) => d.id === restockId) : undefined;
  const restockOrder = restockDelivery ? orders.find((o) => o.id === restockDelivery.orderId) : undefined;
  const restockQtySummary = (restockOrder?.lines ?? [])
    .map((l) => {
      const qty = (l.batchAllocations ?? []).reduce((s, a) => s + a.qty, 0) || l.qty;
      return `${l.productName}: ${qty}`;
    })
    .join(', ');

  const [partialId, setPartialId] = useState<string | null>(null);
  const [partialQtys, setPartialQtys] = useState<Record<string, number>>({});
  const [deliverId, setDeliverId] = useState<string | null>(null);
  const [podFileId, setPodFileId] = useState<string | undefined>();
  const [receivedBy, setReceivedBy] = useState('');
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [routeName, setRouteName] = useState('');
  const [routePins, setRoutePins] = useState('');
  const [routeAssignee, setRouteAssignee] = useState('');
  const [editRouteId, setEditRouteId] = useState<string | null>(null);
  const [routeModalOpen, setRouteModalOpen] = useState(false);
  const [assignStopsModalOpen, setAssignStopsModalOpen] = useState(false);
  const [stopPickRoute, setStopPickRoute] = useState('');
  const [selectedStops, setSelectedStops] = useState<string[]>([]);
  const [execRouteId, setExecRouteId] = useState('');

  const liveDates =
    useLiveQuery(() => db.deliveryDates.where('stockistId').equals(business.id).toArray(), [business.id]) ?? [];
  const livePins =
    useLiveQuery(() => db.pinDeliverySettings.where('stockistId').equals(business.id).toArray(), [business.id]) ??
    [];
  const liveBiz = useLiveQuery(() => db.businesses.get(business.id), [business.id]) ?? business;

  const [datesDraft, setDatesDraft] = useState('');
  const [ruleDrafts, setRuleDrafts] = useState<RuleDraft[]>([]);
  const [pinDrafts, setPinDrafts] = useState<PinDraft[]>([]);
  const [holidayDrafts, setHolidayDrafts] = useState<HolidayEntry[]>([]);

  useEffect(() => {
    setDatesDraft(
      liveDates
        .slice()
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((d) => d.date)
        .join(', '),
    );
  }, [liveDates]);

  useEffect(() => {
    void getDeliveryRules(business.id).then((rules) => {
      setRuleDrafts(
        rules.map((r, i) => ({
          key: r.id || `r-${i}`,
          ruleType: r.ruleType,
          priority: r.priority,
          active: r.active,
          minOrderAmount: r.minOrderAmount,
          flatFee: r.flatFee,
          freeOnDeliveryDate: r.freeOnDeliveryDate,
          perKmCharge: r.perKmCharge,
          baseDistanceKm: r.baseDistanceKm,
        })),
      );
    });
  }, [business.id, liveBiz.preferences?.deliveryFeeFlat, liveBiz.preferences?.deliveryFeeFreeAbove]);

  useEffect(() => {
    const pins = liveBiz.servicePins?.length ? liveBiz.servicePins : [liveBiz.pincode].filter(Boolean);
    setPinDrafts(
      pins.map((pinCode) => {
        const existing = livePins.find((p) => p.pinCode === pinCode);
        return {
          key: pinCode,
          pinCode,
          deliveryDays: existing?.deliveryDays?.length ? [...existing.deliveryDays] : (['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] as Weekday[]),
          deliveryCharge: existing?.deliveryCharge ?? liveBiz.preferences?.deliveryFeeFlat ?? 0,
          freeAbove: existing?.freeAbove ?? liveBiz.preferences?.deliveryFeeFreeAbove,
          estimatedHours: existing?.estimatedHours ?? 24,
        };
      }),
    );
  }, [livePins, liveBiz.servicePins, liveBiz.pincode, liveBiz.preferences?.deliveryFeeFlat, liveBiz.preferences?.deliveryFeeFreeAbove]);

  useEffect(() => {
    setHolidayDrafts(normalizeHolidays(liveBiz.holidays, liveBiz.holidayEntries));
  }, [liveBiz.holidays, liveBiz.holidayEntries]);

  const pharmacyName = (id: string) => pharmacies.find((p) => p.id === id)?.name ?? id.slice(0, 8);
  const orderNo = (orderId: string) => orders.find((o) => o.id === orderId)?.orderNo ?? orderId.slice(0, 8);
  const assigneeName = (id?: string) => (id ? staff.find((s) => s.id === id)?.name ?? id.slice(0, 6) : 'Unassigned');

  const columns = useMemo(
    () => [
      {
        key: 'deliveryNo',
        label: 'Delivery',
        getValue: (d: (typeof deliveries)[0]) => d.deliveryNo,
      },
      {
        key: 'pharmacy',
        label: 'Pharmacy',
        getValue: (d: (typeof deliveries)[0]) => pharmacyName(d.pharmacyId),
      },
      {
        key: 'status',
        label: 'Status',
        getValue: (d: (typeof deliveries)[0]) => d.status,
        render: (d: (typeof deliveries)[0]) => <StatusBadge status={d.status} />,
      },
      {
        key: 'assignee',
        label: 'Assignee',
        getValue: (d: (typeof deliveries)[0]) => assigneeName(d.assignedTo),
      },
      {
        key: 'createdAt',
        label: 'Created',
        getValue: (d: (typeof deliveries)[0]) => d.createdAt,
        render: (d: (typeof deliveries)[0]) => <span className="muted">{new Date(d.createdAt).toLocaleDateString()}</span>,
      },
    ],
    [pharmacies, staff],
  );

  const list = useListControls(visible, {
    columns,
    searchKeys: [(d) => `${d.deliveryNo} ${pharmacyName(d.pharmacyId)} ${orderNo(d.orderId)} ${assigneeName(d.assignedTo)}`],
    filters: [
      {
        key: 'status',
        label: 'Status',
        options: ['Created', 'Assigned', 'OutForDelivery', 'PartiallyDelivered', 'Delivered', 'Failed', 'Cancelled'].map((s) => ({
          value: s,
          label: s,
        })),
      },
      {
        key: 'assignee',
        label: 'Assignee',
        options: [
          { value: 'Unassigned', label: 'Unassigned' },
          ...staff.map((s) => ({ value: s.name, label: s.name })),
        ],
      },
    ],
    defaultSortKey: 'createdAt',
    defaultSortDir: 'desc',
    pageSize,
    onPageSizeChange: setPageSize,
  });

  const partialDelivery = partialId ? deliveries.find((d) => d.id === partialId) : undefined;
  const deliverTarget = deliverId ? deliveries.find((d) => d.id === deliverId) : undefined;
  const historyTarget = historyId ? deliveries.find((d) => d.id === historyId) : undefined;

  const boyRoutes = isBoy
    ? routes.filter(
        (r) =>
          r.assigneeId === user.id ||
          r.stops.some((s) => deliveries.find((d) => d.id === s.deliveryId)?.assignedTo === user.id),
      )
    : routes;
  const execRoute =
    routes.find((r) => r.id === execRouteId) ?? (isBoy ? boyRoutes[0] : undefined);
  const execStops = (execRoute?.stops ?? [])
    .slice()
    .sort((a, b) => a.seq - b.seq)
    .map((s) => deliveries.find((d) => d.id === s.deliveryId))
    .filter((d): d is NonNullable<typeof d> => !!d && (!isBoy || d.assignedTo === user.id));

  const closeRouteModal = () => {
    setRouteModalOpen(false);
    setEditRouteId(null);
    setRouteName('');
    setRoutePins('');
    setRouteAssignee('');
  };

  const openEditRoute = (r: (typeof routes)[0]) => {
    setEditRouteId(r.id);
    setRouteName(r.name);
    setRoutePins(r.pins.join(', '));
    setRouteAssignee(r.assigneeId ?? '');
    setRouteModalOpen(true);
  };

  const stopMetaForIds = (deliveryIds: string[]) =>
    deliveryIds.map((deliveryId) => {
      const d = deliveries.find((x) => x.id === deliveryId);
      const pharmacy = pharmacies.find((p) => p.id === d?.pharmacyId);
      const order = orders.find((o) => o.id === d?.orderId);
      return {
        deliveryId,
        latitude: pharmacy?.latitude,
        longitude: pharmacy?.longitude,
        pincode: order?.deliveryAddress?.pincode ?? pharmacy?.pincode,
        address: order?.deliveryAddress
          ? `${order.deliveryAddress.line1}, ${order.deliveryAddress.city} ${order.deliveryAddress.pincode}`
          : pharmacy
            ? `${pharmacy.address}, ${pharmacy.city}`
            : '',
      };
    });

  const optimizeRouteStops = async (routeId: string, deliveryIds: string[]) => {
    const ordered = optimizeStopOrder({
      origin: {
        latitude: liveBiz.preferences?.dispatchLatitude ?? liveBiz.latitude,
        longitude: liveBiz.preferences?.dispatchLongitude ?? liveBiz.longitude,
      },
      stops: stopMetaForIds(deliveryIds),
    });
    const res = await setRouteStops({
      actor: user,
      stockist: business,
      routeId,
      deliveryIds: ordered,
    });
    if (!res.ok) {
      pushToast({ tone: 'error', title: res.message });
      return;
    }
    const addrs = stopMetaForIds(ordered)
      .map((s) => s.address)
      .filter(Boolean);
    pushToast({ tone: 'success', title: 'Stops optimized', message: `${ordered.length} stop(s)` });
    if (addrs.length) window.open(mapsDirectionsLink(addrs), '_blank', 'noreferrer');
  };

  return (
    <ListPageChrome
      title={isBoy ? 'My delivery board' : 'Delivery'}
      subtitle="Board, routes, dates, fees & route execution"
      tabs={
        isBoy
          ? [
              { id: 'Board', label: 'Board' },
              { id: 'Execute', label: 'Execute' },
            ]
          : [
              { id: 'Board', label: 'Board' },
              { id: 'Routes', label: 'Routes' },
              { id: 'Dates', label: 'Dates' },
              { id: 'Fees', label: 'Fees' },
              { id: 'PINs', label: 'PINs' },
              { id: 'Holidays', label: 'Holidays' },
              { id: 'Execute', label: 'Execute' },
            ]
      }
      tab={tab}
      onTab={(id) => setTab(id as DeliveryTab)}
    >
      <ConfirmDialog
        open={!!failId}
        title="Mark delivery failed"
        body="Record why the delivery could not be completed."
        requireReason
        reasonLabel="Failure reason"
        tone="danger"
        confirmLabel="Mark failed"
        onClose={() => setFailId(null)}
        onConfirm={async (reason) => {
          const res = await updateDeliveryStatus({
            actor: user,
            stockist: business,
            deliveryId: failId!,
            status: 'Failed',
            failReason: reason!,
          });
          pushToast(res.ok ? { tone: 'warning', title: 'Delivery failed' } : { tone: 'error', title: res.message });
          setFailId(null);
        }}
      />
      <ConfirmDialog
        open={!!deleteRouteId}
        title="Delete route?"
        body="This removes the route definition. Assigned deliveries are not cancelled."
        confirmLabel="Delete route"
        tone="danger"
        onClose={() => setDeleteRouteId(null)}
        onConfirm={async () => {
          const res = await deleteStockistRoute({ actor: user, stockist: business, id: deleteRouteId! });
          pushToast(res.ok ? { tone: 'info', title: 'Deleted' } : { tone: 'error', title: res.message });
          if (res.ok) setDeleteRouteId(null);
        }}
      />
      <ConfirmDialog
        open={!!restockDelivery}
        title="Return stock to inventory?"
        confirmLabel="Restock now"
        body={
          restockDelivery ? (
            <p>
              Restock failed delivery <strong>{restockDelivery.deliveryNo}</strong>
              {restockQtySummary ? (
                <>
                  {' '}
                  — quantities: <strong>{restockQtySummary}</strong>
                </>
              ) : null}
              . Batch on-hand will increase.
            </p>
          ) : null
        }
        onClose={() => setRestockId(null)}
        onConfirm={async () => {
          if (!restockDelivery) return;
          const res = await returnFailedDeliveryToStockist({
            actor: user,
            stockist: business,
            deliveryId: restockDelivery.id,
          });
          pushToast(
            res.ok
              ? { tone: 'success', title: 'Returned to stockist', message: 'Stock restocked' }
              : { tone: 'error', title: res.message },
          );
          if (res.ok) setRestockId(null);
        }}
      />

      <Modal
        open={!!partialId}
        title="Partial delivery"
        onClose={() => setPartialId(null)}
        footer={
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setPartialId(null)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                const res = await updateDeliveryStatus({
                  actor: user,
                  stockist: business,
                  deliveryId: partialId!,
                  status: 'PartiallyDelivered',
                  deliveredQtys: partialQtys,
                });
                pushToast(res.ok ? { tone: 'success', title: 'Partial delivery recorded' } : { tone: 'error', title: res.message });
                setPartialId(null);
              }}
            >
              Save partial
            </Button>
          </div>
        }
      >
        <div className="stack">
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            Starts at full ordered qty. Lower only the lines that were short-delivered.
          </p>
          {partialDelivery?.lines.map((l) => (
            <Field key={l.productId} label={`${l.productName} (ordered ${l.qty})`}>
              <Input
                type="number"
                min={0}
                max={l.qty}
                value={partialQtys[l.productId] ?? l.deliveredQty ?? l.qty}
                onChange={(e) => setPartialQtys((prev) => ({ ...prev, [l.productId]: Number(e.target.value) }))}
              />
            </Field>
          ))}
        </div>
      </Modal>

      <Modal
        open={!!deliverId}
        title="Confirm delivery + POD"
        onClose={() => setDeliverId(null)}
        footer={
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setDeliverId(null)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                const res = await updateDeliveryStatus({
                  actor: user,
                  stockist: business,
                  deliveryId: deliverId!,
                  status: 'Delivered',
                  podFileId,
                  receivedBy: receivedBy.trim() || undefined,
                });
                pushToast(res.ok ? { tone: 'success', title: 'Delivered' } : { tone: 'error', title: res.message });
                setDeliverId(null);
                setPodFileId(undefined);
                setReceivedBy('');
              }}
            >
              Confirm delivered
            </Button>
          </div>
        }
      >
        <div className="stack">
          <Field label="Received by">
            <Input value={receivedBy} onChange={(e) => setReceivedBy(e.target.value)} placeholder="Receiver name" />
          </Field>
          <Field label="Proof of delivery">
            <FileUpload value={podFileId} onChange={setPodFileId} label="Upload POD" />
          </Field>
          {deliverTarget?.status === 'PartiallyDelivered' ? (
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>
              Completing a partial delivery marks remaining quantities delivered.
            </p>
          ) : null}
        </div>
      </Modal>

      <Modal open={!!historyId} title="Delivery history" onClose={() => setHistoryId(null)}>
        <div className="timeline">
          {historyTarget?.statusHistory.map((h, i) => (
            <div key={i} className="timeline-item">
              <div className="timeline-dot" />
              <div>
                {h.from} → <strong>{h.to}</strong>
                {h.reason ? <div className="muted">{h.reason}</div> : null}
                <div className="muted">{new Date(h.at).toLocaleString()}</div>
              </div>
            </div>
          ))}
        </div>
      </Modal>

      {tab === 'Routes' && canRoutes ? (
        <div className="stack">
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <Button
              size="sm"
              onClick={() => {
                setEditRouteId(null);
                setRouteName('');
                setRoutePins('');
                setRouteAssignee('');
                setRouteModalOpen(true);
              }}
            >
              New route
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={!routes.length}
              onClick={() => {
                setStopPickRoute(routes[0]?.id ?? '');
                const r = routes[0];
                setSelectedStops(r?.stops.slice().sort((a, b) => a.seq - b.seq).map((s) => s.deliveryId) ?? []);
                setAssignStopsModalOpen(true);
              }}
            >
              Assign stops
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={!routes.length}
              onClick={() => {
                const payload = routes.map((r) => ({
                  name: r.name,
                  pins: r.pins,
                  stopCount: r.stops.length,
                }));
                try {
                  localStorage.setItem(`ds.routeTemplates.${business.id}`, JSON.stringify(payload));
                  pushToast({ tone: 'success', title: 'Route templates saved', message: `${payload.length} route(s)` });
                } catch {
                  pushToast({ tone: 'error', title: 'Could not save templates' });
                }
              }}
            >
              Save templates
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                try {
                  const raw = localStorage.getItem(`ds.routeTemplates.${business.id}`);
                  if (!raw) {
                    pushToast({ tone: 'info', title: 'No saved templates' });
                    return;
                  }
                  const parsed = JSON.parse(raw) as { name: string; pins: string[] }[];
                  pushToast({
                    tone: 'success',
                    title: 'Templates loaded',
                    message: parsed.map((p) => p.name).join(', ') || 'Empty',
                  });
                  if (parsed[0]) {
                    setRouteName(parsed[0].name);
                    setRoutePins((parsed[0].pins ?? []).join(', '));
                    setEditRouteId(null);
                    setRouteModalOpen(true);
                  }
                } catch {
                  pushToast({ tone: 'error', title: 'Could not load templates' });
                }
              }}
            >
              Load templates
            </Button>
          </div>
          {!routes.length ? (
            <EmptyState title="No routes" description="Create a route, then assign open deliveries as stops." />
          ) : (
            routes.map((r) => (
              <div key={r.id} className="card card-pad stack">
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <strong>{r.name}</strong>
                  <span className="muted" style={{ fontSize: 12 }}>
                    {r.stops.length} stops · {r.pins.join(', ') || 'no PINs'}
                  </span>
                </div>
                <div className="row">
                  <Button size="sm" variant="secondary" onClick={() => openEditRoute(r)}>
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setStopPickRoute(r.id);
                      setSelectedStops(r.stops.slice().sort((a, b) => a.seq - b.seq).map((s) => s.deliveryId));
                      setAssignStopsModalOpen(true);
                    }}
                  >
                    Assign stops
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={!r.stops.length}
                    onClick={() =>
                      void optimizeRouteStops(
                        r.id,
                        r.stops.slice().sort((a, b) => a.seq - b.seq).map((s) => s.deliveryId),
                      )
                    }
                  >
                    Optimize stops
                  </Button>
                  <DeleteButton size="sm" onClick={() => setDeleteRouteId(r.id)}>
                    Delete
                  </DeleteButton>
                </div>
              </div>
            ))
          )}

          <Modal
            open={routeModalOpen}
            title={editRouteId ? 'Edit route' : 'New route'}
            onClose={closeRouteModal}
            footer={
              <div className="row" style={{ justifyContent: 'flex-end' }}>
                <Button variant="secondary" onClick={closeRouteModal}>
                  Cancel
                </Button>
                <Button
                  onClick={async () => {
                    const res = await upsertStockistRoute({
                      actor: user,
                      stockist: business,
                      id: editRouteId ?? undefined,
                      name: routeName,
                      pins: routePins.split(',').map((p) => p.trim()).filter(Boolean),
                      assigneeId: routeAssignee || undefined,
                    });
                    pushToast(res.ok ? { tone: 'success', title: 'Route saved' } : { tone: 'error', title: res.message });
                    if (res.ok) closeRouteModal();
                  }}
                >
                  Save route
                </Button>
              </div>
            }
          >
            <div className="stack">
              <Field label="Name">
                <Input value={routeName} onChange={(e) => setRouteName(e.target.value)} />
              </Field>
              <Field label="Coverage PINs (comma-separated)">
                <Input value={routePins} onChange={(e) => setRoutePins(e.target.value)} />
              </Field>
              <Field label="Default assignee">
                <Select value={routeAssignee} onChange={(e) => setRouteAssignee(e.target.value)}>
                  <option value="">None</option>
                  {staff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </Modal>

          <Modal
            open={assignStopsModalOpen}
            title="Assign stops to route"
            onClose={() => setAssignStopsModalOpen(false)}
            footer={
              <div className="row" style={{ justifyContent: 'flex-end' }}>
                <Button variant="secondary" onClick={() => setAssignStopsModalOpen(false)}>
                  Cancel
                </Button>
                <Button
                  disabled={!stopPickRoute}
                  onClick={async () => {
                    const res = await setRouteStops({
                      actor: user,
                      stockist: business,
                      routeId: stopPickRoute,
                      deliveryIds: selectedStops,
                    });
                    pushToast(res.ok ? { tone: 'success', title: 'Stops updated' } : { tone: 'error', title: res.message });
                    if (res.ok) setAssignStopsModalOpen(false);
                  }}
                >
                  Save stop order
                </Button>
                <Button
                  variant="secondary"
                  disabled={!stopPickRoute || selectedStops.length < 2}
                  onClick={() => {
                    const ordered = optimizeStopOrder({
                      origin: {
                        latitude: liveBiz.preferences?.dispatchLatitude ?? liveBiz.latitude,
                        longitude: liveBiz.preferences?.dispatchLongitude ?? liveBiz.longitude,
                      },
                      stops: stopMetaForIds(selectedStops),
                    });
                    setSelectedStops(ordered);
                    pushToast({ tone: 'info', title: 'Order optimized', message: 'Save to apply' });
                  }}
                >
                  Optimize
                </Button>
              </div>
            }
          >
            <div className="stack">
              <Field label="Route">
                <Select
                  value={stopPickRoute}
                  onChange={(e) => {
                    setStopPickRoute(e.target.value);
                    const r = routes.find((x) => x.id === e.target.value);
                    setSelectedStops(r?.stops.slice().sort((a, b) => a.seq - b.seq).map((s) => s.deliveryId) ?? []);
                  }}
                >
                  <option value="">Select</option>
                  {routes.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </Select>
              </Field>
              {deliveries
                .filter((d) => !['Delivered', 'Cancelled'].includes(d.status))
                .map((d) => (
                  <label key={d.id} className="row" style={{ fontSize: 13 }}>
                    <input
                      type="checkbox"
                      checked={selectedStops.includes(d.id)}
                      onChange={(e) => {
                        setSelectedStops((prev) =>
                          e.target.checked ? [...prev, d.id] : prev.filter((x) => x !== d.id),
                        );
                      }}
                    />
                    {d.deliveryNo} · {pharmacyName(d.pharmacyId)}
                  </label>
                ))}
            </div>
          </Modal>
        </div>
      ) : null}

      {tab === 'Execute' ? (
        <div className="stack">
          {!isBoy ? (
            <Field label="Route">
              <Select value={execRouteId} onChange={(e) => setExecRouteId(e.target.value)}>
                <option value="">Select route</option>
                {routes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : boyRoutes.length > 1 ? (
            <Field label="Route">
              <Select value={execRouteId || execRoute?.id || ''} onChange={(e) => setExecRouteId(e.target.value)}>
                {boyRoutes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          {!execRoute ? (
            <EmptyState
              title="No route selected"
              description={isBoy ? 'Ask a manager to assign you a route or stops.' : 'Pick a route or ask a manager to assign you one.'}
            />
          ) : !execStops.length ? (
            <EmptyState title="No stops on this route" description="Assign open deliveries as stops first." />
          ) : (
            execStops.map((d, idx) => {
              if (!d) return null;
              const pharmacy = pharmacies.find((p) => p.id === d.pharmacyId);
              const order = orders.find((o) => o.id === d.orderId);
              const addr = order?.deliveryAddress;
              const addrText = addr
                ? `${addr.line1}, ${addr.city} ${addr.pincode}`
                : pharmacy
                  ? `${pharmacy.address}, ${pharmacy.city}`
                  : '';
              return (
                <div key={d.id} className="card card-pad stack">
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <strong>
                      Stop {idx + 1}: {d.deliveryNo}
                    </strong>
                    <StatusBadge status={d.status} />
                  </div>
                  <div style={{ fontSize: 13 }}>
                    <div>
                      <strong>{pharmacy?.name}</strong>
                      {pharmacy?.phone ? <span className="muted"> · {pharmacy.phone}</span> : null}
                    </div>
                    {addrText ? <div className="muted">{addrText}</div> : null}
                    {!d.assignedTo ? <div className="muted">Unassigned — cannot execute</div> : null}
                    {d.scheduledDate ? <div className="muted">Scheduled {d.scheduledDate}</div> : null}
                  </div>
                  {addrText || d.status === 'Assigned' || d.status === 'OutForDelivery' ? (
                    <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
                      {addrText ? (
                        <a
                          className="btn btn-secondary btn-sm"
                          href={mapsDeepLink(addrText)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open in maps
                        </a>
                      ) : null}
                      {d.status === 'Assigned' ? (
                        <Button
                          size="sm"
                          disabled={!d.assignedTo}
                          onClick={async () => {
                            const res = await updateDeliveryStatus({
                              actor: user,
                              stockist: business,
                              deliveryId: d.id,
                              status: 'OutForDelivery',
                            });
                            pushToast(
                              res.ok ? { tone: 'success', title: 'Out for delivery' } : { tone: 'error', title: res.message },
                            );
                          }}
                        >
                          Start
                        </Button>
                      ) : null}
                      {d.status === 'OutForDelivery' ? (
                        <>
                          <Button
                            size="sm"
                            onClick={() => {
                              setDeliverId(d.id);
                              setPodFileId(d.podFileId);
                              setReceivedBy(d.receivedBy ?? '');
                            }}
                          >
                            Delivered
                          </Button>
                          <Button size="sm" variant="danger" onClick={() => setFailId(d.id)}>
                            Failed
                          </Button>
                        </>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      ) : null}

      {tab === 'Dates' && !isBoy ? (
        <div className="card card-pad stack">
          <strong>Serviceable delivery dates</strong>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            Pharmacies pick from these dates at checkout. Stored in the workspace database (not localStorage).
          </p>
          <Field label="Dates (comma-separated YYYY-MM-DD)">
            <Input value={datesDraft} onChange={(e) => setDatesDraft(e.target.value)} placeholder="2026-08-10, 2026-08-12" />
          </Field>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <Button
              onClick={async () => {
                const dates = datesDraft
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean);
                try {
                  localStorage.removeItem(`ds.deliveryDates.${business.id}`);
                } catch {
                  /* ignore */
                }
                await replaceDeliveryDates(business.id, dates);
                pushToast({ tone: 'success', title: 'Delivery dates saved', message: `${dates.length} date(s)` });
              }}
            >
              Save dates
            </Button>
          </div>
        </div>
      ) : null}

      {tab === 'Fees' && !isBoy ? (
        <div className="stack">
          <div className="card card-pad stack">
            <strong>Delivery fee rules</strong>
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>
              First matching active rule by priority wins. Profile fee fields stay as a summary fallback when no rules
              are saved.
            </p>
            <div className="muted" style={{ fontSize: 12 }}>
              Profile fallback: flat {formatINR(liveBiz.preferences?.deliveryFeeFlat ?? 0)}
              {liveBiz.preferences?.deliveryFeeFreeAbove != null
                ? ` · free above ${formatINR(liveBiz.preferences.deliveryFeeFreeAbove)}`
                : ''}
            </div>
            {ruleDrafts.map((rule, idx) => (
              <div key={rule.key} className="card card-pad stack" style={{ gap: 8 }}>
                <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
                  <Field label="Type">
                    <Select
                      value={rule.ruleType}
                      onChange={(e) => {
                        const ruleType = e.target.value as DeliveryRuleType;
                        setRuleDrafts((prev) =>
                          prev.map((r, i) => (i === idx ? { ...r, ruleType } : r)),
                        );
                      }}
                    >
                      {RULE_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Priority">
                    <Input
                      type="number"
                      style={{ width: 88 }}
                      value={rule.priority}
                      onChange={(e) =>
                        setRuleDrafts((prev) =>
                          prev.map((r, i) => (i === idx ? { ...r, priority: Number(e.target.value) || 0 } : r)),
                        )
                      }
                    />
                  </Field>
                  <label className="row" style={{ fontSize: 13, alignItems: 'center', gap: 6 }}>
                    <input
                      type="checkbox"
                      checked={rule.active}
                      onChange={(e) =>
                        setRuleDrafts((prev) =>
                          prev.map((r, i) => (i === idx ? { ...r, active: e.target.checked } : r)),
                        )
                      }
                    />
                    Active
                  </label>
                  <DeleteButton
                    size="sm"
                    onClick={() => setRuleDrafts((prev) => prev.filter((_, i) => i !== idx))}
                  >
                    Remove
                  </DeleteButton>
                </div>
                {rule.ruleType === 'order_amount' ? (
                  <Field label="Free above (₹)">
                    <Input
                      type="number"
                      value={rule.minOrderAmount ?? ''}
                      onChange={(e) =>
                        setRuleDrafts((prev) =>
                          prev.map((r, i) =>
                            i === idx ? { ...r, minOrderAmount: Number(e.target.value) || undefined } : r,
                          ),
                        )
                      }
                    />
                  </Field>
                ) : null}
                {rule.ruleType === 'flat_fee' ? (
                  <Field label="Flat fee (₹)">
                    <Input
                      type="number"
                      value={rule.flatFee ?? ''}
                      onChange={(e) =>
                        setRuleDrafts((prev) =>
                          prev.map((r, i) =>
                            i === idx ? { ...r, flatFee: Number(e.target.value) || undefined } : r,
                          ),
                        )
                      }
                    />
                  </Field>
                ) : null}
                {rule.ruleType === 'delivery_date' ? (
                  <label className="row" style={{ fontSize: 13, gap: 6 }}>
                    <input
                      type="checkbox"
                      checked={!!rule.freeOnDeliveryDate}
                      onChange={(e) =>
                        setRuleDrafts((prev) =>
                          prev.map((r, i) => (i === idx ? { ...r, freeOnDeliveryDate: e.target.checked } : r)),
                        )
                      }
                    />
                    Free on published delivery date
                  </label>
                ) : null}
                {rule.ruleType === 'distance' ? (
                  <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
                    <Field label="Per km (₹)">
                      <Input
                        type="number"
                        value={rule.perKmCharge ?? ''}
                        onChange={(e) =>
                          setRuleDrafts((prev) =>
                            prev.map((r, i) =>
                              i === idx ? { ...r, perKmCharge: Number(e.target.value) || undefined } : r,
                            ),
                          )
                        }
                      />
                    </Field>
                    <Field label="Base km free">
                      <Input
                        type="number"
                        value={rule.baseDistanceKm ?? ''}
                        onChange={(e) =>
                          setRuleDrafts((prev) =>
                            prev.map((r, i) =>
                              i === idx ? { ...r, baseDistanceKm: Number(e.target.value) || undefined } : r,
                            ),
                          )
                        }
                      />
                    </Field>
                  </div>
                ) : null}
              </div>
            ))}
            <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <Button
                variant="secondary"
                onClick={() =>
                  setRuleDrafts((prev) => [
                    ...prev,
                    {
                      key: `new-${Date.now()}`,
                      ruleType: 'flat_fee',
                      priority: (prev.length + 1) * 10,
                      active: true,
                      flatFee: liveBiz.preferences?.deliveryFeeFlat ?? 50,
                    },
                  ])
                }
              >
                Add rule
              </Button>
              <Button
                onClick={async () => {
                  await replaceDeliveryRules(
                    business.id,
                    ruleDrafts.map(({ key: _k, ...r }) => r),
                  );
                  const flat = ruleDrafts.find((r) => r.active && r.ruleType === 'flat_fee')?.flatFee;
                  const free = ruleDrafts.find((r) => r.active && r.ruleType === 'order_amount')?.minOrderAmount;
                  await updateBusiness({
                    actor: user,
                    business: liveBiz,
                    patch: {
                      preferences: {
                        deliveryFeeFlat: flat,
                        deliveryFeeFreeAbove: free,
                      },
                    },
                  });
                  pushToast({ tone: 'success', title: 'Fee rules saved' });
                }}
              >
                Save rules
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {tab === 'PINs' && !isBoy ? (
        <div className="stack">
          <div className="card card-pad stack">
            <strong>PIN delivery matrix</strong>
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>
              Weekday coverage and charges per service PIN.
            </p>
            {!pinDrafts.length ? (
              <EmptyState title="No service PINs" description="Add serviceable PINs on Business profile first." />
            ) : (
              pinDrafts.map((pin, idx) => (
                <div key={pin.key} className="card card-pad stack">
                  <strong>PIN {pin.pinCode}</strong>
                  <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
                    {WEEKDAYS.map((day) => {
                      const on = pin.deliveryDays.includes(day);
                      return (
                        <button
                          key={day}
                          type="button"
                          className={`chip${on ? ' active' : ''}`}
                          onClick={() =>
                            setPinDrafts((prev) =>
                              prev.map((p, i) =>
                                i === idx
                                  ? {
                                      ...p,
                                      deliveryDays: on
                                        ? p.deliveryDays.filter((d) => d !== day)
                                        : [...p.deliveryDays, day],
                                    }
                                  : p,
                              ),
                            )
                          }
                        >
                          {day}
                        </button>
                      );
                    })}
                  </div>
                  <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
                    <Field label="Charge (₹)">
                      <Input
                        type="number"
                        value={pin.deliveryCharge}
                        onChange={(e) =>
                          setPinDrafts((prev) =>
                            prev.map((p, i) =>
                              i === idx ? { ...p, deliveryCharge: Number(e.target.value) || 0 } : p,
                            ),
                          )
                        }
                      />
                    </Field>
                    <Field label="Free above (₹)">
                      <Input
                        type="number"
                        value={pin.freeAbove ?? ''}
                        onChange={(e) =>
                          setPinDrafts((prev) =>
                            prev.map((p, i) =>
                              i === idx
                                ? { ...p, freeAbove: e.target.value ? Number(e.target.value) : undefined }
                                : p,
                            ),
                          )
                        }
                      />
                    </Field>
                    <Field label="ETA hours">
                      <Input
                        type="number"
                        value={pin.estimatedHours ?? ''}
                        onChange={(e) =>
                          setPinDrafts((prev) =>
                            prev.map((p, i) =>
                              i === idx
                                ? { ...p, estimatedHours: e.target.value ? Number(e.target.value) : undefined }
                                : p,
                            ),
                          )
                        }
                      />
                    </Field>
                  </div>
                </div>
              ))
            )}
            {pinDrafts.length ? (
              <div className="row" style={{ justifyContent: 'flex-end' }}>
                <Button
                  onClick={async () => {
                    await replacePinDeliverySettings(
                      business.id,
                      pinDrafts.map(({ key: _k, ...r }) => r),
                    );
                    pushToast({ tone: 'success', title: 'PIN settings saved' });
                  }}
                >
                  Save PIN matrix
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {tab === 'Holidays' && !isBoy ? (
        <div className="card card-pad stack">
          <strong>Holidays</strong>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            When allow-preorder is off, pharmacies cannot place orders for dates in the window.
          </p>
          {holidayDrafts.map((h, idx) => (
            <div key={`${h.startDate}-${idx}`} className="row" style={{ flexWrap: 'wrap', gap: 8, alignItems: 'flex-end' }}>
              <Field label="Start">
                <Input
                  type="date"
                  value={h.startDate.slice(0, 10)}
                  onChange={(e) =>
                    setHolidayDrafts((prev) =>
                      prev.map((x, i) => (i === idx ? { ...x, startDate: e.target.value } : x)),
                    )
                  }
                />
              </Field>
              <Field label="End">
                <Input
                  type="date"
                  value={h.endDate.slice(0, 10)}
                  onChange={(e) =>
                    setHolidayDrafts((prev) =>
                      prev.map((x, i) => (i === idx ? { ...x, endDate: e.target.value } : x)),
                    )
                  }
                />
              </Field>
              <Field label="Reason">
                <Input
                  value={h.reason ?? ''}
                  onChange={(e) =>
                    setHolidayDrafts((prev) =>
                      prev.map((x, i) => (i === idx ? { ...x, reason: e.target.value || undefined } : x)),
                    )
                  }
                />
              </Field>
              <label className="row" style={{ fontSize: 13, gap: 6, alignItems: 'center' }}>
                <input
                  type="checkbox"
                  checked={h.allowPreorder}
                  onChange={(e) =>
                    setHolidayDrafts((prev) =>
                      prev.map((x, i) => (i === idx ? { ...x, allowPreorder: e.target.checked } : x)),
                    )
                  }
                />
                Allow preorder
              </label>
              <DeleteButton size="sm" onClick={() => setHolidayDrafts((prev) => prev.filter((_, i) => i !== idx))}>
                Remove
              </DeleteButton>
            </div>
          ))}
          <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <Button
              variant="secondary"
              onClick={() =>
                setHolidayDrafts((prev) => [
                  ...prev,
                  {
                    startDate: localTodayKey(),
                    endDate: localTodayKey(),
                    allowPreorder: true,
                    reason: '',
                  },
                ])
              }
            >
              Add holiday
            </Button>
            <Button
              onClick={async () => {
                const entries = holidayDrafts.map((h) => ({
                  startDate: h.startDate.slice(0, 10),
                  endDate: h.endDate.slice(0, 10),
                  reason: h.reason?.trim() || undefined,
                  allowPreorder: h.allowPreorder,
                }));
                const legacy = entries.map((h) =>
                  h.reason ? `${h.startDate}|${h.reason}` : h.startDate,
                );
                const res = await updateBusiness({
                  actor: user,
                  business: liveBiz,
                  patch: { holidayEntries: entries, holidays: legacy },
                });
                pushToast(
                  res.ok
                    ? { tone: 'success', title: 'Holidays saved' }
                    : { tone: 'error', title: res.message },
                );
              }}
            >
              Save holidays
            </Button>
          </div>
        </div>
      ) : null}

      {tab === 'Board' && !isBoy ? (
        <>
          <ListToolbar
            query={list.query}
            onQuery={list.setQuery}
            placeholder="Search delivery / pharmacy / order"
            filters={[
              {
                key: 'status',
                label: 'Status',
                options: ['Created', 'Assigned', 'OutForDelivery', 'PartiallyDelivered', 'Delivered', 'Failed', 'Cancelled'].map((s) => ({
                  value: s,
                  label: s,
                })),
              },
              {
                key: 'assignee',
                label: 'Assignee',
                options: [
                  { value: 'Unassigned', label: 'Unassigned' },
                  ...staff.map((s) => ({ value: s.name, label: s.name })),
                ],
              },
            ]}
            filterValues={list.filterValues}
            onFilter={list.setFilter}
            onExport={() => {
              list.doExport(`stockist-deliveries-${business.id}.csv`);
              pushToast({ tone: 'success', title: 'Exported deliveries' });
            }}
          />
        </>
      ) : null}

      {tab === 'Board'
        ? (isBoy ? visible : list.pageRows).map((d) => {
        const pharmacy = pharmacies.find((p) => p.id === d.pharmacyId);
        const order = orders.find((o) => o.id === d.orderId);
        const addr = order?.deliveryAddress;
        return (
          <div key={d.id} className="card card-pad stack">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <strong>{d.deliveryNo}</strong>
              <StatusBadge status={d.status} />
            </div>
            <div style={{ fontSize: 13 }}>
              <div>
                <strong>{pharmacy?.name ?? 'Pharmacy'}</strong>
                {pharmacy?.phone ? <span className="muted"> · {pharmacy.phone}</span> : null}
              </div>
              {addr ? (
                <div className="muted">
                  {addr.line1}
                  {addr.line2 ? `, ${addr.line2}` : ''}, {addr.city} {addr.pincode}
                </div>
              ) : pharmacy ? (
                <div className="muted">
                  {pharmacy.address}, {pharmacy.city}
                </div>
              ) : null}
              {order ? (
                <div>
                  Order: <Link to={`/stockist/orders/${order.orderNo}`}>{order.orderNo}</Link>
                </div>
              ) : null}
              <div className="muted">Assignee: {assigneeName(d.assignedTo)}</div>
              {d.scheduledDate ? <div className="muted">Scheduled: {d.scheduledDate}</div> : null}
              {d.routeId ? (
                <div className="muted">Route: {routes.find((r) => r.id === d.routeId)?.name ?? d.routeId.slice(0, 6)}</div>
              ) : null}
              {d.receivedBy ? <div className="muted">Received by: {d.receivedBy}</div> : null}
              {d.podFileId ? (
                <div>
                  POD: <FileLink fileId={d.podFileId} />
                </div>
              ) : null}
              {d.failReason ? <div className="muted">Fail reason: {d.failReason}</div> : null}
            </div>
            <PharmacyDeliveryPrefs pharmacy={pharmacy} />
            <div className="row" style={{ flexWrap: 'wrap' }}>
              {canAssign && !['Delivered', 'Cancelled'].includes(d.status) ? (
                <ScheduleDateRow
                  deliveryNo={d.deliveryNo}
                  scheduledDate={d.scheduledDate}
                  onSave={async (scheduledDate) => {
                    const res = await scheduleDelivery({
                      actor: user,
                      stockist: business,
                      deliveryId: d.id,
                      scheduledDate,
                    });
                    pushToast(
                      res.ok ? { tone: 'success', title: 'Schedule saved' } : { tone: 'error', title: res.message },
                    );
                  }}
                />
              ) : null}
              {canAssign && ['Created', 'Assigned', 'Failed'].includes(d.status) ? (
                <Select
                  value={d.assignedTo ?? ''}
                  onChange={async (e) => {
                    const res = await assignDelivery({
                      actor: user,
                      stockist: business,
                      deliveryId: d.id,
                      assigneeId: e.target.value || null,
                    });
                    pushToast(res.ok ? { tone: 'success', title: 'Assignment updated' } : { tone: 'error', title: res.message });
                  }}
                  style={{ maxWidth: 200 }}
                >
                  <option value="">Unassigned</option>
                  {staff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              ) : null}
              {d.status === 'Assigned' ? (
                <Button
                  size="sm"
                  onClick={async () => {
                    const res = await updateDeliveryStatus({
                      actor: user,
                      stockist: business,
                      deliveryId: d.id,
                      status: 'OutForDelivery',
                    });
                    pushToast(res.ok ? { tone: 'success', title: 'Out for delivery' } : { tone: 'error', title: res.message });
                  }}
                >
                  Out for delivery
                </Button>
              ) : null}
              {d.status === 'OutForDelivery' || d.status === 'PartiallyDelivered' ? (
                <>
                  <Button
                    size="sm"
                    onClick={() => {
                      setDeliverId(d.id);
                      setPodFileId(d.podFileId);
                      setReceivedBy(d.receivedBy ?? '');
                    }}
                  >
                    Mark delivered
                  </Button>
                  {d.status === 'OutForDelivery' ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setPartialId(d.id);
                        // Prefill full qty — user edits only the short lines deliberately.
                        setPartialQtys(Object.fromEntries(d.lines.map((l) => [l.productId, l.qty])));
                      }}
                    >
                      Partial…
                    </Button>
                  ) : null}
                  {d.status === 'OutForDelivery' ? (
                    <Button size="sm" variant="danger" onClick={() => setFailId(d.id)}>
                      Failed
                    </Button>
                  ) : null}
                </>
              ) : null}
              {d.status === 'Failed' ? (
                <>
                  <Button
                    size="sm"
                    onClick={async () => {
                      const res = await updateDeliveryStatus({
                        actor: user,
                        stockist: business,
                        deliveryId: d.id,
                        status: 'OutForDelivery',
                      });
                      pushToast(res.ok ? { tone: 'info', title: 'Retry started' } : { tone: 'error', title: res.message });
                    }}
                  >
                    Retry
                  </Button>
                  {canAssign && !d.returnedToStockistAt ? (
                    <Button size="sm" variant="secondary" onClick={() => setRestockId(d.id)}>
                      Return to stockist
                    </Button>
                  ) : null}
                </>
              ) : null}
              <Button size="sm" variant="ghost" onClick={() => setHistoryId(d.id)}>
                History
              </Button>
            </div>
          </div>
        );
      })
        : null}

      {tab === 'Board' && deliveriesLoading ? <LoadingState label="Loading deliveries…" /> : null}
      {tab === 'Board' && !deliveriesLoading && !visible.length ? (
        <EmptyState title="No deliveries" description="Dispatch a packed & invoiced order to create one." />
      ) : null}
      {tab === 'Board' && !isBoy && visible.length ? (
        <PaginationBar
          page={list.page}
          pageCount={list.pageCount}
          total={list.total}
          onPage={list.setPage}
          pageSize={list.pageSize}
          onPageSizeChange={setPageSize}
          stickyFooter
          tableSectionRef={tableRef}
        />
      ) : null}
    </ListPageChrome>
  );
}

function ScheduleDateRow({
  deliveryNo,
  scheduledDate,
  onSave,
}: {
  deliveryNo: string;
  scheduledDate?: string;
  onSave: (date: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState(scheduledDate ?? '');
  const [busy, setBusy] = useState(false);
  const dirty = draft !== (scheduledDate ?? '');
  return (
    <div className="row" style={{ alignItems: 'center' }}>
      <Input
        type="date"
        min={localTodayKey()}
        value={draft}
        style={{ maxWidth: 160 }}
        aria-label={`Schedule ${deliveryNo}`}
        onChange={(e) => setDraft(e.target.value)}
      />
      <Button
        size="sm"
        variant="secondary"
        disabled={!draft || !dirty || busy}
        onClick={() => {
          setBusy(true);
          void onSave(draft).finally(() => setBusy(false));
        }}
      >
        {busy ? '…' : 'Save date'}
      </Button>
    </div>
  );
}
