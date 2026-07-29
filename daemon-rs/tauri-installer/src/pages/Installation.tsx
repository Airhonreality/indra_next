import { useState, useEffect } from "react";

interface InstallationProps {
  config: {
    deviceName: string;
    storagePath: string;
  };
  onComplete: () => void;
  onError: (error: string) => void;
}

interface ProgressUpdate {
  step: string;
  progress: number;
  message: string;
  error?: string;
}

export default function Installation({
  config,
  onComplete,
  onError,
}: InstallationProps) {
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState("Initializing...");
  const [logs, setLogs] = useState<string[]>([]);
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    const startInstallation = async () => {
      try {
        setLogs((prev) => [...prev, "Starting installation process..."]);
        setLogs((prev) => [...prev, `Device name: ${config.deviceName}`]);
        setLogs((prev) => [...prev, `Storage path: ${config.storagePath}`]);

        // Simulate installation steps
        const steps = [
          { step: "check_requirements", message: "Checking system requirements", duration: 1000 },
          { step: "download", message: "Downloading daemon binary", duration: 3000 },
          { step: "verify", message: "Verifying checksums", duration: 1000 },
          { step: "setup_storage", message: "Creating storage folders", duration: 1000 },
          { step: "install_service", message: "Installing system service", duration: 2000 },
          { step: "start_service", message: "Starting daemon service", duration: 1500 },
          { step: "validate", message: "Validating installation", duration: 1000 },
          { step: "complete", message: "Installation complete", duration: 500 },
        ];

        let totalDuration = steps.reduce((sum, step) => sum + step.duration, 0);
        let elapsedDuration = 0;

        for (const step of steps) {
          setCurrentStep(step.message);
          setLogs((prev) => [...prev, `[${step.step}] ${step.message}`]);

          await new Promise((resolve) => setTimeout(resolve, step.duration));

          elapsedDuration += step.duration;
          const newProgress = Math.round((elapsedDuration / totalDuration) * 100);
          setProgress(Math.min(newProgress, 95));
        }

        setProgress(100);
        setCurrentStep("Installation complete");
        setLogs((prev) => [...prev, "✓ Installation completed successfully"]);
        setIsComplete(true);

        // Auto-complete after 2 seconds
        await new Promise((resolve) => setTimeout(resolve, 2000));
        onComplete();
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        setLogs((prev) => [...prev, `✗ Error: ${errorMsg}`]);
        onError(errorMsg);
      }
    };

    startInstallation();
  }, [config, onComplete, onError]);

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>Installing...</h1>
        <p>Please wait while we set up Indra Storage Sync</p>
      </div>

      <div className="page-content">
        <div className="progress-container">
          <div className="progress-bar">
            <div
              className="progress-bar-fill"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
          <div className="progress-text">
            <span>{currentStep}</span>
            <span className="percentage">{progress}%</span>
          </div>
        </div>

        <div className="log-container">
          {logs.map((log, index) => (
            <div key={index} className="log-entry">
              {log}
            </div>
          ))}
          <div ref={(el) => el?.scrollIntoView({ behavior: "smooth" })}></div>
        </div>

        {isComplete && (
          <div
            className="info-box"
            style={{ borderLeftColor: "#388e3c", background: "#e8f5e9" }}
          >
            ✓ Installation completed successfully. Your Indra Storage Sync
            service is now running.
          </div>
        )}
      </div>

      <div className="page-footer">
        {!isComplete && (
          <p style={{ color: "#666", fontSize: "12px", flex: 1 }}>
            Do not close this window during installation...
          </p>
        )}
      </div>
    </div>
  );
}
