import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../data/db';
import { cancelReturn } from '../../../services/paymentService';
import { useUi } from '../../../store/ui';
import { ConfirmDialog } from '../../../ui/components/ConfirmDialog';
import { ReturnDetail } from '../../../ui/components/ReturnDetail';
import { useBusyAction } from '../../../ui/hooks/useBusyAction';
import { Button, EmptyState, PageHeader } from '../../../ui/components/primitives';
import { useBiz } from './useBiz';

export function PharmacyReturnDetail() {
  const { returnNo } = useParams();
  const { business, user } = useBiz();
  const { pushToast } = useUi();
  const { busy, run } = useBusyAction();
  const [cancelOpen, setCancelOpen] = useState(false);
  const ret = useLiveQuery(
    () =>
      returnNo
        ? db.returns.filter((r) => r.returnNo === decodeURIComponent(returnNo) || r.id === decodeURIComponent(returnNo)).first()
        : undefined,
    [returnNo],
  );

  if (!returnNo) {
    return (
      <div className="stack">
        <PageHeader title="Return detail" />
        <EmptyState title="Missing return" description="" />
      </div>
    );
  }

  return (
    <>
      <ConfirmDialog
        open={cancelOpen}
        title="Cancel return"
        body="Withdraw this return before the stockist reviews it."
        requireReason
        tone="danger"
        confirmLabel="Cancel return"
        onClose={() => setCancelOpen(false)}
        onConfirm={async (reason) => {
          if (!ret) return;
          await run(async () => {
            const res = await cancelReturn({
              actor: user,
              pharmacy: business,
              returnId: ret.id,
              reason,
            });
            pushToast(res.ok ? { tone: 'info', title: 'Return cancelled' } : { tone: 'error', title: res.message });
            setCancelOpen(false);
          });
        }}
      />
      <ReturnDetail
        returnNo={returnNo}
        portal="pharmacy"
        listPath="/pharmacy/returns"
        actions={
          ret?.status === 'Submitted' ? (
            <Button size="sm" variant="danger" disabled={busy} onClick={() => setCancelOpen(true)}>
              Cancel return
            </Button>
          ) : null
        }
      />
    </>
  );
}
