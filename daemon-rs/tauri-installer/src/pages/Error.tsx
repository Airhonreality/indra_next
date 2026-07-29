interface ErrorProps {
  message: string;
  onRetry: () => void;
  onCancel: () => void;
}

export default function Error({ message, onRetry, onCancel }: ErrorProps) {
  return (
    <div className="page-container">
      <div className="page-header">
        <h1>Installation Failed</h1>
        <p>Something went wrong during the installation</p>
      </div>

      <div className="page-content">
        <div className="error-icon">⚠️</div>

        <div
          className="info-box"
          style={{
            borderLeftColor: "#d32f2f",
            background: "#ffebee",
            color: "#c62828",
          }}
        >
          <strong>Error:</strong>
          <p style={{ marginTop: "8px", fontFamily: "monospace", fontSize: "12px" }}>
            {message}
          </p>
        </div>

        <div style={{ padding: "20px", background: "#f9f9f9", borderRadius: "6px" }}>
          <h3 style={{ fontSize: "14px", marginBottom: "12px" }}>
            Troubleshooting Steps
          </h3>
          <ol
            style={{
              marginLeft: "20px",
              lineHeight: "1.8",
              fontSize: "14px",
              color: "#666",
            }}
          >
            <li>Ensure your system meets the minimum requirements</li>
            <li>Check that you have sufficient disk space</li>
            <li>Verify that you have administrator/sudo privileges if needed</li>
            <li>Check your internet connection for daemon download</li>
            <li>Temporarily disable antivirus software if it blocks installation</li>
            <li>Review the logs for more details</li>
          </ol>
        </div>

        <div style={{ padding: "12px", background: "#f0f0f0", borderRadius: "6px", fontSize: "12px", color: "#666" }}>
          <strong>Need Help?</strong>
          <p style={{ marginTop: "8px" }}>
            If the problem persists, please visit our{" "}
            <a href="#" style={{ color: "#667eea" }}>
              support page
            </a>{" "}
            or contact our support team.
          </p>
        </div>
      </div>

      <div className="page-footer">
        <button className="button button-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button className="button button-primary" onClick={onRetry}>
          Retry Installation
        </button>
      </div>
    </div>
  );
}
