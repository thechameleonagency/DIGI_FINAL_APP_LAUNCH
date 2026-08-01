import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { db } from '../../../data/db';
import { availableQty, expiryRiskBand, stockistReceivables } from '../../../domain/calc';
import { formatINR } from '../../../domain/utils/money';
import { newId } from '../../../domain/utils/ids';
import { importProductsCsv, upsertProduct } from '../../../services/catalogueService';
import { respondConnection } from '../../../services/connectionService';
import { acceptOrder, rejectOrder } from '../../../services/orderService';
import {
  allocateOrder,
  createAndDispatchDelivery,
  issueInvoice,
  packOrder,
  updateDeliveryStatus,
} from '../../../services/fulfilmentService';
import { applyCreditNote, issueCreditNote, reviewPayment, reviewReturn } from '../../../services/paymentService';
import { createTicket, sendMessage } from '../../../services/supportService';
import { inviteStaff } from '../../../services/authService';
import { stockistAnalytics } from '../../../services/analyticsService';
import { useSession } from '../../../store/session';
import { useUi } from '../../../store/ui';
import { AnalyticsDashboard } from '../../../ui/components/AnalyticsDashboard';
import { DataListTable, ListToolbar, PaginationBar, useListControls } from '../../../ui/components/ListToolkit';
import { ConfirmDialog } from '../../../ui/components/ConfirmDialog';
import { NotificationsPage } from '../../../ui/components/NotificationsPage';
import { StaffManager } from '../../../ui/components/StaffManager';
import { Button, EmptyState, Field, Input, Kpi, Money, PageHeader, Select, StatusBadge, Textarea } from '../../../ui/components/primitives';
import { stockIn } from '../../../services/inventoryService';

import { useBiz } from './useBiz';

export function StockistNotifications() {
  return <NotificationsPage portal="stockist" />;
}
