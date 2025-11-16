import axios, { AxiosInstance } from 'axios';
import type {
  Session,
  Article,
  LedgerEntry,
  Report,
  PolicyDecision,
  BudgetInfo,
  Artifact,
  EnrichResult,
} from '@/types/api';

class LitPayAPI {
  private client: AxiosInstance;

  constructor(baseUrl: string = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000') {
    this.client = axios.create({
      baseURL: baseUrl,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  // Sessions
  async createSession(userId?: string): Promise<Session> {
    const { data } = await this.client.post<Session>('/api/session', { userId });
    return data;
  }

  async getSession(sessionId: string): Promise<Session> {
    const { data } = await this.client.get<Session>(`/api/session/${sessionId}`);
    return data;
  }

  async getSessions(): Promise<Session[]> {
    const { data } = await this.client.get<Session[]>('/api/sessions');
    return data;
  }

  // Research workflow
  async search(sessionId: string, query: string): Promise<{sessionId: string, query: string, articles: Article[], costEstimate: any}> {
    const { data } = await this.client.post<{sessionId: string, query: string, articles: Article[], costEstimate: any}>(`/api/session/${sessionId}/search`, {
      query,
    });
    return data;
  }

  async enrich(sessionId: string, dois: string[]): Promise<{sessionId: string, results: EnrichResult[], totalCost: number, successCount: number, failureCount: number}> {
    const { data } = await this.client.post<{sessionId: string, results: EnrichResult[], totalCost: number, successCount: number, failureCount: number}>(
      `/api/session/${sessionId}/enrich`,
      { dois }
    );
    return data;
  }

  async synthesize(sessionId: string, prompt?: string): Promise<Report> {
    const { data} = await this.client.post<Report>(`/api/session/${sessionId}/synthesize`, {
      prompt,
    });
    return data;
  }

  // Policy
  async checkBudget(): Promise<BudgetInfo> {
    const { data } = await this.client.get<BudgetInfo>('/api/policy/budget');
    return data;
  }

  async canSpend(
    amount: number,
    context: { sessionId: string; provider: 'x402' | 'stripe'; tag?: string }
  ): Promise<PolicyDecision> {
    const { data } = await this.client.post<PolicyDecision>('/api/policy/can-spend', {
      amountCents: amount,
      ...context,
    });
    return data;
  }

  // Artifacts & Ledger
  async getArtifacts(sessionId: string, type?: string): Promise<Artifact[]> {
    const params = type ? { type } : {};
    const { data } = await this.client.get<{ artifacts: Artifact[] }>(`/api/session/${sessionId}/artifacts`, {
      params,
    });
    return data.artifacts;
  }

  async getLedger(sessionId: string): Promise<LedgerEntry[]> {
    const { data } = await this.client.get<LedgerEntry[]>(`/api/session/${sessionId}/ledger`);
    return data;
  }

  // Upload
  async uploadFile(file: File, sessionId: string): Promise<Artifact> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('sessionId', sessionId);

    const { data } = await this.client.post<Artifact>('/api/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return data;
  }

  // Export
  async exportReport(sessionId: string, format: 'pdf' | 'md' | 'html'): Promise<Blob> {
    const { data } = await this.client.get(`/api/session/${sessionId}/export`, {
      params: { format },
      responseType: 'blob',
    });
    return data;
  }
}

export const api = new LitPayAPI();
