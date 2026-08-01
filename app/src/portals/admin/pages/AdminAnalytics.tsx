import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../data/db';
import { newId } from '../../../domain/utils/ids';
import { reactivateBusiness, suspendBusiness, adminReviewVerification } from '../../../services/verificationService';
import { updateTicket } from '../../../services/supportService';
import { exportWorkspace, importWorkspace, runPolicyClock } from '../../../services/supportService';
import { platformAnalytics } from '../../../services/analyticsService';
import { useSession } from '../../../store/session';
import { useUi } from '../../../store/ui';
import { AnalyticsDashboard } from '../../../ui/components/AnalyticsDashboard';
import { DataListTable, ListToolbar, PaginationBar, useListControls } from '../../../ui/components/ListToolkit';
import { NotificationsPage } from '../../../ui/components/NotificationsPage';
import { Button, EmptyState, Field, Input, Kpi, Money, PageHeader, Select, StatusBadge, Textarea } from '../../../ui/components/primitives';
import { useBiz } from './useBiz';

export function AdminAnalytics() {
  return (
    <AnalyticsDashboard
      title="Platform analytics"
      subtitle="Governance KPIs recompute from source entities"
      load={() => platformAnalytics()}
    />
  );
}
