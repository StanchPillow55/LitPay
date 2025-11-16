'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileDropzone } from '@/components/upload/FileDropzone';
import { Button } from '@/components/shared/Button';
import { api } from '@/lib/api-client';

export default function HomePage() {
  const router = useRouter();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileSelect = (file: File) => {
    setSelectedFile(file);
    setError(null);
  };

  const handleStartSession = async () => {
    if (!selectedFile) {
      setError('Please select a file first');
      return;
    }

    setUploading(true);
    setError(null);

    try {
      // Create session
      const session = await api.createSession();
      
      // Upload file
      await api.uploadFile(selectedFile, session.id);
      
      // Redirect to session page
      router.push(`/session/${session.id}`);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to start session');
      setUploading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Hero Section */}
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          AI Research Assistant with Budget Management
        </h1>
        <p className="text-xl text-gray-600 max-w-3xl mx-auto">
          Upload your research query and let LitPay discover, enrich, and synthesize academic literature with autonomous budget control through x402 micropayments.
        </p>
      </div>

      {/* Upload Section */}
      <div className="max-w-2xl mx-auto">
        <div className="bg-white shadow-sm rounded-lg p-8 mb-6">
          <h2 className="text-2xl font-semibold text-gray-900 mb-6">
            Start Your Research Session
          </h2>
          
          <FileDropzone 
            onFileSelect={handleFileSelect}
            disabled={uploading}
          />

          {error && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          <div className="mt-6 flex justify-end">
            <Button
              size="lg"
              onClick={handleStartSession}
              disabled={!selectedFile || uploading}
              loading={uploading}
            >
              {uploading ? 'Starting Session...' : 'Start Research Session'}
            </Button>
          </div>
        </div>

        {/* Features */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12">
          <div className="bg-white p-6 rounded-lg shadow-sm">
            <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Smart Discovery</h3>
            <p className="text-sm text-gray-600">
              Searches Crossref, OpenAlex, and Unpaywall to find the most relevant papers for your query.
            </p>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm">
            <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Autonomous Payments</h3>
            <p className="text-sm text-gray-600">
              Uses x402/CDP micropayments to purchase gated content within your budget constraints.
            </p>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm">
            <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">AI Synthesis</h3>
            <p className="text-sm text-gray-600">
              Generates comprehensive research reports with citations, findings, and recommendations.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
