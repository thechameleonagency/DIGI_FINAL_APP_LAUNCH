import {
  BarChart3,
  Bell,
  Building2,
  ClipboardList,
  CreditCard,
  Home,
  LifeBuoy,
  MessageSquare,
  Package,
  RotateCcw,
  Settings,
  ShoppingBag,
  Truck,
  Users,
  FileText,
} from 'lucide-react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '../../ui/layout/AppShell';
import {
  StockistAnalytics,
  StockistCatalogue,
  StockistConnections,
  StockistCreditNotes,
  StockistDelivery,
  StockistHome,
  StockistInventory,
  StockistMessages,
  StockistNotifications,
  StockistOrderDetail,
  StockistOrders,
  StockistPayments,
  StockistReturns,
  StockistSettings,
  StockistStaff,
  StockistSupport,
} from './StockistPages';

const nav = [
  { to: '/stockist', label: 'Home', icon: Home, end: true },
  { to: '/stockist/orders', label: 'Orders', icon: ClipboardList },
  { to: '/stockist/pharmacies', label: 'Pharmacies', icon: Building2 },
  { to: '/stockist/catalogue', label: 'Catalogue', icon: ShoppingBag },
  { to: '/stockist/inventory', label: 'Inventory', icon: Package },
  { to: '/stockist/delivery', label: 'Delivery', icon: Truck },
  { to: '/stockist/payments', label: 'Payments', icon: CreditCard },
  { to: '/stockist/returns', label: 'Returns', icon: RotateCcw },
  { to: '/stockist/credit-notes', label: 'Credit notes', icon: FileText },
  { to: '/stockist/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/stockist/staff', label: 'Staff', icon: Users },
  { to: '/stockist/messages', label: 'Messages', icon: MessageSquare },
  { to: '/stockist/support', label: 'Support', icon: LifeBuoy },
  { to: '/stockist/notifications', label: 'Notifications', icon: Bell },
  { to: '/stockist/settings', label: 'Settings', icon: Settings },
];

const mobileNav = [
  { to: '/stockist', label: 'Home', icon: Home, end: true },
  { to: '/stockist/orders', label: 'Orders', icon: ClipboardList },
  { to: '/stockist/delivery', label: 'Delivery', icon: Truck },
  { to: '/stockist/payments', label: 'Pay', icon: CreditCard },
  { to: '/stockist/settings', label: 'More', icon: Settings },
];

export function StockistApp() {
  return (
    <Routes>
      <Route element={<AppShell title="Stockist" nav={nav} mobileNav={mobileNav} />}>
        <Route index element={<StockistHome />} />
        <Route path="orders" element={<StockistOrders />} />
        <Route path="orders/:orderNo" element={<StockistOrderDetail />} />
        <Route path="pharmacies" element={<StockistConnections />} />
        <Route path="catalogue" element={<StockistCatalogue />} />
        <Route path="inventory" element={<StockistInventory />} />
        <Route path="delivery" element={<StockistDelivery />} />
        <Route path="payments" element={<StockistPayments />} />
        <Route path="returns" element={<StockistReturns />} />
        <Route path="credit-notes" element={<StockistCreditNotes />} />
        <Route path="analytics" element={<StockistAnalytics />} />
        <Route path="staff" element={<StockistStaff />} />
        <Route path="messages" element={<StockistMessages />} />
        <Route path="support" element={<StockistSupport />} />
        <Route path="notifications" element={<StockistNotifications />} />
        <Route path="settings" element={<StockistSettings />} />
        <Route path="*" element={<Navigate to="/stockist" replace />} />
      </Route>
    </Routes>
  );
}
