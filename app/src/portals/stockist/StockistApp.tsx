import {
  BarChart3,
  Building2,
  ClipboardList,
  CreditCard,
  Home,
  MessageSquare,
  Package,
  RotateCcw,
  Settings,
  ShoppingBag,
  Truck,
  FileText,
} from 'lucide-react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { RequirePermission } from '../../app/guards';
import { AppShell } from '../../ui/layout/AppShell';
import {
  StockistAnalytics,
  StockistCatalogue,
  StockistCreditNotes,
  StockistDelivery,
  StockistHome,
  StockistExpiry,
  StockistInventory,
  StockistInvoiceDetail,
  StockistMovements,
  StockistMessages,
  StockistNotifications,
  StockistOrderDetail,
  StockistOrders,
  StockistManualOrder,
  StockistPartnerInvites,
  StockistBulkBill,
  StockistProcurement,
  StockistPriceHistory,
  StockistBatchOrdering,
  StockistPayments,
  StockistPharmacyDetail,
  StockistPharmaciesHub,
  StockistManagedPharmacyDetail,
  StockistReturns,
  StockistProfile,
  StockistBusiness,
  StockistSettings,
  StockistStaff,
  StockistSupport,
  StockistUpgrade,
  StockistCounterfeit,
  StockistReports,
  StockistHelp,
  StockistActivity,
} from './StockistPages';

const nav = [
  { to: '/stockist', label: 'Home', icon: Home, end: true },
  { to: '/stockist/orders', label: 'Orders', icon: ClipboardList },
  { to: '/stockist/batch-ordering', label: 'Batch plan', icon: ClipboardList },
  { to: '/stockist/manual-order', label: 'Manual order', icon: ClipboardList, requires: 'order.recordManual' as const },
  { to: '/stockist/pharmacies', label: 'Pharmacies', icon: Building2, requires: 'connection.respond' as const },
  { to: '/stockist/catalogue', label: 'Catalogue', icon: ShoppingBag, requires: 'catalogue.manage' as const },
  { to: '/stockist/inventory', label: 'Inventory', icon: Package, requires: 'inventory.adjust' as const },
  { to: '/stockist/delivery', label: 'Delivery', icon: Truck, requires: 'delivery.update' as const },
  { to: '/stockist/payments', label: 'Payments', icon: CreditCard, requires: 'payment.approve' as const },
  { to: '/stockist/returns', label: 'Returns', icon: RotateCcw, requires: 'return.approve' as const },
  { to: '/stockist/credit-notes', label: 'Credit notes', icon: FileText, requires: 'credit.issue' as const },
  { to: '/stockist/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/stockist/messages', label: 'Messages', icon: MessageSquare },
  { to: '/stockist/settings', label: 'More', icon: Settings },
];

const mobileNav = [
  { to: '/stockist', label: 'Home', icon: Home, end: true },
  { to: '/stockist/orders', label: 'Orders', icon: ClipboardList },
  { to: '/stockist/delivery', label: 'Delivery', icon: Truck, requires: 'delivery.update' as const },
  { to: '/stockist/payments', label: 'Pay', icon: CreditCard, requires: 'payment.approve' as const },
  { to: '/stockist/settings', label: 'More', icon: Settings },
];

export function StockistApp() {
  return (
    <Routes>
      <Route element={<AppShell title="Stockist" nav={nav} mobileNav={mobileNav} portal="stockist" />}>
        <Route index element={<StockistHome />} />
        <Route path="orders" element={<StockistOrders />} />
        <Route path="orders/:orderNo" element={<StockistOrderDetail />} />
        <Route path="batch-ordering" element={<StockistBatchOrdering />} />
        <Route element={<RequirePermission action="order.recordManual" />}>
          <Route path="manual-order" element={<StockistManualOrder />} />
        </Route>
        <Route element={<RequirePermission action="connection.respond" />}>
          <Route path="pharmacies" element={<StockistPharmaciesHub />} />
          <Route path="pharmacies/managed/:managedId" element={<StockistManagedPharmacyDetail />} />
          <Route path="pharmacies/:pharmacyId" element={<StockistPharmacyDetail />} />
        </Route>
        <Route element={<RequirePermission action="partner.invite" />}>
          <Route path="invites" element={<StockistPartnerInvites />} />
        </Route>
        <Route element={<RequirePermission action="catalogue.manage" />}>
          <Route path="catalogue" element={<StockistCatalogue />} />
          <Route path="price-history" element={<StockistPriceHistory />} />
        </Route>
        <Route element={<RequirePermission action="inventory.adjust" />}>
          <Route path="inventory" element={<StockistInventory />} />
          <Route path="movements" element={<StockistMovements />} />
          <Route path="expiry" element={<StockistExpiry />} />
        </Route>
        <Route element={<RequirePermission action="delivery.update" />}>
          <Route path="delivery" element={<StockistDelivery />} />
        </Route>
        <Route element={<RequirePermission action="payment.approve" />}>
          <Route path="payments" element={<StockistPayments />} />
          <Route path="invoices/:invoiceNo" element={<StockistInvoiceDetail />} />
        </Route>
        <Route element={<RequirePermission action="invoice.issue" />}>
          <Route path="bulk-bill" element={<StockistBulkBill />} />
        </Route>
        <Route element={<RequirePermission action="po.manage" />}>
          <Route path="procurement" element={<StockistProcurement />} />
        </Route>
        <Route element={<RequirePermission action="return.approve" />}>
          <Route path="returns" element={<StockistReturns />} />
        </Route>
        <Route element={<RequirePermission action="credit.issue" />}>
          <Route path="credit-notes" element={<StockistCreditNotes />} />
        </Route>
        <Route path="analytics" element={<StockistAnalytics />} />
        <Route path="reports" element={<StockistReports />} />
        <Route path="help" element={<StockistHelp />} />
        <Route path="activity" element={<StockistActivity />} />
        <Route path="upgrade" element={<StockistUpgrade />} />
        <Route element={<RequirePermission action="counterfeit.report" />}>
          <Route path="counterfeit" element={<StockistCounterfeit />} />
        </Route>
        <Route element={<RequirePermission action="staff.manage" />}>
          <Route path="staff" element={<StockistStaff />} />
        </Route>
        <Route path="messages" element={<StockistMessages />} />
        <Route element={<RequirePermission action="support.manage" />}>
          <Route path="support" element={<StockistSupport />} />
          <Route path="support/:id" element={<StockistSupport />} />
        </Route>
        <Route path="notifications" element={<StockistNotifications />} />
        <Route path="business" element={<StockistBusiness />} />
        <Route path="profile" element={<StockistProfile />} />
        <Route path="settings" element={<StockistSettings />} />
        <Route path="*" element={<Navigate to="/stockist" replace />} />
      </Route>
    </Routes>
  );
}
