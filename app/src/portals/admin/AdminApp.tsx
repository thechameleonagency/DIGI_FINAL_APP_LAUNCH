import {
  Activity,
  Building2,
  ClipboardCheck,
  FileText,
  Home,
  AlertTriangle,
  LifeBuoy,
  PackageMinus,
  Settings,
} from 'lucide-react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { RequirePermission } from '../../app/guards';
import { AnnouncementsArchivePage } from '../../ui/components/AnnouncementsArchivePage';
import { NotFoundPage } from '../../ui/components/NotFoundPage';
import { AppShell } from '../../ui/layout/AppShell';
import { ProfileSecurityPage } from '../../ui/components/ProfileSecurityPage';
import {
  AdminAnalytics,
  AdminAnnouncements,
  AdminAudit,
  AdminBanners,
  AdminBusinessDetail,
  AdminCounterfeit,
  AdminHome,
  AdminNetwork,
  AdminNotifications,
  AdminOrders,
  AdminPayments,
  AdminPlans,
  AdminReports,
  AdminHelp,
  AdminReturns,
  AdminReturnDetail,
  AdminSettings,
  AdminStaff,
  AdminSupport,
  AdminSuspensions,
  AdminVerifications,
} from './AdminPages';

const nav = [
  { to: '/admin', label: 'Home', icon: Home, end: true, section: 'Queues' },
  { to: '/admin/verifications', label: 'Verifications', icon: ClipboardCheck, section: 'Queues', requires: 'verification.review' as const },
  { to: '/admin/orders', label: 'Orders', icon: FileText, section: 'Queues', requires: 'read.platform' as const },
  { to: '/admin/payments', label: 'Payments', icon: Activity, section: 'Queues', requires: 'read.platform' as const },
  { to: '/admin/returns', label: 'Returns', icon: PackageMinus, section: 'Queues', requires: 'read.platform' as const },
  { to: '/admin/support', label: 'Support', icon: LifeBuoy, section: 'Queues', requires: 'support.manage' as const },
  { to: '/admin/network', label: 'Network', icon: Building2, section: 'Governance', requires: 'read.platform' as const },
  { to: '/admin/counterfeit', label: 'Counterfeit', icon: AlertTriangle, section: 'Governance', requires: 'counterfeit.review' as const },
  { to: '/admin/settings', label: 'Settings', icon: Settings, section: 'Content', requires: 'settings.manage' as const },
];

const mobileNav = [
  { to: '/admin', label: 'Home', icon: Home, end: true },
  { to: '/admin/verifications', label: 'Verify', icon: ClipboardCheck, requires: 'verification.review' as const },
  { to: '/admin/support', label: 'Support', icon: LifeBuoy, requires: 'support.manage' as const },
  { to: '/admin/network', label: 'Network', icon: Building2, requires: 'read.platform' as const },
  { to: '/admin/settings', label: 'Settings', icon: Settings, requires: 'settings.manage' as const },
];

export function AdminApp() {
  return (
    <Routes>
      <Route element={<AppShell title="Platform Admin" nav={nav} mobileNav={mobileNav} portal="admin" />}>
        <Route index element={<AdminHome />} />
        <Route element={<RequirePermission action="verification.review" />}>
          <Route path="verifications" element={<AdminVerifications />} />
          <Route path="verifications/:id" element={<AdminVerifications />} />
        </Route>
        <Route element={<RequirePermission action="read.platform" />}>
          <Route path="network" element={<AdminNetwork />} />
          <Route path="network/:id" element={<AdminBusinessDetail />} />
          <Route path="analytics" element={<AdminAnalytics />} />
          <Route path="orders" element={<AdminOrders />} />
          <Route path="orders/:orderNo" element={<AdminOrders />} />
          <Route path="payments" element={<AdminPayments />} />
          <Route path="payments/:paymentNo" element={<AdminPayments />} />
          <Route path="plans" element={<AdminPlans />} />
          <Route path="returns" element={<AdminReturns />} />
          <Route path="returns/:returnNo" element={<AdminReturnDetail />} />
        </Route>
        <Route element={<RequirePermission action="support.manage" />}>
          <Route path="support" element={<AdminSupport />} />
          <Route path="support/:id" element={<AdminSupport />} />
        </Route>
        <Route element={<RequirePermission action="announcement.manage" />}>
          <Route path="announcements" element={<AdminAnnouncements />} />
          <Route path="announcements-archive" element={<AnnouncementsArchivePage audience="Admin" />} />
          <Route path="banners" element={<AdminBanners />} />
        </Route>
        <Route element={<RequirePermission action="counterfeit.review" />}>
          <Route path="counterfeit" element={<AdminCounterfeit />} />
        </Route>
        <Route element={<RequirePermission action="business.suspend" />}>
          <Route path="suspensions" element={<AdminSuspensions />} />
        </Route>
        <Route element={<RequirePermission action="audit.export" />}>
          <Route path="audit" element={<AdminAudit />} />
          <Route path="reports" element={<AdminReports />} />
        </Route>
        <Route element={<RequirePermission action="settings.manage" />}>
          <Route path="settings" element={<AdminSettings />} />
        </Route>
        <Route element={<RequirePermission action="staff.manage" />}>
          <Route path="staff" element={<AdminStaff />} />
        </Route>
        <Route path="profile" element={<ProfileSecurityPage />} />
        <Route path="help" element={<AdminHelp />} />
        <Route path="notifications" element={<AdminNotifications />} />
        <Route path="*" element={<NotFoundPage homeTo="/admin" />} />
      </Route>
    </Routes>
  );
}
