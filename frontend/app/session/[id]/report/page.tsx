'use client';

import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { api } from '@/lib/api-client';
import { Button } from '@/components/shared/Button';
import { formatCents, shortenHash } from '@/lib/formatters';
import type { LedgerEntry } from '@/types/api';

interface PageProps {
  params: { id: string };
}

export default function ReportPage({ params }: PageProps) {
  const { id } = params;
  const [markdown, setMarkdown] = useState<string>('');
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadReport = async () => {
      try {
        // Fetch ledger data for transaction receipts
        const ledgerData = await api.getLedger(id);
        setLedger(ledgerData);

        // Fetch artifacts to get the generated report
        const artifactsResponse = await api.getArtifacts(id);
        const reportArtifact = artifactsResponse.find((a: any) => a.type === 'report');

        if (reportArtifact && reportArtifact.metadata?.report?.markdown) {
          // Use the Claude-generated markdown from artifacts
          setMarkdown(reportArtifact.metadata.report.markdown);
        } else {
          // Fallback if report hasn't been generated yet
          setMarkdown('# Report Not Generated\n\nPlease complete the synthesis step to generate the report.');
        }

        setLoading(false);
      } catch (err: any) {
        setError(err.response?.data?.error || 'Failed to load report');
        setLoading(false);
      }
    };

    loadReport();
  }, [id]);

  const handleExport = async (format: 'pdf' | 'md' | 'html') => {
    setExporting(true);
    try {
      const blob = await api.exportReport(id, format);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `report-${id}.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      alert('Export failed: ' + (err.response?.data?.error || err.message));
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4" />
            <p className="text-gray-600">Loading report...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <p className="text-red-800">{error}</p>
        </div>
      </div>
    );
  }

  const committedEntries = ledger.filter(e => e.status === 'committed');

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Research Report</h1>
          <p className="text-sm text-gray-500 mt-1">Session ID: {id.substring(0, 8)}...</p>
        </div>
        <div className="flex space-x-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => handleExport('md')}
            disabled={exporting}
          >
            Export MD
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => handleExport('html')}
            disabled={exporting}
          >
            Export HTML
          </Button>
          <Button
            size="sm"
            onClick={() => handleExport('pdf')}
            disabled={exporting}
            loading={exporting}
          >
            Export PDF
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Report Content */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-lg shadow-sm p-8 prose prose-slate max-w-none [&_*]:text-gray-900 [&_h1]:text-gray-900 [&_h2]:text-gray-900 [&_h3]:text-gray-900 [&_p]:text-gray-900 [&_li]:text-gray-900 [&_strong]:text-gray-900">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {markdown}
            </ReactMarkdown>
          </div>
        </div>

        {/* Transaction Receipts Sidebar */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-lg shadow-sm p-6 sticky top-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Transaction Receipts
            </h2>
            <div className="space-y-4">
              {committedEntries.length === 0 ? (
                <p className="text-sm text-gray-500">No transactions yet</p>
              ) : (
                committedEntries.map((entry) => (
                  <div
                    key={entry.id}
                    className="border border-gray-200 rounded-lg p-4"
                  >
                    <div className="space-y-2 text-sm">
                      <div>
                        <span className="font-medium text-gray-700">DOI:</span>
                        <p className="text-gray-600 break-all">
                          {entry.metadata.doi || 'N/A'}
                        </p>
                      </div>
                      <div>
                        <span className="font-medium text-gray-700">Cost:</span>
                        <p className="text-gray-600">{formatCents(entry.amountCents)}</p>
                      </div>
                      <div>
                        <span className="font-medium text-gray-700">Provider:</span>
                        <p className="text-gray-600">{entry.provider}</p>
                      </div>
                      {entry.metadata.txHash && (
                        <div>
                          <span className="font-medium text-gray-700">Tx Hash:</span>
                          <p className="text-gray-600 font-mono text-xs">
                            {shortenHash(entry.metadata.txHash, 6)}
                          </p>
                        </div>
                      )}
                      {entry.metadata.blockNumber && (
                        <div>
                          <span className="font-medium text-gray-700">Block:</span>
                          <p className="text-gray-600">{entry.metadata.blockNumber}</p>
                        </div>
                      )}
                      <div className="pt-2 border-t border-gray-200">
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          ✓ Confirmed
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              )}
              
              <div className="pt-4 border-t border-gray-300">
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-gray-900">Total Session Cost:</span>
                  <span className="text-lg font-bold text-indigo-600">
                    {formatCents(committedEntries.reduce((sum, e) => sum + e.amountCents, 0))}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
