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
            { to: '/stockist/appearance', title: 'Appearance', description: 'Theme and accent color' },
            { to: '/stockist/profile', title: 'Profile & preferences', description: 'Security and personal settings' },
            { to: '/stockist/notifications', title: 'Notifications', description: 'Inbox and alert history' },
            { to: '/stockist/support', title: 'Support', description: 'Raise and track tickets' },
            { to: '/stockist/help', title: 'Help Center', description: 'Guides and FAQs' },
          ],
        },
      ]
    : [
        {
          title: 'Circle',
          items: [
            { to: '/stockist/pharmacies', title: 'Circle hub', description: 'Credit Circle, platform, invited, offline pharmacies' },
            { to: '/stockist/pharmacies?tab=Invited', title: 'Circle invites', description: 'Invite pharmacies to Digi' },
            { to: '/stockist/orders?tab=Manual', title: 'Manual order', description: 'Record orders for Circle / offline' },
            { to: '/stockist/orders?tab=Plan', title: 'Batch plan', description: 'Group open orders by week / route' },
            { to: '/stockist/bulk-bill', title: 'Bulk bill', description: 'Issue invoices in batch' },
          ],
        },
        {
          title: 'Products & stock',
          items: [
            { to: '/stockist/products', title: 'Products', description: 'Catalogue + inventory + OCR import' },
            { to: '/stockist/products?tab=price', title: 'Bulk price', description: 'Preview and apply PTR/MRP changes' },
            { to: '/stockist/products?tab=import', title: 'Bill OCR import', description: 'Scan supplier bills into stock' },
            { to: '/stockist/products?tab=schemes', title: 'Schemes', description: 'Product / SKU / category discounts' },
            { to: '/stockist/products?tab=batches&filter=near-expiry', title: 'Near expiry', description: 'Batches expiring within 30 days' },
            { to: '/stockist/price-history', title: 'Price history', description: 'PTR/MRP change log' },
          ],
        },
        {
          title: 'Money',
          items: [
            { to: '/stockist/payments', title: 'Payments', description: 'Review pharmacy payments' },
            { to: '/stockist/payments?tab=Settlements', title: 'Settlements', description: 'Net payouts after commission & MDR' },
            { to: '/stockist/payments?tab=CreditNotes', title: 'Credit notes', description: 'Issued credits' },
            { to: '/stockist/returns', title: 'Returns', description: 'Pharmacy returns' },
          ],
        },
        {
          title: 'Operations',
          items: [
            { to: '/stockist/procurement', title: 'Procurement', description: 'Suppliers, POs, and bills' },
            { to: '/stockist/counterfeit', title: 'Counterfeit', description: 'Report suspect batches' },
            { to: '/stockist/upgrade', title: 'Premium', description: 'Plan upgrade' },
          ],
        },
        {
          title: 'Business',
          items: [
            { to: '/stockist/business', title: 'Business profile', description: 'Bank, PINs, holidays, documents' },
            { to: '/stockist/staff', title: 'Staff', description: 'Invite DeliveryStaff' },
            { to: '/stockist/reports', title: 'Reports (GST / NDPS)', description: 'Export including H/H1/X/NDPS' },
          ],
        },
        {
          title: 'Account',
          items: [
            { to: '/stockist/appearance', title: 'Appearance', description: 'Theme and accent color' },
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
        title="Settings & data"
        subtitle={isDeliveryStaff ? `${business.name} — delivery workspace` : `${business.name} — workspace shortcuts`}
      />
      <MoreHub sections={sections} />
    </div>
  );
}
