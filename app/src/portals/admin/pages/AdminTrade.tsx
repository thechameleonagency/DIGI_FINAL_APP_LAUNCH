import { useSearchParams } from 'react-router-dom';
import { ListPageChrome } from '../../../ui/components/ListPageChrome';
import { TabPanel } from '../../../ui/components/primitives';
import { AdminOrders } from './AdminOrders';
import { AdminPayments } from './AdminPayments';
import { AdminReturns } from './AdminReturns';

type TradeTab = 'Orders' | 'Payments' | 'Returns';

function parseTradeTab(raw: string | null): TradeTab {
  if (raw === 'Orders' || raw === 'Payments' || raw === 'Returns') return raw;
  return 'Orders';
}

export function AdminTrade() {
  const [params, setParams] = useSearchParams();
  const tab = parseTradeTab(params.get('tab'));
  const setTab = (nextTab: TradeTab) => {
    const next = new URLSearchParams(params);
    next.set('tab', nextTab);
    setParams(next, { replace: true });
  };

  return (
    <ListPageChrome
      title="Trade"
      subtitle="Platform orders, payments, and returns"
      tabs={[
        { id: 'Orders', label: 'Orders' },
        { id: 'Payments', label: 'Payments' },
        { id: 'Returns', label: 'Returns' },
      ]}
      tab={tab}
      onTab={(id) => setTab(id as TradeTab)}
    >
      <TabPanel id="Orders" active={tab === 'Orders'}>
        <AdminOrders embedded />
      </TabPanel>
      <TabPanel id="Payments" active={tab === 'Payments'}>
        <AdminPayments embedded />
      </TabPanel>
      <TabPanel id="Returns" active={tab === 'Returns'}>
        <AdminReturns embedded />
      </TabPanel>
    </ListPageChrome>
  );
}
