import {
  Building2,
  ClipboardList,
  CreditCard,
  FileText,
  Home,
  ListPlus,
  MessageSquare,
  Receipt,
  RotateCcw,
  Search,
  Settings,
  Sparkles,
  Truck,
  Warehouse,
} from 'lucide-react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { RequirePermission } from '../../app/guards';
import { AnnouncementsArchivePage } from '../../ui/components/AnnouncementsArchivePage';
import { NotFoundPage } from '../../ui/components/NotFoundPage';
import { AppShell } from '../../ui/layout/AppShell';
import {
  PharmacyAnalytics,
  PharmacyBusiness,
  PharmacyBuy,
  PharmacyCompare,
  PharmacyCart,
  PharmacyProductDetail,
  PharmacyConnections,
  PharmacyLedger,
  PharmacyStockistDetail,
  PharmacyHome,
  PharmacyInventory,
  PharmacyExpiry,
  PharmacyMessages,
  PharmacyNotifications,
  PharmacyOrderDetail,
  PharmacyOrders,
  PharmacyPayments,
  PharmacyPaymentDetail,
  PharmacyInvoices,
  PharmacyInvoiceDetail,
  PharmacyReturns,
  PharmacyReturnDetail,
  PharmacySettings,
  PharmacyProfile,
  PharmacyStaff,
  PharmacySupport,
  PharmacyWishlist,
  PharmacySmartOrder,
  PharmacySmartOrderHistory,
  PharmacyQuickOrder,
  PharmacySales,
  PharmacyDelivery,
  PharmacyDeliveryPreferences,
  PharmacyUpgrade,
  PharmacyCounterfeit,
  PharmacyReports,
  PharmacyHelp,
  PharmacyActivity,
} from './PharmacyPages';

const nav = [
  { to: '/pharmacy', label: 'Home', icon: Home, end: true },
  { to: '/pharmacy/buy', label: 'Buy', icon: Search, section: 'Trade', requires: 'order.place' as const },
  { to: '/pharmacy/smart-order', label: 'Smart order', icon: Sparkles, section: 'Trade', requires: 'order.place' as const },
  { to: '/pharmacy/quick-order', label: 'Quick Order', icon: ListPlus, section: 'Trade', requires: 'order.place' as const },
  { to: '/pharmacy/orders', label: 'Orders', icon: ClipboardList, section: 'Trade', requires: 'order.place' as const },
  { to: '/pharmacy/connections', label: 'Connections', icon: Building2, section: 'Trade', requires: 'connection.request' as const },
  { to: '/pharmacy/payments', label: 'Payments', icon: CreditCard, section: 'Money', requires: 'payment.submit' as const },
  { to: '/pharmacy/invoices', label: 'Invoices', icon: FileText, section: 'Money', requires: 'payment.submit' as const },
  { to: '/pharmacy/returns', label: 'Returns', icon: RotateCcw, section: 'Money', requires: 'return.raise' as const },
  { to: '/pharmacy/sales', label: 'Sales', icon: Receipt, section: 'Money', requires: 'sale.record' as const },
  { to: '/pharmacy/inventory', label: 'Inventory', icon: Warehouse, section: 'Stock', requires: 'inventory.adjust' as const },
  { to: '/pharmacy/delivery', label: 'Delivery', icon: Truck, section: 'Stock', requires: 'delivery.update' as const },
  { to: '/pharmacy/messages', label: 'Messages', icon: MessageSquare, section: 'Workspace', requires: 'order.place' as const },
  { to: '/pharmacy/settings', label: 'More', icon: Settings, section: 'Workspace' },
];

const mobileNav = [
  { to: '/pharmacy', label: 'Home', icon: Home, end: true },
  { to: '/pharmacy/buy', label: 'Buy', icon: Search, requires: 'order.place' as const },
  { to: '/pharmacy/orders', label: 'Orders', icon: ClipboardList, requires: 'order.place' as const },
  { to: '/pharmacy/delivery', label: 'Delivery', icon: Truck, requires: 'delivery.update' as const },
  { to: '/pharmacy/payments', label: 'Pay', icon: CreditCard, requires: 'payment.submit' as const },
  { to: '/pharmacy/settings', label: 'More', icon: Settings },
];

