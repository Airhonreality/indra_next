import { useEffect, useState } from "react";

interface WelcomeProps {
  onNext: () => void;
  onCancel: () => void;
}

interface Requirements {
  os: string;
  arch: string;
  min_disk_space_gb: number;
  available_disk_space_gb: number;
  is_compatible: boolean;
}

export default function Welcome({ onNext, onCancel }: WelcomeProps) {
  const [requirements, setRequirements] = useState<Requirements | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkRequirements = async () => {
      try {
        const response = await fetch("http://localhost:3000/check_requirements");
        if (!response.ok) throw new Error("Failed to check requirements");
        const data = await response.json();
        setRequirements(data);
      } catch (error) {
        console.error("Error checking requirements:", error);
        // Default to compatible if we can't check
        setRequirements({
          os: "Unknown",
          arch: "Unknown",
          min_disk_space_gb: 10,
          available_disk_space_gb: 100,
          is_compatible: true,
        });
      } finally {
        setLoading(false);
      }
    };

    checkRequirements();
  }, []);

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>Welcome to Indra Installer</h1>
        <p>Set up Indra Storage Sync on your device</p>
      </div>

      <div className="page-content">
        <div className="info-box">
          <p>
            Indra Storage Sync provides secure, distributed storage for your
            files. This installer will guide you through the setup process.
          </p>
        </div>

        {loading ? (
          <p style={{ textAlign: "center", color: "#999" }}>
            Checking system requirements...
          </p>
        ) : (
          <>
            <div>
              <h3 style={{ fontSize: "14px", marginBottom: "12px" }}>
                System Requirements
              </h3>
              <ul className="requirements-list">
                <li>
                  <span className="icon check">✓</span>
                  <span>OS: {requirements?.os}</span>
                </li>
                <li>
                  <span className="icon check">✓</span>
                  <span>Architecture: {requirements?.arch}</span>
                </li>
                <li
                  className={
                    (requirements?.available_disk_space_gb ?? 0) >=
                    (requirements?.min_disk_space_gb ?? 10)
                      ? ""
                      : "error"
                  }
                >
                  <span
                    className={`icon ${(requirements?.available_disk_space_gb ?? 0) >= (requirements?.min_disk_space_gb ?? 10) ? "check" : "error"}`}
                  >
                    {(requirements?.available_disk_space_gb ?? 0) >=
                    (requirements?.min_disk_space_gb ?? 10)
                      ? "✓"
                      : "✗"}
                  </span>
                  <span>
                    Disk Space: {requirements?.available_disk_space_gb} GB
                    available ({requirements?.min_disk_space_gb} GB required)
                  </span>
                </li>
              </ul>
            </div>

            {requirements?.is_compatible && (
              <div className="info-box">
                ✓ Your system meets all requirements. Click Next to continue.
              </div>
            )}

            {!requirements?.is_compatible && (
              <div
                className="info-box"
                style={{ borderLeftColor: "#d32f2f", background: "#ffebee" }}
              >
                ✗ Your system does not meet the requirements. Please ensure you
                have at least {requirements?.min_disk_space_gb} GB of available
                disk space.
              </div>
            )}
          </>
        )}
      </div>

      <div className="page-footer">
        <button className="button button-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button
          className="button button-primary"
          onClick={onNext}
          disabled={loading || !requirements?.is_compatible}
        >
          Next →
        </button>
      </div>
    </div>
  );
}
