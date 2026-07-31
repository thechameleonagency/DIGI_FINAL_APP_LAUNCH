import {
  Activity,
  Bell,
  Building2,
  ClipboardCheck,
  FileText,
  Home,
  LifeBuoy,
  Megaphone,
  Settings,
  Shield,
} from 'lucide-react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '../../ui/layout/AppShell';
import {
  AdminAnalytics,
  AdminAnnouncements,
  AdminAudit,
  AdminHome,
  AdminNetwork,
  AdminNotifications,
  AdminOrders,
  AdminPayments,
  AdminSettings,
  AdminSupport,
  AdminSuspensions,
  AdminVerifications,
} from './AdminPages';

const nav = [
  { to: '/admin', label: 'Home', icon: Home, end: true },
  { to: '/admin/verifications', label: 'Verifications', icon: ClipboardCheck },
  { to: '/admin/network', label: 'Network', icon: Building2 },
  { to: '/admin/analytics', label: 'Analytics', icon: Activity },
  { to: '/admin/orders', label: 'Orders', icon: FileText },
  { to: '/admin/payments', label: 'Payments', icon: Activity },
  { to: '/admin/support', label: 'Support', icon: LifeBuoy },
  { to: '/admin/announcements', label: 'Announcements', icon: Megaphone },
  { to: '/admin/suspensions', label: 'Suspensions', icon: Shield },
  { to: '/admin/audit', label: 'Audit', icon: FileText },
  { to: '/admin/settings', label: 'Settings', icon: Settings },
  { to: '/admin/notifications', label: 'Notifications', icon: Bell },
];

const mobileNav = [
  { to: '/admin', label: 'Home', icon: Home, end: true },
  { to: '/admin/verifications', label: 'Verify', icon: ClipboardCheck },
  { to: '/admin/support', label: 'Support', icon: LifeBuoy },
  { to: '/admin/network', label: 'Network', icon: Building2 },
  { to: '/admin/settings', label: 'More', icon: Settings },
];

export function AdminApp() {
  return (
    <Routes>
      <Route element={<AppShell title="Platform Admin" nav={nav} mobileNav={mobileNav} />}>
        <Route index element={<AdminHome />} />
        <Route path="verifications" element={<AdminVerifications />} />
        <Route path="verifications/:id" element={<AdminVerifications />} />
        <Route path="network" element={<AdminNetwork />} />
        <Route path="analytics" element={<AdminAnalytics />} />
        <Route path="orders" element={<AdminOrders />} />
        <Route path="payments" element={<AdminPayments />} />
        <Route path="support" element={<AdminSupport />} />
        <Route path="announcements" element={<AdminAnnouncements />} />
        <Route path="suspensions" element={<AdminSuspensions />} />
        <Route path="audit" element={<AdminAudit />} />
        <Route path="settings" element={<AdminSettings />} />
        <Route path="notifications" element={<AdminNotifications />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Route>
    </Routes>
  );
}
