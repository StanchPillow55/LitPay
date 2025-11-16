import { LedgerEntry } from '@/types/api';
import { formatCents } from '@/lib/formatters';

interface CostBreakdownProps {
  ledger: LedgerEntry[];
}

export function CostBreakdown({ ledger }: CostBreakdownProps) {
  const committed = ledger.filter(entry => entry.status === 'committed');
  
  const x402Cost = committed
    .filter(entry => entry.provider === 'x402')
    .reduce((sum, entry) => sum + entry.amountCents, 0);
    
  const stripeConst = committed
    .filter(entry => entry.provider === 'stripe')
    .reduce((sum, entry) => sum + entry.amountCents, 0);
    
  const totalCost = x402Cost + stripeConst;
  
  const x402Count = committed.filter(entry => entry.provider === 'x402').length;
  const stripeCount = committed.filter(entry => entry.provider === 'stripe').length;

  return (
    <div className="bg-white rounded-lg shadow-sm p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Cost Breakdown</h2>
      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <div>
            <p className="text-sm font-medium text-gray-700">x402 Payments</p>
            <p className="text-xs text-gray-500">{x402Count} enrichments</p>
          </div>
          <p className="text-sm font-semibold text-gray-900">{formatCents(x402Cost)}</p>
        </div>
        
        <div className="flex justify-between items-center">
          <div>
            <p className="text-sm font-medium text-gray-700">Stripe</p>
            <p className="text-xs text-gray-500">{stripeCount} transactions</p>
          </div>
          <p className="text-sm font-semibold text-gray-900">{formatCents(stripeConst)}</p>
        </div>
        
        <div className="pt-3 border-t border-gray-200">
          <div className="flex justify-between items-center">
            <p className="text-base font-semibold text-gray-900">Total</p>
            <p className="text-lg font-bold text-indigo-600">{formatCents(totalCost)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
