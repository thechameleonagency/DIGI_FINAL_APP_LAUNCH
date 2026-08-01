import { Link } from 'react-router-dom';
import { useUi } from '../../store/ui';
import { Button, Modal } from './primitives';

export type SuccessSummaryPayload = {
  title: string;
  documentNo?: string;
  body?: string;
  next?: { label: string; to: string }[];
};

/** CF-32 post-action success summary — driven by ui.successSummary */
export function SuccessSummaryHost() {
  const { successSummary, clearSuccessSummary } = useUi();
  if (!successSummary) return null;
  return (
    <Modal
      open
      title={successSummary.title}
      onClose={clearSuccessSummary}
      footer={
        <Button type="button" onClick={clearSuccessSummary}>
          Close
        </Button>
      }
    >
      {successSummary.documentNo ? (
        <p style={{ margin: '0 0 8px', fontSize: 15 }}>
          Document <strong>{successSummary.documentNo}</strong>
        </p>
      ) : null}
      {successSummary.body ? <p style={{ margin: '0 0 12px', fontSize: 14 }}>{successSummary.body}</p> : null}
      {successSummary.next?.length ? (
        <div className="row gap" style={{ flexWrap: 'wrap' }}>
          {successSummary.next.map((n) => (
            <Link key={n.to} className="btn btn-secondary btn-sm" to={n.to} onClick={clearSuccessSummary}>
              {n.label}
            </Link>
          ))}
        </div>
      ) : null}
    </Modal>
  );
}
