import { PageHeader } from '../../../ui/components/primitives';
import { MoreHub } from '../../../ui/components/MoreHub';
import { useSession } from '../../../store/session';

export function PharmacySettings() {
  const { user } = useSession();
  const isDeliveryStaff = user?.role === 'DeliveryStaff';

  const sections = isDeliveryStaff
    ? [
        {
          title: 'Account',
          items: [
            { to: '/pharmacy/appearance', title: 'Appearance', description: 'Theme and accent color' },
            { to: '/pharmacy/profile', title: 'Profile & preferences', description: 'Security and personal settings' },
            { to: '/pharmacy/notifications', title: 'Notifications', description: 'Inbox and alert history' },
            { to: '/pharmacy/delivery', title: 'Delivery board', description: 'Assigned customer delivery routes' },
          ],
        },
        {
          title: 'Help',
          items: [
            { to: '/pharmacy/support', title: 'Support', description: 'Raise and track tickets' },
            { to: '/pharmacy/help', title: 'Help Center', description: 'Guides and FAQs' },
          ],
        },
      ]
    : [
        {
          title: 'Ordering',
          items: [
            { to: '/pharmacy/smart-order', title: 'Smart Order', description: 'Text, bill photo, or inventory → best stockists' },
            { to: '/pharmacy/quick-order', title: 'Quick Order', description: 'Paste a list and match products' },
            { to: '/pharmacy/cart', title: 'Cart', description: 'Multi-stockist checkout' },
            { to: '/pharmacy/wishlist', title: 'Wishlist', description: 'Saved catalogue products' },
            { to: '/pharmacy/buy?mode=all', title: 'All sellers', description: 'Cross-stockist discovery' },
            { to: '/pharmacy/compare', title: 'Compare', description: 'Compare offers across stockists' },
          ],
        },
        {
          title: 'Finance',
          items: [
            { to: '/pharmacy/payments', title: 'Payments / Razorpay', description: 'Pay invoices online or with proof' },
            { to: '/pharmacy/invoices', title: 'Invoices', description: 'Purchase invoices' },
            { to: '/pharmacy/returns', title: 'Returns', description: 'B2B returns to stockists' },
          ],
        },
        {
          title: 'Stock & suppliers',
          items: [
            { to: '/pharmacy/inventory', title: 'Inventory', description: 'Pharmacy shelf stock' },
            { to: '/pharmacy/suppliers', title: 'Offline suppliers', description: 'Local wholesalers + bill OCR' },
            { to: '/pharmacy/expiry', title: 'Expiry', description: 'Near-expiry batches' },
            { to: '/pharmacy/connections', title: 'Circle / stockists', description: 'Platform stockist network' },
          ],
        },
        {
          title: 'Business',
          items: [
            { to: '/pharmacy/business', title: 'Business profile', description: 'GST, licenses, bank, addresses' },
            { to: '/pharmacy/delivery-preferences', title: 'Delivery preferences', description: 'Receive slots and standing instructions' },
            { to: '/pharmacy/staff', title: 'Staff', description: 'Invite DeliveryStaff' },
            { to: '/pharmacy/upgrade', title: 'Premium', description: 'Plan upgrade and billing' },
          ],
        },
        {
          title: 'Insights & risk',
          items: [
            { to: '/pharmacy/analytics', title: 'Analytics', description: 'Purchase and sales trends' },
            { to: '/pharmacy/reports', title: 'Reports (GST / NDPS)', description: 'CSV exports including H/H1/X/NDPS' },
            { to: '/pharmacy/counterfeit', title: 'Counterfeit', description: 'Report suspect packs' },
            { to: '/pharmacy/activity', title: 'Activity', description: 'Audit trail for this workspace' },
          ],
        },
        {
          title: 'Account',
          items: [
            { to: '/pharmacy/appearance', title: 'Appearance', description: 'Theme and accent color' },
            { to: '/pharmacy/profile', title: 'Profile & preferences', description: 'Security and personal settings' },
            { to: '/pharmacy/notifications', title: 'Notifications', description: 'Inbox and alert history' },
          ],
        },
        {
          title: 'Help',
          items: [
            { to: '/pharmacy/support', title: 'Support', description: 'Raise and track tickets' },
            { to: '/pharmacy/help', title: 'Help Center', description: 'Guides and FAQs' },
          ],
        },
      ];

  return (
    <div className="stack">
      <PageHeader title="Settings & data" subtitle={isDeliveryStaff ? 'Delivery workspace shortcuts' : 'Account, ordering, and workspace shortcuts'} />
      <MoreHub sections={sections} />
      <p className="muted" style={{ fontSize: 13 }}>
        Demo OTP for password reset: 123456.
      </p>
    </div>
  );
}
