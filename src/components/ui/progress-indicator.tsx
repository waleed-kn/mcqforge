type ProgressIndicatorProps = {
  steps: readonly string[];
  currentStep: number;
};

export function ProgressIndicator({
  steps,
  currentStep,
}: ProgressIndicatorProps) {
  return (
    <nav className="progress-indicator" aria-label="Test setup progress">
      {steps.map((step, index) => (
        <div className="progress-step-wrap" key={step}>
          {index > 0 && <span className="progress-divider" aria-hidden="true" />}
          <span
            className="progress-step"
            aria-current={index === currentStep ? "step" : undefined}
          >
            <span className="progress-step-number" aria-hidden="true">
              {String(index + 1).padStart(2, "0")}
            </span>
            {step}
          </span>
        </div>
      ))}
    </nav>
  );
}
