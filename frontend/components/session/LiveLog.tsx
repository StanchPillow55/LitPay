'use client';

import { useEffect, useRef } from 'react';
import { ProgressEvent } from '@/types/api';
import { formatTimestamp, formatCents, shortenHash } from '@/lib/formatters';

interface LiveLogProps {
  events: ProgressEvent[];
}

export function LiveLog({ events }: LiveLogProps) {
  const logRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new events arrive
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [events]);

  return (
    <div className="bg-white rounded-lg shadow-sm p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Live Log</h2>
      <div
        ref={logRef}
        className="bg-gray-50 rounded-lg p-4 h-96 overflow-y-auto font-mono text-sm"
      >
        {events.length === 0 ? (
          <p className="text-gray-500 text-center py-8">
            Waiting for session to start...
          </p>
        ) : (
          <div className="space-y-2">
            {events.map((event, index) => (
              <div key={index} className="flex items-start space-x-2">
                <span className="text-gray-500 text-xs whitespace-nowrap">
                  [{formatTimestamp(event.timestamp)}]
                </span>
                <div className="flex-1">
                  <span className={`${
                    event.status === 'completed' ? 'text-green-600' :
                    event.status === 'failed' ? 'text-red-600' :
                    event.status === 'progress' ? 'text-blue-600' :
                    'text-gray-700'
                  }`}>
                    {event.status === 'completed' && '✓ '}
                    {event.status === 'failed' && '✗ '}
                    {event.message}
                  </span>
                  {event.metadata && (
                    <div className="text-xs text-gray-600 mt-1 ml-4">
                      {event.metadata.doi && (
                        <div>DOI: {event.metadata.doi}</div>
                      )}
                      {event.metadata.cost !== undefined && (
                        <div>Cost: {formatCents(event.metadata.cost)}</div>
                      )}
                      {event.metadata.txHash && (
                        <div>Tx: {shortenHash(event.metadata.txHash, 6)}</div>
                      )}
                      {event.metadata.count !== undefined && (
                        <div>Found: {event.metadata.count} results</div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