export function PharmacyApp() {
  return (
    <Routes>
      <Route element={<AppShell title="Pharmacy" nav={nav} mobileNav={mobileNav} portal="pharmacy" />}>
        <Route index element={<PharmacyHome />} />
        <Route element={<RequirePermission action="order.place" />}>
          <Route path="buy" element={<PharmacyBuy />} />
          <Route path="buy/:stockistId" element={<PharmacyBuy />} />
          <Route path="product/:productId" element={<PharmacyProductDetail />} />
          <Route path="compare" element={<PharmacyCompare />} />
          <Route path="cart" element={<PharmacyCart />} />
          <Route path="wishlist" element={<PharmacyWishlist />} />
          <Route path="smart-order" element={<PharmacySmartOrder />} />
          <Route path="smart-order/history" element={<PharmacySmartOrderHistory />} />
          <Route path="quick-order" element={<PharmacyQuickOrder />} />
        </Route>
        <Route path="marketplace" element={<Navigate to="/pharmacy/buy?mode=all" replace />} />
        {/* sale.record (not sale.view): DeliveryStaff keeps sale.view for delivery-board context only and must not open POS to edit totals. */}
        <Route element={<RequirePermission action="sale.record" />}>
          <Route path="sales" element={<PharmacySales />} />
          <Route path="sales/:id" element={<PharmacySales />} />
        </Route>
        <Route element={<RequirePermission action="delivery.update" />}>
          <Route path="delivery" element={<PharmacyDelivery />} />
        </Route>
        <Route element={<RequirePermission action="order.place" />}>
          <Route path="orders" element={<PharmacyOrders />} />
          <Route path="orders/:orderNo" element={<PharmacyOrderDetail />} />
        </Route>
        <Route element={<RequirePermission action="payment.submit" />}>
          <Route path="payments" element={<PharmacyPayments />} />
          <Route path="payments/:paymentNo" element={<PharmacyPaymentDetail />} />
          <Route path="invoices" element={<PharmacyInvoices />} />
          <Route path="invoices/:invoiceNo" element={<PharmacyInvoiceDetail />} />
        </Route>
        <Route element={<RequirePermission action="return.raise" />}>
          <Route path="returns" element={<PharmacyReturns />} />
          <Route path="returns/:returnNo" element={<PharmacyReturnDetail />} />
        </Route>
        <Route element={<RequirePermission action="inventory.adjust" />}>
          <Route path="inventory" element={<PharmacyInventory />} />
          <Route path="expiry" element={<PharmacyExpiry />} />
        </Route>
        <Route element={<RequirePermission action="connection.request" />}>
          <Route path="connections" element={<PharmacyConnections />} />
          <Route path="stockists/:stockistId" element={<PharmacyStockistDetail />} />
          <Route path="ledger/:stockistId" element={<PharmacyLedger />} />
        </Route>
        <Route element={<RequirePermission action="order.place" />}>
          <Route path="analytics" element={<PharmacyAnalytics />} />
          <Route path="reports" element={<PharmacyReports />} />
        </Route>
        <Route path="help" element={<PharmacyHelp />} />
        <Route path="announcements" element={<AnnouncementsArchivePage audience="Pharmacy" />} />
        <Route element={<RequirePermission action="staff.manage" />}>
          <Route path="activity" element={<PharmacyActivity />} />
          <Route path="upgrade" element={<PharmacyUpgrade />} />
          <Route path="staff" element={<PharmacyStaff />} />
        </Route>
        <Route element={<RequirePermission action="counterfeit.report" />}>
          <Route path="counterfeit" element={<PharmacyCounterfeit />} />
        </Route>
        <Route element={<RequirePermission action="order.place" />}>
          <Route path="messages" element={<PharmacyMessages />} />
        </Route>
        <Route element={<RequirePermission action="support.manage" />}>
          <Route path="support" element={<PharmacySupport />} />
          <Route path="support/:id" element={<PharmacySupport />} />
        </Route>
        <Route path="notifications" element={<PharmacyNotifications />} />
        <Route element={<RequirePermission action="verification.submit" />}>
          <Route path="business" element={<PharmacyBusiness />} />
          <Route path="delivery-preferences" element={<PharmacyDeliveryPreferences />} />
        </Route>
        <Route path="settings" element={<PharmacySettings />} />
        <Route path="profile" element={<PharmacyProfile />} />
        <Route path="more" element={<PharmacySettings />} />
        <Route path="*" element={<NotFoundPage homeTo="/pharmacy" />} />
      </Route>
    </Routes>
  );
}
