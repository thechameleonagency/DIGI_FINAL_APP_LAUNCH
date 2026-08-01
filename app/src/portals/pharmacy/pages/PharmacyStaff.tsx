import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { db } from '../../../data/db';
import { cartTotals, pharmacyOutstanding, productAvailableSellable } from '../../../domain/calc';
import { makeIdempotencyKey } from '../../../domain/utils/idempotency';
import { formatINR } from '../../../domain/utils/money';
import { getCart, setCartLine, toggleWishlist } from '../../../services/catalogueService';
import { cancelConnectionRequest, disconnectConnection, requestConnection } from '../../../services/connectionService';
import { cancelOrder, placeOrder } from '../../../services/orderService';
import { recordGrn } from '../../../services/fulfilmentService';
import { applyCreditNote, submitPayment, submitReturn } from '../../../services/paymentService';
import { createTicket, sendMessage } from '../../../services/supportService';
import { inviteStaff } from '../../../services/authService';
import { pharmacyAnalytics } from '../../../services/analyticsService';
import { useSession } from '../../../store/session';
import { useUi } from '../../../store/ui';
import { AnalyticsDashboard } from '../../../ui/components/AnalyticsDashboard';
import { DataListTable, ListToolbar, PaginationBar, useListControls } from '../../../ui/components/ListToolkit';
import { NotificationsPage } from '../../../ui/components/NotificationsPage';
import { StaffManager } from '../../../ui/components/StaffManager';
import { Button, EmptyState, Field, Input, Kpi, Money, Modal, PageHeader, Select, StatusBadge, Textarea } from '../../../ui/components/primitives';

import { useBiz } from './useBiz';

export function PharmacyStaff() {
  const { business, user } = useBiz();
  return <StaffManager actor={user} business={business} roleOptions={['Manager', 'Staff', 'Accountant', 'DeliveryBoy']} />;
}
