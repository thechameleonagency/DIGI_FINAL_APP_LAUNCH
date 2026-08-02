import {
  BarChart3,
  Building2,
  ClipboardList,
  CreditCard,
  FileText,
  Home,
  Layers,
  MessageSquare,
  Package,
  PenLine,
  RotateCcw,
  Settings,
  ShoppingBag,
  Truck,
} from 'lucide-react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { RequirePermission } from '../../app/guards';
import { AnnouncementsArchivePage } from '../../ui/components/AnnouncementsArchivePage';
import { NotFoundPage } from '../../ui/components/NotFoundPage';
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
  StockistReturnDetail,
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
  { to: '/stockist', label: 'Home', icon: Home, end: true, section: 'Trade' },
  { to: '/stockist/orders', label: 'Orders', icon: ClipboardList, section: 'Trade', requires: 'order.accept' as const },
  { to: '/stockist/batch-ordering', label: 'Batch plan', icon: Layers, section: 'Trade', requires: 'order.allocate' as const },
  { to: '/stockist/manual-order', label: 'Manual order', icon: PenLine, section: 'Trade', requires: 'order.recordManual' as const },
  { to: '/stockist/pharmacies', label: 'Pharmacies', icon: Building2, section: 'Trade', requires: 'connection.respond' as const },
  { to: '/stockist/catalogue', label: 'Catalogue', icon: ShoppingBag, section: 'Stock', requires: 'catalogue.manage' as const },
  { to: '/stockist/inventory', label: 'Inventory', icon: Package, section: 'Stock', requires: 'inventory.adjust' as const },
  { to: '/stockist/delivery', label: 'Delivery', icon: Truck, section: 'Stock', requires: 'delivery.update' as const },
  { to: '/stockist/payments', label: 'Payments', icon: CreditCard, section: 'Money', requires: 'payment.approve' as const },
  { to: '/stockist/returns', label: 'Returns', icon: RotateCcw, section: 'Money', requires: 'return.approve' as const },
  { to: '/stockist/credit-notes', label: 'Credit notes', icon: FileText, section: 'Money', requires: 'credit.issue' as const },
  { to: '/stockist/analytics', label: 'Analytics', icon: BarChart3, section: 'Workspace', requires: 'order.accept' as const },
  { to: '/stockist/messages', label: 'Messages', icon: MessageSquare, section: 'Workspace', requires: 'order.accept' as const },
  { to: '/stockist/settings', label: 'More', icon: Settings, section: 'Workspace' },
];

const mobileNav = [
  { to: '/stockist', label: 'Home', icon: Home, end: true },
  { to: '/stockist/orders', label: 'Orders', icon: ClipboardList, requires: 'order.accept' as const },
  { to: '/stockist/delivery', label: 'Delivery', icon: Truck, requires: 'delivery.update' as const },
  { to: '/stockist/payments', label: 'Pay', icon: CreditCard, requires: 'payment.approve' as const },
  { to: '/stockist/settings', label: 'More', icon: Settings },
];

export function StockistApp() {
  return (
    <Routes>
      <Route element={<AppShell title="Stockist" nav={nav} mobileNav={mobileNav} portal="stockist" />}>
        <Route index element={<StockistHome />} />
        <Route element={<RequirePermission action="order.accept" />}>
          <Route path="orders" element={<StockistOrders />} />
          <Route path="orders/:orderNo" element={<StockistOrderDetail />} />
          <Route path="batch-ordering" element={<StockistBatchOrdering />} />
          <Route path="analytics" element={<StockistAnalytics />} />
          <Route path="reports" element={<StockistReports />} />
        </Route>
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
          <Route path="returns/:returnNo" element={<StockistReturnDetail />} />
        </Route>
        <Route element={<RequirePermission action="credit.issue" />}>
          <Route path="credit-notes" element={<StockistCreditNotes />} />
        </Route>
        <Route path="help" element={<StockistHelp />} />
        <Route path="announcements" element={<AnnouncementsArchivePage audience="Stockist" />} />
        <Route element={<RequirePermission action="staff.manage" />}>
          <Route path="activity" element={<StockistActivity />} />
          <Route path="upgrade" element={<StockistUpgrade />} />
          <Route path="staff" element={<StockistStaff />} />
        </Route>
        <Route element={<RequirePermission action="counterfeit.report" />}>
          <Route path="counterfeit" element={<StockistCounterfeit />} />
        </Route>
        <Route element={<RequirePermission action="order.accept" />}>
          <Route path="messages" element={<StockistMessages />} />
        </Route>
        <Route element={<RequirePermission action="support.manage" />}>
          <Route path="support" element={<StockistSupport />} />
          <Route path="support/:id" element={<StockistSupport />} />
        </Route>
        <Route path="notifications" element={<StockistNotifications />} />
        <Route element={<RequirePermission action="verification.submit" />}>
          <Route path="business" element={<StockistBusiness />} />
        </Route>
        <Route path="profile" element={<StockistProfile />} />
        <Route path="settings" element={<StockistSettings />} />
        <Route path="*" element={<NotFoundPage homeTo="/stockist" />} />
      </Route>
    </Routes>
  );
}
