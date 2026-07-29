import { useState, useEffect } from "react";
import Welcome from "./pages/Welcome";
import Configuration from "./pages/Configuration";
import Installation from "./pages/Installation";
import Success from "./pages/Success";
import Error from "./pages/Error";

type InstallationStep = "welcome" | "configuration" | "installation" | "success" | "error";

interface InstallationConfig {
  deviceName: string;
  storagePath: string;
}

export default function App() {
  const [currentStep, setCurrentStep] = useState<InstallationStep>("welcome");
  const [config, setConfig] = useState<InstallationConfig>({
    deviceName: "",
    storagePath: "",
  });
  const [error, setError] = useState<string>("");

  const handleNext = () => {
    switch (currentStep) {
      case "welcome":
        setCurrentStep("configuration");
        break;
      case "configuration":
        if (!config.deviceName || !config.storagePath) {
          setError("Please fill in all fields");
          return;
        }
        setCurrentStep("installation");
        break;
      default:
        break;
    }
  };

  const handleBack = () => {
    switch (currentStep) {
      case "configuration":
        setCurrentStep("welcome");
        break;
      case "installation":
        setCurrentStep("configuration");
        break;
      default:
        break;
    }
  };

  const handleRetry = () => {
    setError("");
    setCurrentStep("configuration");
  };

  const handleCancel = () => {
    window.close();
  };

  const handleComplete = () => {
    setCurrentStep("success");
  };

  const handleError = (errorMsg: string) => {
    setError(errorMsg);
    setCurrentStep("error");
  };

  useEffect(() => {
    // Check system requirements on mount
    const checkRequirements = async () => {
      try {
        const response = await fetch("tauri://invoke/check_requirements");
        const result = await response.json();
        if (!result.is_compatible) {
          handleError("System does not meet requirements");
        }
      } catch (err) {
        console.error("Failed to check requirements:", err);
      }
    };

    checkRequirements();
  }, []);

  return (
    <div className="app-container">
      {currentStep === "welcome" && (
        <Welcome onNext={handleNext} onCancel={handleCancel} />
      )}
      {currentStep === "configuration" && (
        <Configuration
          config={config}
          onConfigChange={setConfig}
          onNext={handleNext}
          onBack={handleBack}
          onCancel={handleCancel}
          error={error}
        />
      )}
      {currentStep === "installation" && (
        <Installation
          config={config}
          onComplete={handleComplete}
          onError={handleError}
        />
      )}
      {currentStep === "success" && (
        <Success onClose={handleCancel} />
      )}
      {currentStep === "error" && (
        <Error message={error} onRetry={handleRetry} onCancel={handleCancel} />
      )}
    </div>
  );
}
