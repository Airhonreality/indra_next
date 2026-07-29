//! Indra daemon main entry point

use anyhow::Result;
use indra_core::types::DaemonConfig;
use tracing_subscriber;

#[tokio::main]
async fn main() -> Result<()> {
    // Initialize tracing
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::from_default_env()
                .add_directive(tracing::Level::INFO.into()),
        )
        .init();

    tracing::info!(
        "Starting Indra daemon v{}",
        indra_core::VERSION
    );

    let config = DaemonConfig::default();
    tracing::info!("Configuration: {:?}", config);

    // Main daemon loop
    tracing::info!(
        "Listening on {}:{}",
        config.listen_addr,
        config.listen_port
    );

    // Placeholder: wait for shutdown signal
    tokio::signal::ctrl_c().await?;
    tracing::info!("Shutting down Indra daemon");

    Ok(())
}
