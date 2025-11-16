export interface Session {
  id: string;
  userId?: string;
  createdAt: string;
  updatedAt: string;
  status: 'active' | 'completed' | 'failed';
  totalCostCents: number;
}

export interface Article {
  doi: string;
  title: string;
  authors: string[];
  year: number;
  score: number;
  estimatedCostCents: number;
  source: 'crossref' | 'openalex' | 'unpaywall';
  isOpenAccess: boolean;
  citations: number;
}

export interface LedgerEntry {
  id: string;
  sessionId: string;
  provider: 'x402' | 'stripe';
  amountCents: number;
  status: 'pending' | 'committed' | 'failed';
  metadata: {
    doi?: string;
    txHash?: string;
    blockNumber?: number;
    timestamp: string;
  };
  createdAt: string;
}

export interface Report {
  id: string;
  markdown: string;
  citations: Citation[];
  decisionLog: DecisionLogEntry[];
}

export interface Citation {
  doi: string;
  title: string;
  authors: string[];
  cost: number;
  txHash: string;
}

export interface DecisionLogEntry {
  timestamp: string;
  action: string;
  reason: string;
}

export interface PolicyDecision {
  allow: boolean;
  remainingBudgetCents: number;
  reason?: string;
  reservationId?: string;
}

export interface BudgetInfo {
  dailyBudgetCents: number;
  dailySpentCents: number;
  remainingCents: number;
  sessionCapCents: number;
  perCallMaxCents: number;
}

export interface Artifact {
  id: string;
  sessionId: string;
  type: 'upload' | 'report' | 'receipt';
  s3Key: string;
  metadata: Record<string, any>;
  createdAt: string;
}

export interface ProgressEvent {
  type: 'discovery' | 'enrichment' | 'synthesis';
  status: 'started' | 'progress' | 'completed' | 'failed';
  message: string;
  metadata?: {
    doi?: string;
    cost?: number;
    txHash?: string;
    count?: number;
  };
  timestamp: string;
}

export interface EnrichResult {
  doi: string;
  data: any;
  cost: number;
  txHash?: string;
  provider: 'x402' | 'stripe';
}
