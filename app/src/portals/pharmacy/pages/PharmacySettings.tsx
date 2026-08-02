import { PageHeader } from '../../../ui/components/primitives';
import { MoreHub } from '../../../ui/components/MoreHub';

export function PharmacySettings() {
  return (
    <div className="stack">
      <PageHeader title="More" subtitle="Account, shopping, and workspace shortcuts" />
      <MoreHub
        sections={[
          {
            title: 'Shopping',
            items: [
              { to: '/pharmacy/cart', title: 'Cart', description: 'Review lines and place orders' },
              { to: '/pharmacy/wishlist', title: 'Wishlist', description: 'Saved catalogue products' },
              { to: '/pharmacy/buy?mode=all', title: 'All sellers', description: 'Cross-stockist product discovery inside Buy' },
              { to: '/pharmacy/quick-order', title: 'Quick Order', description: 'Paste a list and match products' },
              { to: '/pharmacy/compare', title: 'Compare', description: 'Compare offers across stockists' },
            ],
          },
          {
            title: 'Business',
            items: [
              { to: '/pharmacy/business', title: 'Business profile', description: 'GST, licenses, bank, addresses' },
              { to: '/pharmacy/delivery-preferences', title: 'Delivery preferences', description: 'Areas and preferred slots' },
              { to: '/pharmacy/staff', title: 'Staff', description: 'Invite and manage team roles' },
              { to: '/pharmacy/upgrade', title: 'Premium', description: 'Plan upgrade and billing' },
            ],
          },
          {
            title: 'Insights & risk',
            items: [
              { to: '/pharmacy/analytics', title: 'Analytics', description: 'Purchase and sales trends' },
              { to: '/pharmacy/counterfeit', title: 'Counterfeit', description: 'Report suspect packs' },
              { to: '/pharmacy/activity', title: 'Activity', description: 'Audit trail for this workspace' },
              { to: '/pharmacy/reports', title: 'Reports', description: 'Export pharmacy reports' },
            ],
          },
          {
            title: 'Account',
            items: [
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
        ]}
      />
      <p className="muted" style={{ fontSize: 13 }}>
        Demo OTP for password reset: 123456.
      </p>
    </div>
  );
}
