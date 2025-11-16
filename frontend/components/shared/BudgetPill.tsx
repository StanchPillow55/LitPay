'use client';

import { formatCentsCompact } from '@/lib/formatters';

interface BudgetPillProps {
  remainingCents: number;
  totalCents: number;
}

export function BudgetPill({ remainingCents, totalCents }: BudgetPillProps) {
  const percentage = (remainingCents / totalCents) * 100;
  
  const getColor = () => {
    if (percentage > 50) return 'bg-green-100 text-green-800';
    if (percentage > 25) return 'bg-yellow-100 text-yellow-800';
    return 'bg-red-100 text-red-800';
  };

  return (
    <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${getColor()}`}>
      <span>Budget: {formatCentsCompact(remainingCents)} remaining</span>
    </div>
  );
}
