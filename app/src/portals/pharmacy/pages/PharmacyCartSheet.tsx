import { PharmacyCart } from './PharmacyCart';

/** Cart body for topbar Sheet — deep-link page still at /pharmacy/cart. */
export function PharmacyCartSheet({ onClose }: { onClose?: () => void }) {
  return (
    <div className="stack">
      {onClose ? (
        <button type="button" className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start' }} onClick={onClose}>
          Close
        </button>
      ) : null}
      <PharmacyCart />
    </div>
  );
}
