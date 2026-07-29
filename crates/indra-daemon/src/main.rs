use anyhow::Result;
use clap::Parser;
use indra_daemon::config::DaemonConfig;
use indra_daemon::daemon::Daemon;
use std::path::PathBuf;
use tracing_subscriber::EnvFilter;

#[derive(Parser, Debug)]
#[command(name = "indra-daemon")]
#[command(about = "Multi-device sync daemon for Indra", long_about = None)]
struct Args {
    /// Sync root directory
    #[arg(long, short = 's')]
    sync_root: Option<PathBuf>,

    /// Listen host (default: 127.0.0.1)
    #[arg(long, short = 'h')]
    listen_host: Option<String>,

    /// Listen port (default: 9876)
    #[arg(long, short = 'p')]
    listen_port: Option<u16>,

    /// Device name (default: hostname)
    #[arg(long, short = 'd')]
    device_name: Option<String>,

    /// Enable mDNS discovery
    #[arg(long)]
    mdns: bool,

    /// Enable TLS
    #[arg(long)]
    tls: bool,

    /// Verbosity level (can be repeated: -v, -vv, -vvv)
    #[arg(short, action = clap::ArgAction::Count)]
    verbose: u8,
}

#[tokio::main]
async fn main() -> Result<()> {
    let args = Args::parse();

    // Initialize tracing
    let env_filter = match args.verbose {
        0 => EnvFilter::new("info"),
        1 => EnvFilter::new("debug"),
        _ => EnvFilter::new("trace"),
    };

    tracing_subscriber::fmt()
        .with_env_filter(env_filter)
        .with_target(false)
        .with_thread_ids(true)
        .with_line_number(true)
        .init();

    // Load configuration
    let mut config = DaemonConfig::from_env();

    if let Some(sync_root) = args.sync_root {
        config.sync_root = sync_root;
    }

    if let Some(listen_host) = args.listen_host {
        config.listen_host = listen_host;
    }

    if let Some(listen_port) = args.listen_port {
        config.listen_port = listen_port;
    }

    if let Some(device_name) = args.device_name {
        config.device_name = device_name;
    }

    config.mdns_enabled = args.mdns;
    config.tls_enabled = args.tls;

    tracing::info!(
        device_id = %config.device_id,
        device_name = %config.device_name,
        sync_root = %config.sync_root.display(),
        listen_addr = format!("{}:{}", config.listen_host, config.listen_port),
        "Starting Indra Daemon"
    );

    // Create daemon
    let daemon = Daemon::new(config.clone()).await?;

    // Start tasks concurrently
    let heartbeat_interval = config.heartbeat_interval_secs;

    tokio::select! {
        result = daemon.start() => {
            result?;
        }
        result = daemon.start_heartbeat(heartbeat_interval) => {
            result?;
        }
        result = daemon.start_filewatcher() => {
            result?;
        }
    }

    Ok(())
}
