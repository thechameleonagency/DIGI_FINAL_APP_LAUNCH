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
import { Button, EmptyState, Field, Input, PageHeader, Select, StatusBadge } from '../../../ui/components/primitives';
import { useBiz } from './useBiz';

type Tab = 'areas' | 'routes' | 'board';

export function PharmacyDelivery() {
  const { business, user } = useBiz();
  const { pushToast } = useUi();
  const { busy, run } = useBusyAction();
  const canManage = useCan('sale.record');
  const [tab, setTab] = useState<Tab>('board');

  const areas =
    useLiveQuery(() => db.deliveryAreas.where('pharmacyId').equals(business.id).toArray(), [business.id]) ?? [];
  const routes =
    useLiveQuery(() => db.pharmacyRoutes.where('pharmacyId').equals(business.id).toArray(), [business.id]) ?? [];
  const sales =
    useLiveQuery(() => db.customerSales.where('pharmacyId').equals(business.id).toArray(), [business.id]) ?? [];
  const staff =
    useLiveQuery(
      () => db.users.where('businessId').equals(business.id).filter((u) => u.status === 'Active').toArray(),
      [business.id],
    ) ?? [];

  const visibleRoutes = useMemo(() => {
    if (user.role === 'DeliveryBoy') {
      return routes.filter((r) => !r.assigneeUserId || r.assigneeUserId === user.id);
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
  const [failStop, setFailStop] = useState<{ routeId: string; saleId: string } | null>(null);
  const [deleteRouteId, setDeleteRouteId] = useState<string | null>(null);

  return (
    <div className="stack">
      <PageHeader
        title="Customer delivery"
        subtitle="Areas, routes, and home-delivery stops — logistics only (sale totals unchanged)"
        actions={
          <Link className="btn btn-secondary btn-sm" to="/pharmacy/sales">
            Sales
          </Link>
        }
      />

      <div className="row" style={{ flexWrap: 'wrap' }}>
        {(
          [
            ['board', 'Route board'],
            ['routes', 'Routes'],
            ['areas', 'Areas'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`chip${tab === id ? ' active' : ''}`}
            onClick={() => setTab(id)}
            style={tab === id ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : undefined}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'areas' ? (
        <div className="stack">
          {canManage ? (
            <div className="card card-pad stack">
              <strong>New area</strong>
              <Field label="Name">
                <Input value={areaName} onChange={(e) => setAreaName(e.target.value)} placeholder="North Pune" />
              </Field>
              <Field label="PIN codes (comma or space separated)">
                <Input value={areaPins} onChange={(e) => setAreaPins(e.target.value)} placeholder="411001, 411004" />
              </Field>
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
                    }
                  })
                }
              >
                Save area
              </Button>
            </div>
          ) : null}
          {!areas.length ? (
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
                    onClick={() =>
                      void run(async () => {
                        const res = await deleteDeliveryArea({ actor: user, pharmacy: business, id: a.id });
                        pushToast(
                          res.ok ? { tone: 'info', title: 'Area deleted' } : { tone: 'error', title: res.message },
                        );
                      })
                    }
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
            <div className="card card-pad stack">
              <strong>New route</strong>
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
                    }
                  })
                }
              >
                Save route
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

          {!visibleRoutes.length ? (
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
            <div className="card card-pad">
              <strong>Unassigned home deliveries ({unassigned.length})</strong>
              <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>
                Assign them under the Routes tab.
              </div>
              {unassigned.slice(0, 8).map((s) => (
                <div key={s.id} style={{ fontSize: 13, marginTop: 6 }}>
                  <Link to={`/pharmacy/sales/${s.saleNo}`}>{s.saleNo}</Link> · {s.customerName}
                  {s.address ? ` · ${s.address}` : ''}
                </div>
              ))}
            </div>
          ) : null}

          {!visibleRoutes.length ? (
            <EmptyState title="No route board yet" description="Create areas and routes, then assign sales." />
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
                              <Link to={`/pharmacy/sales/${sale.saleNo}`}>{sale.saleNo}</Link>
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
    </div>
  );
}
