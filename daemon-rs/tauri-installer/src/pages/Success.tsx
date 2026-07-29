import { useState } from "react";

interface SuccessProps {
  onClose: () => void;
}

export default function Success({ onClose }: SuccessProps) {
  const [launchUI] = useState(false);

  const handleLaunchUI = () => {
    // Launch the Indra UI application
    // This would call a Tauri command to open the UI
    console.log("Launching Indra UI...");
  };

  const handleCreateShortcut = () => {
    // Create desktop shortcut
    console.log("Creating desktop shortcut...");
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>Installation Successful</h1>
        <p>Indra Storage Sync is ready to use</p>
      </div>

      <div className="page-content">
        <div className="success-icon">🎉</div>

        <div className="info-box" style={{ borderLeftColor: "#388e3c", background: "#e8f5e9" }}>
          <strong>What's next?</strong>
          <ul
            style={{
              marginTop: "12px",
              marginLeft: "20px",
              lineHeight: "1.8",
            }}
          >
            <li>Your Indra Storage Sync service is now active</li>
            <li>
              Local files are synced to <code>~/Indra Drive</code>
            </li>
            <li>You can access the web UI to manage your storage</li>
            <li>Check the system tray for service status</li>
          </ul>
        </div>

        <div style={{ padding: "20px", background: "#f9f9f9", borderRadius: "6px" }}>
          <h3 style={{ fontSize: "14px", marginBottom: "12px" }}>
            Quick Links
          </h3>
          <ul
            style={{
              listStyle: "none",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
              fontSize: "14px",
            }}
          >
            <li>
              📖{" "}
              <a
                href="#"
                style={{ color: "#667eea", textDecoration: "none" }}
              >
                View Documentation
              </a>
            </li>
            <li>
              🐛{" "}
              <a
                href="#"
                style={{ color: "#667eea", textDecoration: "none" }}
              >
                Report Issues
              </a>
            </li>
            <li>
              💬{" "}
              <a
                href="#"
                style={{ color: "#667eea", textDecoration: "none" }}
              >
                Get Support
              </a>
            </li>
          </ul>
        </div>

        <div style={{ padding: "12px", background: "#f0f0f0", borderRadius: "6px", fontSize: "12px", color: "#666" }}>
          <strong>Troubleshooting:</strong>
          <p style={{ marginTop: "8px" }}>
            If the service doesn't start automatically, you can manually start
            it using system controls. For Windows, check Services; for Linux,
            use <code>systemctl --user status indra-storage-sync</code>.
          </p>
        </div>
      </div>

      <div className="page-footer">
        <button className="button button-secondary" onClick={handleCreateShortcut}>
          Create Shortcut
        </button>
        <button className="button button-primary" onClick={handleLaunchUI}>
          Open Web UI
        </button>
        <button className="button button-primary" onClick={onClose}>
          Finish
        </button>
      </div>
    </div>
  );
}
