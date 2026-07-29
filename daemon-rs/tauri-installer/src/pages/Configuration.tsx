import { useState } from "react";

interface ConfigurationProps {
  config: {
    deviceName: string;
    storagePath: string;
  };
  onConfigChange: (config: { deviceName: string; storagePath: string }) => void;
  onNext: () => void;
  onBack: () => void;
  onCancel: () => void;
  error?: string;
}

export default function Configuration({
  config,
  onConfigChange,
  onNext,
  onBack,
  onCancel,
  error,
}: ConfigurationProps) {
  const [localError, setLocalError] = useState<string>("");

  const handleDeviceNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onConfigChange({
      ...config,
      deviceName: e.target.value,
    });
    setLocalError("");
  };

  const handleStoragePathChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onConfigChange({
      ...config,
      storagePath: e.target.value,
    });
    setLocalError("");
  };

  const handleBrowse = () => {
    // This would open a file picker dialog
    // In a real implementation, use Tauri's dialog API
    console.log("Open file picker");
  };

  const getDefaultStoragePath = () => {
    if (typeof window !== "undefined" && navigator.platform.includes("Win")) {
      return `C:\\Users\\${getUsername()}\\Indra Drive`;
    } else {
      return `$HOME/Indra Drive`;
    }
  };

  const getUsername = () => {
    return "User"; // In real app, get from system
  };

  const defaultPath = getDefaultStoragePath();
  const displayPath = config.storagePath || defaultPath;

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>Configuration</h1>
        <p>Set up your device and storage location</p>
      </div>

      <div className="page-content">
        <div className="form-group">
          <label>Device Name</label>
          <input
            type="text"
            placeholder="e.g., My Laptop, Office Computer"
            value={config.deviceName}
            onChange={handleDeviceNameChange}
            maxLength={50}
          />
          <div className="help-text">
            A unique name to identify this device on your Indra network
          </div>
        </div>

        <div className="form-group">
          <label>Storage Location</label>
          <div style={{ display: "flex", gap: "8px" }}>
            <input
              type="text"
              placeholder={defaultPath}
              value={config.storagePath}
              onChange={handleStoragePathChange}
              style={{ flex: 1 }}
            />
            <button className="button button-secondary" onClick={handleBrowse}>
              Browse...
            </button>
          </div>
          <div className="help-text">
            Where Indra Drive data will be stored locally
          </div>
        </div>

        <div className="info-box">
          <strong>Installation Preview:</strong>
          <div style={{ marginTop: "12px", fontFamily: "monospace", fontSize: "12px" }}>
            <div>📁 {displayPath}/</div>
            <div style={{ marginLeft: "20px" }}>
              ├── 📁 .metadata/
            </div>
            <div style={{ marginLeft: "20px" }}>
              ├── 📁 .cache/
            </div>
            <div style={{ marginLeft: "20px" }}>
              └── 📁 .inbox/
            </div>
          </div>
        </div>

        {error && <div className="form-group error">{error}</div>}
        {localError && <div className="form-group error">{localError}</div>}
      </div>

      <div className="page-footer">
        <button className="button button-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button className="button button-secondary" onClick={onBack}>
          ← Back
        </button>
        <button
          className="button button-primary"
          onClick={onNext}
          disabled={!config.deviceName}
        >
          Next →
        </button>
      </div>
    </div>
  );
}
