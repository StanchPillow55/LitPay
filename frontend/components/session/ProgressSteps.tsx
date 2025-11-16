interface ProgressStepsProps {
  currentStep: 'discovery' | 'enrichment' | 'synthesis' | 'completed';
  discoveryComplete: boolean;
  enrichmentCount?: number;
  enrichmentTotal?: number;
}

export function ProgressSteps({
  currentStep,
  discoveryComplete,
  enrichmentCount = 0,
  enrichmentTotal = 0,
}: ProgressStepsProps) {
  const steps = [
    {
      id: 'discovery',
      name: 'Discovery',
      description: 'Finding relevant papers',
      status: discoveryComplete ? 'complete' : currentStep === 'discovery' ? 'active' : 'pending',
    },
    {
      id: 'enrichment',
      name: 'Enrichment',
      description: `Purchasing content (${enrichmentCount}/${enrichmentTotal})`,
      status: currentStep === 'enrichment' ? 'active' : currentStep === 'synthesis' || currentStep === 'completed' ? 'complete' : 'pending',
    },
    {
      id: 'synthesis',
      name: 'Synthesis',
      description: 'Generating report',
      status: currentStep === 'synthesis' ? 'active' : currentStep === 'completed' ? 'complete' : 'pending',
    },
  ];

  return (
    <div className="bg-white rounded-lg shadow-sm p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Progress</h2>
      <nav aria-label="Progress">
        <ol className="space-y-4">
          {steps.map((step, stepIdx) => (
            <li key={step.id}>
              <div className="flex items-start">
                <div className="flex-shrink-0">
                  {step.status === 'complete' ? (
                    <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center">
                      <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </div>
                  ) : step.status === 'active' ? (
                    <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center">
                      <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                    </div>
                  ) : (
                    <div className="w-8 h-8 rounded-full border-2 border-gray-300" />
                  )}
                </div>
                <div className="ml-4 flex-1">
                  <p className={`text-sm font-medium ${
                    step.status === 'complete' ? 'text-green-600' :
                    step.status === 'active' ? 'text-indigo-600' :
                    'text-gray-500'
                  }`}>
                    {step.name}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">{step.description}</p>
                </div>
              </div>
              {stepIdx !== steps.length - 1 && (
                <div className={`ml-4 mt-2 mb-2 w-0.5 h-8 ${
                  step.status === 'complete' ? 'bg-green-500' : 'bg-gray-200'
                }`} />
              )}
            </li>
          ))}
        </ol>
      </nav>
    </div>
  );
}
