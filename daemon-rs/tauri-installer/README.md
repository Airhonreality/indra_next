# Indra Installer

Tauri-based cross-platform installer for Indra Storage Sync daemon.

## Features

- **Multi-platform support**: Windows (MSI), Linux (deb, snap, AppImage), macOS (dmg)
- **System integration**: Windows Services, systemd (Linux), launchd (macOS)
- **React UI**: Beautiful, responsive installation wizard
- **Daemon management**: Download, install, and start daemon with validation
- **Storage setup**: Automatic creation of local storage folders
- **Rollback**: Automatic cleanup on installation failure

## Development

### Prerequisites

- Node.js 18+ (for frontend)
- Rust 1.56+ (for backend)
- Tauri CLI: `npm install -g @tauri-apps/cli`

### Setup

```bash
# Install frontend dependencies
npm install

# Install Rust dependencies (if needed)
cargo fetch
```

### Development Mode

```bash
# Run in development mode with hot reload
npm run dev

# In another terminal, run the Tauri app
npm run tauri dev
```

### Build

```bash
# Build for all supported platforms
npm run tauri build

# Build for specific target
npm run tauri build -- --target windows
npm run tauri build -- --target linux
npm run tauri build -- --target macos
```

## Structure

```
tauri-installer/
├── src-tauri/                    # Rust backend
│   ├── src/
│   │   ├── main.rs              # App entry point
│   │   ├── lib.rs               # Library module exports
│   │   ├── commands.rs          # Tauri command handlers
│   │   ├── installer.rs         # Installation logic
│   │   └── platform/            # Platform-specific code
│   │       ├── windows.rs
│   │       ├── linux.rs
│   │       └── macos.rs
│   ├── tauri.conf.json          # Tauri configuration
│   └── Cargo.toml               # Rust dependencies
├── src/                          # React frontend
│   ├── main.tsx                 # React entry point
│   ├── App.tsx                  # Main app component
│   ├── index.css                # Global styles
│   └── pages/
│       ├── Welcome.tsx          # Welcome screen
│       ├── Configuration.tsx    # Configuration screen
│       ├── Installation.tsx     # Installation progress
│       ├── Success.tsx          # Success screen
│       └── Error.tsx            # Error screen
├── package.json                 # Frontend dependencies
├── vite.config.ts              # Vite configuration
└── tsconfig.json               # TypeScript configuration
```

## Installation Flow

1. **Welcome**: System requirements check
2. **Configuration**: Device name & storage path selection
3. **Installation**: Daemon download, verification, service setup
4. **Success**: Completion with links and options

## Platform-Specific Details

### Windows
- Creates Windows Service: `IndraStorageSync`
- Registers in HKCU\Software\Indra\IndraStorageSync
- Supports MSI and NSIS installers
- Auto-start on system boot

### Linux
- Creates systemd user service: `indra-storage-sync.service`
- Registers D-Bus service for IPC
- Supports deb, snap, and AppImage formats
- Auto-start via `systemctl --user enable`

### macOS
- Creates LaunchAgent: `com.indra.StorageSync`
- Supports DMG format
- Auto-start on login

## Commands

All commands are exposed via Tauri IPC:

- `check_requirements` - Validate system compatibility
- `download_daemon` - Download daemon binary
- `install_daemon` - Install service and configure
- `create_storage_folder` - Create storage structure
- `validate_installation` - Verify installation
- `uninstall_daemon` - Remove service and cleanup
- `get_installation_status` - Get current status

## Error Handling

- Automatic retry with exponential backoff for downloads
- Rollback on installation failure
- Detailed error messages and logging
- User-friendly error screens

## Testing

### Manual Testing

Windows:
```powershell
# Build MSI
npm run tauri build -- --target windows

# Run installer
.\src-tauri\target\release\bundle\msi\Indra\ Installer_0.1.0_x64_en-US.msi

# Verify service
Get-Service -Name IndraStorageSync
```

Linux:
```bash
# Build deb
npm run tauri build -- --target linux

# Install
sudo apt install ./src-tauri/target/release/bundle/deb/indra-installer_*.deb

# Verify service
systemctl --user status indra-storage-sync
```

### Automated Testing (CI/CD)

See `.github/workflows/` for GitHub Actions workflows that:
- Build on Windows and Linux
- Verify installer execution
- Validate service registration
- Test uninstallation cleanup

## Configuration

Edit `tauri.conf.json` to customize:
- Window size and appearance
- Bundle settings per platform
- Build paths and commands

## Troubleshooting

### Windows
- Run as Administrator for service installation
- Check Windows Event Viewer for service errors
- Ensure UAC allows installer execution

### Linux
- Required for systemd: `systemctl --user daemon-reload`
- D-Bus may require session restart
- Check `/var/log/` for system logs

### macOS
- May require notarization for distribution
- Check `~/Library/Logs/indra-sync.log`
- Verify LaunchAgent permissions

## License

Same as parent project

## References

- [Tauri Documentation](https://tauri.app)
- [React Documentation](https://react.dev)
- [Vite Documentation](https://vitejs.dev)
