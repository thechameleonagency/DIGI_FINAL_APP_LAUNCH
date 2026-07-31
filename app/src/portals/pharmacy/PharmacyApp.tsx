import {
  BarChart3,
  Building2,
  ClipboardList,
  CreditCard,
  Home,
  MessageSquare,
  Package,
  RotateCcw,
  Search,
  Settings,
  ShoppingCart,
  Users,
  Bell,
  LifeBuoy,
} from 'lucide-react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '../../ui/layout/AppShell';
import {
  PharmacyAnalytics,
  PharmacyBusiness,
  PharmacyBuy,
  PharmacyCart,
  PharmacyConnections,
  PharmacyHome,
  PharmacyInventory,
  PharmacyMessages,
  PharmacyNotifications,
  PharmacyOrderDetail,
  PharmacyOrders,
  PharmacyPayments,
  PharmacyReturns,
  PharmacySettings,
  PharmacyStaff,
  PharmacySupport,
  PharmacyWishlist,
} from './PharmacyPages';

const nav = [
  { to: '/pharmacy', label: 'Home', icon: Home, end: true },
  { to: '/pharmacy/buy', label: 'Buy', icon: Search },
  { to: '/pharmacy/orders', label: 'Orders', icon: ClipboardList },
  { to: '/pharmacy/payments', label: 'Payments', icon: CreditCard },
  { to: '/pharmacy/returns', label: 'Returns', icon: RotateCcw },
  { to: '/pharmacy/inventory', label: 'Inventory', icon: Package },
  { to: '/pharmacy/connections', label: 'Connections', icon: Building2 },
  { to: '/pharmacy/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/pharmacy/staff', label: 'Staff', icon: Users },
  { to: '/pharmacy/messages', label: 'Messages', icon: MessageSquare },
  { to: '/pharmacy/support', label: 'Support', icon: LifeBuoy },
  { to: '/pharmacy/notifications', label: 'Notifications', icon: Bell },
  { to: '/pharmacy/business', label: 'Business', icon: Building2 },
  { to: '/pharmacy/settings', label: 'Settings', icon: Settings },
  { to: '/pharmacy/cart', label: 'Cart', icon: ShoppingCart },
];

const mobileNav = [
  { to: '/pharmacy', label: 'Home', icon: Home, end: true },
  { to: '/pharmacy/buy', label: 'Buy', icon: Search },
  { to: '/pharmacy/orders', label: 'Orders', icon: ClipboardList },
  { to: '/pharmacy/payments', label: 'Pay', icon: CreditCard },
  { to: '/pharmacy/more', label: 'More', icon: Settings },
];

export function PharmacyApp() {
  return (
    <Routes>
      <Route element={<AppShell title="Pharmacy" nav={nav} mobileNav={mobileNav} />}>
        <Route index element={<PharmacyHome />} />
        <Route path="buy" element={<PharmacyBuy />} />
        <Route path="buy/:stockistId" element={<PharmacyBuy />} />
        <Route path="cart" element={<PharmacyCart />} />
        <Route path="wishlist" element={<PharmacyWishlist />} />
        <Route path="orders" element={<PharmacyOrders />} />
        <Route path="orders/:orderNo" element={<PharmacyOrderDetail />} />
        <Route path="payments" element={<PharmacyPayments />} />
        <Route path="returns" element={<PharmacyReturns />} />
        <Route path="inventory" element={<PharmacyInventory />} />
        <Route path="connections" element={<PharmacyConnections />} />
        <Route path="analytics" element={<PharmacyAnalytics />} />
        <Route path="staff" element={<PharmacyStaff />} />
        <Route path="messages" element={<PharmacyMessages />} />
        <Route path="support" element={<PharmacySupport />} />
        <Route path="notifications" element={<PharmacyNotifications />} />
        <Route path="business" element={<PharmacyBusiness />} />
        <Route path="settings" element={<PharmacySettings />} />
        <Route path="more" element={<PharmacySettings />} />
        <Route path="*" element={<Navigate to="/pharmacy" replace />} />
      </Route>
    </Routes>
  );
}
