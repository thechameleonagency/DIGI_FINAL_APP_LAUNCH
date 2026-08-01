import {
  BarChart3,
  Building2,
  ClipboardList,
  CreditCard,
  FileText,
  Home,
  MessageSquare,
  Package,
  RotateCcw,
  Search,
  Settings,
  AlertTriangle,
} from 'lucide-react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { RequirePermission } from '../../app/guards';
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
  PharmacyInvoices,
  PharmacyInvoiceDetail,
  PharmacyReturns,
  PharmacySettings,
  PharmacyProfile,
  PharmacyStaff,
  PharmacySupport,
  PharmacyWishlist,
  PharmacySmartOrder,
  PharmacySmartOrderHistory,
  PharmacyQuickOrder,
  PharmacyMarketplace,
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
  { to: '/pharmacy/buy', label: 'Buy', icon: Search, requires: 'order.place' as const },
  { to: '/pharmacy/marketplace', label: 'Marketplace', icon: Search },
  { to: '/pharmacy/smart-order', label: 'Smart Order', icon: Package, requires: 'order.place' as const },
  { to: '/pharmacy/sales', label: 'Sales', icon: CreditCard, requires: 'sale.view' as const },
  { to: '/pharmacy/delivery', label: 'Delivery', icon: Package, requires: 'sale.view' as const },
  { to: '/pharmacy/orders', label: 'Orders', icon: ClipboardList },
  { to: '/pharmacy/payments', label: 'Payments', icon: CreditCard, requires: 'payment.submit' as const },
  { to: '/pharmacy/invoices', label: 'Invoices', icon: FileText, requires: 'payment.submit' as const },
  { to: '/pharmacy/returns', label: 'Returns', icon: RotateCcw, requires: 'return.raise' as const },
  { to: '/pharmacy/inventory', label: 'Inventory', icon: Package, requires: 'inventory.adjust' as const },
  { to: '/pharmacy/connections', label: 'Connections', icon: Building2, requires: 'connection.request' as const },
  { to: '/pharmacy/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/pharmacy/counterfeit', label: 'Counterfeit', icon: AlertTriangle, requires: 'counterfeit.report' as const },
  { to: '/pharmacy/messages', label: 'Messages', icon: MessageSquare },
  { to: '/pharmacy/activity', label: 'Activity', icon: ClipboardList },
  { to: '/pharmacy/settings', label: 'More', icon: Settings },
];

const mobileNav = [
  { to: '/pharmacy', label: 'Home', icon: Home, end: true },
  { to: '/pharmacy/buy', label: 'Buy', icon: Search, requires: 'order.place' as const },
  { to: '/pharmacy/orders', label: 'Orders', icon: ClipboardList },
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
        <Route path="marketplace" element={<PharmacyMarketplace />} />
        <Route element={<RequirePermission action="sale.view" />}>
          <Route path="sales" element={<PharmacySales />} />
          <Route path="sales/:id" element={<PharmacySales />} />
          <Route path="delivery" element={<PharmacyDelivery />} />
        </Route>
        <Route path="orders" element={<PharmacyOrders />} />
        <Route path="orders/:orderNo" element={<PharmacyOrderDetail />} />
        <Route element={<RequirePermission action="payment.submit" />}>
          <Route path="payments" element={<PharmacyPayments />} />
          <Route path="invoices" element={<PharmacyInvoices />} />
          <Route path="invoices/:invoiceNo" element={<PharmacyInvoiceDetail />} />
        </Route>
        <Route element={<RequirePermission action="return.raise" />}>
          <Route path="returns" element={<PharmacyReturns />} />
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
        <Route path="analytics" element={<PharmacyAnalytics />} />
        <Route path="reports" element={<PharmacyReports />} />
        <Route path="help" element={<PharmacyHelp />} />
        <Route path="activity" element={<PharmacyActivity />} />
        <Route path="upgrade" element={<PharmacyUpgrade />} />
        <Route element={<RequirePermission action="counterfeit.report" />}>
          <Route path="counterfeit" element={<PharmacyCounterfeit />} />
        </Route>
        <Route element={<RequirePermission action="staff.manage" />}>
          <Route path="staff" element={<PharmacyStaff />} />
        </Route>
        <Route path="messages" element={<PharmacyMessages />} />
        <Route element={<RequirePermission action="support.manage" />}>
          <Route path="support" element={<PharmacySupport />} />
          <Route path="support/:id" element={<PharmacySupport />} />
        </Route>
        <Route path="notifications" element={<PharmacyNotifications />} />
        <Route path="business" element={<PharmacyBusiness />} />
        <Route path="delivery-preferences" element={<PharmacyDeliveryPreferences />} />
        <Route path="settings" element={<PharmacySettings />} />
        <Route path="profile" element={<PharmacyProfile />} />
        <Route path="more" element={<PharmacySettings />} />
        <Route path="*" element={<Navigate to="/pharmacy" replace />} />
      </Route>
    </Routes>
  );
}
