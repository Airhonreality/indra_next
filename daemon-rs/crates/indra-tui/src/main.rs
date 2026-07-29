//! Indra TUI entry point

use anyhow::Result;
use indra_core::VERSION;

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::from_default_env()
                .add_directive(tracing::Level::INFO.into()),
        )
        .init();

    tracing::info!("Starting Indra TUI v{}", VERSION);

    // Placeholder: TUI initialization
    println!("Indra Terminal User Interface v{}", VERSION);

    Ok(())
}
