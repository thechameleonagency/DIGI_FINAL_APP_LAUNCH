import { PageHeader } from '../../../ui/components/primitives';
import { MoreHub } from '../../../ui/components/MoreHub';
import { useBiz } from './useBiz';

export function StockistSettings() {
  const { business, user } = useBiz();
  const isDeliveryStaff = user.role === 'DeliveryStaff';

  const sections = isDeliveryStaff
    ? [
        {
          title: 'Delivery',
          items: [
            { to: '/stockist/delivery', title: 'Delivery board', description: 'Assigned B2B pharmacy deliveries' },
          ],
        },
        {
          title: 'Account',
          items: [
            { to: '/stockist/profile', title: 'Profile & preferences', description: 'Security and personal settings' },
            { to: '/stockist/notifications', title: 'Notifications', description: 'Inbox and alert history' },
            { to: '/stockist/support', title: 'Support', description: 'Raise and track tickets' },
            { to: '/stockist/help', title: 'Help Center', description: 'Guides and FAQs' },
          ],
        },
      ]
    : [
        {
          title: 'Pharmacies',
          items: [
            { to: '/stockist/pharmacies', title: 'Pharmacies hub', description: 'Offline, invited, and platform partners' },
            { to: '/stockist/invites', title: 'Invites', description: 'Share register links' },
            { to: '/stockist/manual-order', title: 'Manual order', description: 'Record orders for partners' },
            { to: '/stockist/bulk-bill', title: 'Bulk bill', description: 'Issue invoices in batch' },
          ],
        },
        {
          title: 'Operations',
          items: [
            { to: '/stockist/procurement', title: 'Procurement', description: 'Suppliers, POs, and bills' },
            { to: '/stockist/price-history', title: 'Price history', description: 'PTR/MRP change log' },
            { to: '/stockist/counterfeit', title: 'Counterfeit', description: 'Report suspect batches' },
            { to: '/stockist/upgrade', title: 'Premium', description: 'Plan upgrade' },
          ],
        },
        {
          title: 'Business',
          items: [
            { to: '/stockist/business', title: 'Business profile', description: 'Bank, PINs, holidays, documents' },
            { to: '/stockist/staff', title: 'Staff', description: 'Invite DeliveryStaff' },
            { to: '/stockist/reports', title: 'Reports', description: 'Export stockist reports' },
          ],
        },
        {
          title: 'Account',
          items: [
            { to: '/stockist/profile', title: 'Profile & preferences', description: 'Security and personal settings' },
            { to: '/stockist/notifications', title: 'Notifications', description: 'Inbox and alert history' },
            { to: '/stockist/activity', title: 'Activity', description: 'Audit trail for this workspace' },
            { to: '/stockist/support', title: 'Support', description: 'Raise and track tickets' },
            { to: '/stockist/help', title: 'Help Center', description: 'Guides and FAQs' },
          ],
        },
      ];

  return (
    <div className="stack">
      <PageHeader
        title="More"
        subtitle={isDeliveryStaff ? `${business.name} — delivery workspace` : `${business.name} — workspace shortcuts`}
      />
      <MoreHub sections={sections} />
    </div>
  );
}
