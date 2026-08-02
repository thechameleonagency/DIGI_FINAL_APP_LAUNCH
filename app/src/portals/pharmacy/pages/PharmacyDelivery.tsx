import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../data/db';
import {
  assignSaleToRoute,
  deleteDeliveryArea,
  deletePharmacyRoute,
  mapsUrl,
  updateRouteStopStatus,
  upsertDeliveryArea,
  upsertPharmacyRoute,
} from '../../../services/pharmacyDeliveryService';
import { useCan } from '../../../store/session';
import { useUi } from '../../../store/ui';
import { useBusyAction } from '../../../ui/hooks/useBusyAction';
import { ConfirmDialog } from '../../../ui/components/ConfirmDialog';
import { useLiveArray } from '../../../ui/hooks/useLiveArray';
import { Button, EmptyState, Field, Input, LoadingState, Modal, PageHeader, Select, StatusBadge, Tabs } from '../../../ui/components/primitives';
import { useBiz } from './useBiz';

type Tab = 'areas' | 'routes' | 'board';

export function PharmacyDelivery() {
  const { business, user } = useBiz();
  const { pushToast } = useUi();
  const { busy, run } = useBusyAction();
  const canRecord = useCan('sale.record');
  const canRoutes = useCan('route.manage');
  const canManage = canRecord || canRoutes;
  const isDeliveryStaff = user.role === 'DeliveryStaff';
  const [tab, setTab] = useState<Tab>('board');

  const { items: areas, loading: areasLoading } = useLiveArray(
    () => db.deliveryAreas.where('pharmacyId').equals(business.id).toArray(),
    [business.id],
  );
  const { items: routes, loading: routesLoading } = useLiveArray(
    () => db.pharmacyRoutes.where('pharmacyId').equals(business.id).toArray(),
    [business.id],
  );
  const sales =
    useLiveQuery(() => db.customerSales.where('pharmacyId').equals(business.id).toArray(), [business.id]) ?? [];
  const staff =
    useLiveQuery(
      () =>
        db.users
          .where('businessId')
          .equals(business.id)
          .filter((u) => u.role === 'DeliveryStaff' && u.status === 'Active')
          .toArray(),
      [business.id],
    ) ?? [];

  // DeliveryStaff: assigned board only (never unassigned / other riders' routes).
  const visibleRoutes = useMemo(() => {
    if (user.role === 'DeliveryStaff') {
      return routes.filter((r) => r.assigneeUserId === user.id);
    }
    return routes;
  }, [routes, user]);

  const unassigned = sales.filter(
    (s) =>
      s.homeDelivery &&
      s.status !== 'Voided' &&
      (s.deliveryStatus === 'Unassigned' || !s.deliveryStatus) &&
      !s.routeId,
  );

  const [areaName, setAreaName] = useState('');
  const [areaPins, setAreaPins] = useState('');
  const [routeName, setRouteName] = useState('');
  const [routeAreaId, setRouteAreaId] = useState('');
  const [routeAssignee, setRouteAssignee] = useState('');
  const [assignSaleId, setAssignSaleId] = useState('');
  const [assignRouteId, setAssignRouteId] = useState('');
  const [boardAssign, setBoardAssign] = useState<Record<string, string>>({});
  const [failStop, setFailStop] = useState<{ routeId: string; saleId: string } | null>(null);
  const [deleteRouteId, setDeleteRouteId] = useState<string | null>(null);
  const [deleteAreaId, setDeleteAreaId] = useState<string | null>(null);
  const [areaOpen, setAreaOpen] = useState(false);
  const [routeOpen, setRouteOpen] = useState(false);

  return (
    <div className="stack">
      <PageHeader
        title="Customer delivery"
        subtitle={
          isDeliveryStaff
            ? 'Your assigned home-delivery stops — customer address only (no B2B or sale totals)'
            : 'Areas, routes, and home-delivery stops — logistics only (sale totals unchanged)'
        }
        actions={
          canRecord ? (
            <Link className="btn btn-secondary btn-sm" to="/pharmacy/sales">
              Sales
            </Link>
          ) : null
        }
      />

      <Tabs
        ariaLabel="Delivery views"
        value={tab}
        onChange={setTab}
        items={
          isDeliveryStaff
            ? [{ id: 'board', label: 'Route board' }]
            : [
                { id: 'board', label: 'Route board' },
                { id: 'routes', label: 'Routes' },
                { id: 'areas', label: 'Areas' },
              ]
        }
      />

      {tab === 'areas' ? (
        <div className="stack">
          {canManage ? (
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <Button
                size="sm"
                onClick={() => {
                  setAreaName('');
                  setAreaPins('');
                  setAreaOpen(true);
                }}
              >
                New area
              </Button>
            </div>
          ) : null}
          {areasLoading ? (
            <LoadingState label="Loading areas…" />
          ) : !areas.length ? (
            <EmptyState title="No delivery areas" description="Define serviceable PIN groups for routing." />
          ) : (
            areas.map((a) => (
              <div key={a.id} className="card card-pad row" style={{ justifyContent: 'space-between' }}>
                <div>
                  <strong>{a.name}</strong>
                  <div className="muted" style={{ fontSize: 13 }}>
                    {a.pins.join(', ')}
                  </div>
                </div>
                {canManage ? (
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={busy}
                    onClick={() => setDeleteAreaId(a.id)}
                  >
                    Delete
                  </Button>
                ) : null}
              </div>
            ))
          )}
        </div>
      ) : null}

      {tab === 'routes' ? (
        <div className="stack">
          {canManage ? (
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <Button
                size="sm"
                onClick={() => {
                  setRouteName('');
                  setRouteAreaId('');
                  setRouteAssignee('');
                  setRouteOpen(true);
                }}
              >
                New route
              </Button>
            </div>
          ) : null}

          {canManage && unassigned.length ? (
            <div className="card card-pad stack">
              <strong>Assign home-delivery sale</strong>
              <div className="row" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <Field label="Sale">
                  <Select value={assignSaleId} onChange={(e) => setAssignSaleId(e.target.value)}>
                    <option value="">Select…</option>
                    {unassigned.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.saleNo} · {s.customerName}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Route">
                  <Select value={assignRouteId} onChange={(e) => setAssignRouteId(e.target.value)}>
                    <option value="">Select…</option>
                    {routes.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Button
                  disabled={busy || !assignSaleId || !assignRouteId}
                  onClick={() =>
                    void run(async () => {
                      const res = await assignSaleToRoute({
                        actor: user,
                        pharmacy: business,
                        saleId: assignSaleId,
                        routeId: assignRouteId,
                      });
                      pushToast(
                        res.ok ? { tone: 'success', title: 'Assigned to route' } : { tone: 'error', title: res.message },
                      );
                      if (res.ok) {
                        setAssignSaleId('');
                        setAssignRouteId('');
                      }
                    })
                  }
                >
                  Assign
                </Button>
              </div>
            </div>
          ) : null}

          {routesLoading ? (
            <LoadingState label="Loading routes…" />
          ) : !visibleRoutes.length ? (
            <EmptyState title="No routes" description="Create a route, then assign home-delivery sales." />
          ) : (
            visibleRoutes.map((r) => {
              const area = areas.find((a) => a.id === r.areaId);
              const assignee = staff.find((s) => s.id === r.assigneeUserId);
              return (
                <div key={r.id} className="card card-pad stack">
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <div>
                      <strong>{r.name}</strong>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {area ? `Area ${area.name}` : 'No area'}
                        {assignee ? ` · ${assignee.name}` : ''}
                        {` · ${r.stops.filter((s) => s.status === 'Pending').length} pending`}
                      </div>
                    </div>
                    {canManage ? (
                      <Button size="sm" variant="danger" onClick={() => setDeleteRouteId(r.id)}>
                        Delete
                      </Button>
                    ) : null}
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : null}

      {tab === 'board' ? (
        <div className="stack">
          {canManage && unassigned.length ? (
            <div className="card card-pad stack">
              <strong>Unassigned home deliveries ({unassigned.length})</strong>
              <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                Pick a route for each sale — no need to switch tabs.
              </p>
              {unassigned.slice(0, 12).map((s) => (
                <div key={s.id} className="row" style={{ alignItems: 'flex-end', flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 160, fontSize: 13 }}>
                    {canRecord ? (
                      <Link to={`/pharmacy/sales/${s.saleNo}`}>{s.saleNo}</Link>
                    ) : (
                      <span>{s.saleNo}</span>
                    )}{' '}
                    · {s.customerName}
                    {s.address ? <div className="muted">{s.address}</div> : null}
                  </div>
                  <Field label="Route">
                    <Select
                      value={boardAssign[s.id] ?? ''}
                      onChange={(e) => setBoardAssign((prev) => ({ ...prev, [s.id]: e.target.value }))}
                      style={{ minWidth: 160 }}
                    >
                      <option value="">Select…</option>
                      {routes.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Button
                    size="sm"
                    disabled={busy || !boardAssign[s.id]}
                    onClick={() =>
                      void run(async () => {
                        const routeId = boardAssign[s.id];
                        if (!routeId) return;
                        const res = await assignSaleToRoute({
                          actor: user,
                          pharmacy: business,
                          saleId: s.id,
                          routeId,
                        });
                        pushToast(
                          res.ok ? { tone: 'success', title: 'Assigned to route' } : { tone: 'error', title: res.message },
                        );
                        if (res.ok) {
                          setBoardAssign((prev) => {
                            const next = { ...prev };
                            delete next[s.id];
                            return next;
                          });
                        }
                      })
                    }
                  >
                    Assign
                  </Button>
                </div>
              ))}
            </div>
          ) : null}

          {routesLoading ? (
            <LoadingState label="Loading board…" />
          ) : !visibleRoutes.length ? (
            <EmptyState
              title={isDeliveryStaff ? 'No routes assigned to you' : 'No route board yet'}
              description={
                isDeliveryStaff
                  ? 'Ask the Pharmacist to assign a customer delivery route to you.'
                  : 'Create areas and routes, then assign home-delivery sales.'
              }
            />
          ) : (
            visibleRoutes.map((r) => {
              const pending = [...r.stops].filter((s) => s.status === 'Pending').sort((a, b) => a.seq - b.seq);
              const done = r.stops.filter((s) => s.status !== 'Pending');
              return (
                <div key={r.id} className="card card-pad stack">
                  <strong>{r.name}</strong>
                  {!pending.length && !done.length ? (
                    <div className="muted" style={{ fontSize: 13 }}>
                      No stops on this route.
                    </div>
                  ) : null}
                  {pending.map((stop) => {
                    const sale = sales.find((s) => s.id === stop.saleId);
                    if (!sale) return null;
                    return (
                      <div key={stop.saleId} className="card card-pad stack" style={{ background: 'var(--page)' }}>
                        <div className="row" style={{ justifyContent: 'space-between' }}>
                          <div>
                            <strong>
                              #{stop.seq} {sale.customerName}
                            </strong>
                            <div className="muted" style={{ fontSize: 12 }}>
                              {sale.phone ?? 'No phone'} ·{' '}
                              {canRecord ? (
                                <Link to={`/pharmacy/sales/${sale.saleNo}`}>{sale.saleNo}</Link>
                              ) : (
                                sale.saleNo
                              )}
                            </div>
                          </div>
                          <StatusBadge status="Pending" />
                        </div>
                        {sale.address ? (
                          <div style={{ fontSize: 13 }}>
                            {sale.address}{' '}
                            <a href={mapsUrl(sale.address)} target="_blank" rel="noreferrer">
                              Open map
                            </a>
                          </div>
                        ) : null}
                        <div className="row">
                          <Button
                            size="sm"
                            disabled={busy}
                            onClick={() =>
                              void run(async () => {
                                const res = await updateRouteStopStatus({
                                  actor: user,
                                  pharmacy: business,
                                  routeId: r.id,
                                  saleId: stop.saleId,
                                  status: 'Delivered',
                                });
                                pushToast(
                                  res.ok
                                    ? { tone: 'success', title: 'Marked delivered' }
                                    : { tone: 'error', title: res.message },
                                );
                              })
                            }
                          >
                            Delivered
                          </Button>
                          <Button size="sm" variant="danger" onClick={() => setFailStop({ routeId: r.id, saleId: stop.saleId })}>
                            Failed
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                  {done.length ? (
                    <div className="muted" style={{ fontSize: 12 }}>
                      Closed stops: {done.map((s) => s.status).join(', ')}
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      ) : null}

      <Modal
        open={areaOpen}
        title="New area"
        onClose={() => setAreaOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setAreaOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const pins = areaPins.split(/[\s,]+/).filter(Boolean);
                  const res = await upsertDeliveryArea({ actor: user, pharmacy: business, name: areaName, pins });
                  pushToast(res.ok ? { tone: 'success', title: 'Area saved' } : { tone: 'error', title: res.message });
                  if (res.ok) {
                    setAreaName('');
                    setAreaPins('');
                    setAreaOpen(false);
                  }
                })
              }
            >
              Save area
            </Button>
          </>
        }
      >
        <div className="stack">
          <Field label="Name">
            <Input value={areaName} onChange={(e) => setAreaName(e.target.value)} placeholder="North Pune" />
          </Field>
          <Field label="PIN codes (comma or space separated)">
            <Input value={areaPins} onChange={(e) => setAreaPins(e.target.value)} placeholder="411001, 411004" />
          </Field>
        </div>
      </Modal>

      <Modal
        open={routeOpen}
        title="New route"
        onClose={() => setRouteOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRouteOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const res = await upsertPharmacyRoute({
                    actor: user,
                    pharmacy: business,
                    name: routeName,
                    areaId: routeAreaId || undefined,
                    assigneeUserId: routeAssignee || undefined,
                  });
                  pushToast(res.ok ? { tone: 'success', title: 'Route saved' } : { tone: 'error', title: res.message });
                  if (res.ok) {
                    setRouteName('');
                    setRouteAreaId('');
                    setRouteAssignee('');
                    setRouteOpen(false);
                  }
                })
              }
            >
              Save route
            </Button>
          </>
        }
      >
        <div className="stack">
          <Field label="Name">
            <Input value={routeName} onChange={(e) => setRouteName(e.target.value)} />
          </Field>
          <Field label="Area (optional)">
            <Select value={routeAreaId} onChange={(e) => setRouteAreaId(e.target.value)}>
              <option value="">—</option>
              {areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Assignee (optional)">
            <Select value={routeAssignee} onChange={(e) => setRouteAssignee(e.target.value)}>
              <option value="">—</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {s.role}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!failStop}
        title="Mark stop failed"
        body="Sale returns to the unassigned pool for reassignment."
        requireReason
        tone="danger"
        reasonLabel="Failure reason"
        confirmLabel="Mark failed"
        onClose={() => setFailStop(null)}
        onConfirm={async (reason) => {
          const res = await updateRouteStopStatus({
            actor: user,
            pharmacy: business,
            routeId: failStop!.routeId,
            saleId: failStop!.saleId,
            status: 'Failed',
            failReason: reason,
          });
          pushToast(res.ok ? { tone: 'warning', title: 'Stop failed — returned to pool' } : { tone: 'error', title: res.message });
          setFailStop(null);
        }}
      />

      <ConfirmDialog
        open={!!deleteRouteId}
        title="Delete route"
        body="Open (pending) stops return to the unassigned pool."
        confirmLabel="Delete route"
        tone="danger"
        onClose={() => setDeleteRouteId(null)}
        onConfirm={async () => {
          const res = await deletePharmacyRoute({ actor: user, pharmacy: business, id: deleteRouteId! });
          pushToast(res.ok ? { tone: 'info', title: 'Route deleted' } : { tone: 'error', title: res.message });
          setDeleteRouteId(null);
        }}
      />

      <ConfirmDialog
        open={!!deleteAreaId}
        title="Delete delivery area?"
        body="PIN mapping for this area will be removed. Routes are not deleted."
        confirmLabel="Delete area"
        tone="danger"
        onClose={() => setDeleteAreaId(null)}
        onConfirm={async () => {
          await run(async () => {
            const res = await deleteDeliveryArea({ actor: user, pharmacy: business, id: deleteAreaId! });
            pushToast(res.ok ? { tone: 'info', title: 'Area deleted' } : { tone: 'error', title: res.message });
            if (res.ok) setDeleteAreaId(null);
          });
        }}
      />
    </div>
  );
}
