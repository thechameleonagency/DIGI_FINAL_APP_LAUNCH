import { PharmacyWishlist } from './PharmacyWishlist';

/** Wishlist body for topbar Sheet — also listed on More. */
export function PharmacyWishlistSheet({ onClose }: { onClose?: () => void }) {
  return (
    <div className="stack">
      {onClose ? (
        <button type="button" className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start' }} onClick={onClose}>
          Close
        </button>
      ) : null}
      <PharmacyWishlist />
    </div>
  );
}
