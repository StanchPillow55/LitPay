'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api-client';
import type { Session, ProgressEvent, LedgerEntry } from '@/types/api';
import { ProgressSteps } from '@/components/session/ProgressSteps';
import { LiveLog } from '@/components/session/LiveLog';
import { CostBreakdown } from '@/components/session/CostBreakdown';
import { BudgetPill } from '@/components/shared/BudgetPill';
import { Button } from '@/components/shared/Button';

interface PageProps {
  params: { id: string };
}

export default function SessionPage({ params }: PageProps) {
  const { id } = params;
  const [session, setSession] = useState<Session | null>(null);
  const [events, setEvents] = useState<ProgressEvent[]>([]);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [currentStep, setCurrentStep] = useState<'discovery' | 'enrichment' | 'synthesis' | 'completed'>('discovery');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [discovering, setDiscovering] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [articles, setArticles] = useState<any[]>([]);
  const [researchQuery, setResearchQuery] = useState<string>('');

  // Load session data
  useEffect(() => {
    const loadSession = async () => {
      try {
        const sessionData = await api.getSession(id);
        setSession(sessionData);
        
        const ledgerData = await api.getLedger(id);
        setLedger(ledgerData);
        
        // Get extracted query from uploaded file artifact
        const artifacts = await api.getArtifacts(id);
        const uploadArtifact = artifacts.find((a: any) => a.type === 'upload');
        if (uploadArtifact?.metadata?.extractedQuery) {
          setResearchQuery(uploadArtifact.metadata.extractedQuery);
        }
        
        setLoading(false);
      } catch (err: any) {
        setError(err.response?.data?.error || 'Failed to load session');
        setLoading(false);
      }
    };

    loadSession();

    // Poll for updates every 2 seconds (simple approach for MVP)
    const interval = setInterval(loadSession, 2000);
    return () => clearInterval(interval);
  }, [id]);

  // Start discovery workflow
  const handleStartDiscovery = async () => {
    if (!session || !researchQuery) return;

    setDiscovering(true);
    setCurrentStep('discovery');

    try {
      // Call discovery API with extracted query
      const searchResults = await api.search(session.id, researchQuery);
      setArticles(searchResults.articles);

      // Add discovery event
      setEvents(prev => [...prev, {
        type: 'discovery',
        status: searchResults.articles.length > 0 ? 'completed' : 'failed',
        message: searchResults.articles.length > 0 
          ? `Discovery completed - found ${searchResults.articles.length} papers`
          : 'No papers found matching your query. Try a different search.',
        metadata: { count: searchResults.articles.length },
        timestamp: new Date().toISOString()
      }]);

      setDiscovering(false);

      // Only proceed to enrichment if papers were found
      if (searchResults.articles.length === 0) {
        setError('No papers found. Please try uploading a file with a different research topic.');
        return;
      }

      setCurrentStep('enrichment');

      // Start enrichment on top 5 with valid DOIs
      const validDois = searchResults.articles
        .slice(0, 5)
        .map(a => a.doi)
        .filter(doi => doi && doi.trim() !== '');
      
      if (validDois.length > 0) {
        await handleStartEnrichment(validDois);
      } else {
        setError('Papers found but no valid DOIs available');
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Discovery failed');
      setDiscovering(false);
    }
  };

  // Start enrichment workflow
  const handleStartEnrichment = async (dois: string[]) => {
    if (!session || !dois || dois.length === 0) {
      console.error('Invalid enrichment parameters:', { session: !!session, dois });
      return;
    }

    setEnriching(true);

    try {
      console.log('Enriching DOIs:', dois);
      const enrichResponse = await api.enrich(session.id, dois);

      // Add enrichment events from results array
      enrichResponse.results.forEach((result: any) => {
        setEvents(prev => [...prev, {
          type: 'enrichment',
          status: result.success ? 'completed' : 'failed',
          message: result.success ? `Enriched ${result.doi}` : `Failed: ${result.error}`,
          metadata: {
            doi: result.doi,
            cost: result.cost,
            txHash: result.txHash
          },
          timestamp: new Date().toISOString()
        }]);
      });

      setCurrentStep('synthesis');
      setEnriching(false);

      // Add synthesis event
      setEvents(prev => [...prev, {
        type: 'synthesis',
        status: 'started',
        message: 'Generating research report...',
        timestamp: new Date().toISOString()
      }]);

      // Call synthesis API
      await api.synthesize(session.id);

      // Add synthesis completed event
      setEvents(prev => [...prev, {
        type: 'synthesis',
        status: 'completed',
        message: 'Report generated successfully',
        timestamp: new Date().toISOString()
      }]);

      setCurrentStep('completed');

      // Refresh session and ledger
      const updatedSession = await api.getSession(session.id);
      setSession(updatedSession);
      const updatedLedger = await api.getLedger(session.id);
      setLedger(updatedLedger);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Enrichment failed');
      setEnriching(false);
    }
  };


  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4" />
            <p className="text-gray-600">Loading session...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <p className="text-red-800">{error || 'Session not found'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Research Session</h1>
          <p className="text-sm text-gray-500 mt-1">Session ID: {id.substring(0, 8)}...</p>
        </div>
        <BudgetPill 
          remainingCents={1500 - session.totalCostCents} 
          totalCents={1500} 
        />
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Progress */}
        <div className="lg:col-span-1">
          <ProgressSteps
            currentStep={currentStep}
            discoveryComplete={events.some(e => e.type === 'discovery' && e.status === 'completed')}
            enrichmentCount={ledger.filter(e => e.status === 'committed').length}
            enrichmentTotal={15}
          />
          
          <div className="mt-6">
            <CostBreakdown ledger={ledger} />
          </div>
        </div>

        {/* Right Column - Live Log */}
        <div className="lg:col-span-2">
          <LiveLog events={events} />

          {/* Workflow Controls */}
          <div className="mt-6 space-y-3">
            {researchQuery && (
              <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 mb-4">
                <p className="text-sm font-medium text-indigo-900">Research Query</p>
                <p className="text-sm text-indigo-700 mt-1">{researchQuery}</p>
              </div>
            )}
            
            {currentStep === 'discovery' && events.length === 0 && (
              <Button
                size="lg"
                className="w-full"
                onClick={handleStartDiscovery}
                loading={discovering}
                disabled={discovering || !researchQuery}
              >
                {discovering ? 'Discovering Papers...' : 'Start Discovery'}
              </Button>
            )}

            {articles.length > 0 && (
              <div className="bg-white rounded-lg shadow-sm p-4">
                <h3 className="font-semibold text-gray-900 mb-2">Discovered Papers</h3>
                <div className="text-sm text-gray-600 space-y-1">
                  {articles.slice(0, 5).map((article: any, i: number) => (
                    <div key={i} className="flex justify-between">
                      <span className="truncate">{article.title}</span>
                      <span className="text-xs text-gray-500 ml-2">Score: {(article.score * 100).toFixed(0)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {session.status === 'completed' && (
              <Button
                size="lg"
                className="w-full"
                onClick={() => window.location.href = `/session/${id}/report`}
              >
                View Report
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
