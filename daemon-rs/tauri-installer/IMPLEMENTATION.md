# Tauri Installer Implementation Guide

## Overview

This document describes the complete implementation of the Indra Installer based on Plan 04.

## Architecture

### Frontend (React + TypeScript)
- **Entry Point**: `src/main.tsx` → React root
- **Main App**: `src/App.tsx` → Installation state machine
- **Pages**: 
  - `Welcome.tsx` → System requirements check
  - `Configuration.tsx` → User settings
  - `Installation.tsx` → Progress tracking
  - `Success.tsx` → Completion screen
  - `Error.tsx` → Error handling
- **Styling**: `index.css` → Responsive design with gradient theme

### Backend (Rust + Tauri)
- **Entry Point**: `src/main.rs` → Tauri app initialization
- **Commands**: `src/commands.rs` → IPC handlers
- **Logic**: `src/installer.rs` → Installation workflow
- **Platforms**: `src/platform/{windows,linux,macos}.rs` → OS-specific code

## Build Configuration

### Tauri Configuration (`tauri.conf.json`)
- App metadata and versioning
- Window settings (800x600, fixed aspect ratio, always on top)
- Bundle targets (MSI, NSIS for Windows; deb, snap for Linux; dmg for macOS)
- Security policies

### Vite Configuration (`vite.config.ts`)
- React plugin for JSX support
- Terser minification for production

### TypeScript Configuration (`tsconfig.json`)
- ES2020 target with DOM types
- Strict mode enabled
- No unused parameters/variables

## Installation Flow

### Phase 1: Welcome Screen
```
↓ Check Requirements
├─ OS detection (Windows/Linux/macOS)
├─ Architecture detection (x86_64/aarch64)
├─ Disk space validation (>10GB required)
└─ Display compatibility status
```

### Phase 2: Configuration
```
↓ User Input
├─ Device name (max 50 chars)
├─ Storage path selection
├─ Preview folder structure
└─ Validate inputs
```

### Phase 3: Installation
```
↓ Async Installation Process
├─ Download daemon binary
│  ├─ Platform-specific URL
│  ├─ Retry with exponential backoff (3 attempts)
│  └─ SHA256 checksum validation
├─ Create storage folders
│  ├─ ~/Indra Drive (main)
│  ├─ .metadata (config)
│  ├─ .cache (temporary)
│  └─ .inbox (sync queue)
├─ Install system service
│  ├─ Windows: SC.EXE with registry entries
│  ├─ Linux: systemd + D-Bus service
│  └─ macOS: launchd plist
├─ Start daemon service
├─ Validate installation
└─ Report progress in real-time
```

### Phase 4: Success
```
✓ Show completion confirmation
├─ Quick links (docs, support, issues)
├─ Options: Launch UI, Create Shortcut, Finish
└─ Next steps information
```

## Platform-Specific Implementation

### Windows (`src/platform/windows.rs`)
**Service Creation**:
- Service name: `IndraStorageSync`
- Type: `SERVICE_WIN32_OWN_PROCESS`
- Start: `SERVICE_AUTO_START`
- Command: `sc.exe create IndraStorageSync ...`

**Registry Entries** (HKCU\Software\Indra\IndraStorageSync):
- DeviceName
- InstallPath
- Version
- State

**COM DLL Registration**:
- Hook for future CFAPI integration
- Uses `regsvr32.exe /s`

**Uninstall**:
```powershell
sc.exe delete IndraStorageSync
reg.exe delete HKCU\Software\Indra\IndraStorageSync /f
```

### Linux (`src/platform/linux.rs`)
**Systemd Service**:
- Location: `~/.config/systemd/user/indra-storage-sync.service`
- Type: `Type=simple`
- Restart: `on-failure` with 10s delay
- Enable: `systemctl --user enable indra-storage-sync`

**D-Bus Service**:
- Location: `~/.local/share/dbus-1/services/com.indra.StorageSync.service`
- Allows IPC communication with UI

**Uninstall**:
```bash
systemctl --user stop indra-storage-sync
systemctl --user disable indra-storage-sync
systemctl --user daemon-reload
rm ~/.config/systemd/user/indra-storage-sync.service
```

### macOS (`src/platform/macos.rs`)
**LaunchAgent**:
- Location: `~/Library/LaunchAgents/com.indra.StorageSync.plist`
- RunAtLoad: enabled
- KeepAlive: enabled
- Logging: `~/Library/Logs/indra-sync.log`

**Uninstall**:
```bash
launchctl unload ~/Library/LaunchAgents/com.indra.StorageSync.plist
rm ~/Library/LaunchAgents/com.indra.StorageSync.plist
```

## Error Handling

### Download Failures
- Retry up to 3 times with exponential backoff (100ms × attempt)
- Fallback endpoints (if configured)
- Checksum validation on each retry

### Service Installation Failures
- Automatic rollback of previous steps
- Detailed error messages with troubleshooting hints
- Logs preserved for diagnostics

### Uninstall Failures
- Non-blocking on registry cleanup
- Preserves user data in `~/Indra Drive`
- Logs cleanup errors for review

## Tauri Commands

All commands are exposed via Tauri IPC and support progress channels:

```typescript
// Check system requirements
await invoke('check_requirements')
// Returns: { os, arch, min_disk_space_gb, available_disk_space_gb, is_compatible }

// Download daemon binary
await invoke('download_daemon', { 
  daemon_version: '0.1.0',
  on_progress: progressChannel 
})
// Returns: PathBuf to downloaded binary

// Install daemon with service registration
await invoke('install_daemon', { 
  config: { deviceName, storagePath },
  daemon_path: pathBuf,
  on_progress: progressChannel 
})

// Create storage folder structure
await invoke('create_storage_folder', { path: pathBuf })

// Validate installation integrity
await invoke('validate_installation')
// Returns: boolean

// Uninstall daemon
await invoke('uninstall_daemon', { on_progress: progressChannel })

// Get installation status
await invoke('get_installation_status')
// Returns: "running" | "stopped" | "not_installed" | "unknown"
```

## Continuous Integration

### Build Workflow (`.github/workflows/build.yml`)
1. **Windows Build**
   - Rust toolchain for x86_64-pc-windows-msvc
   - Frontend build with npm
   - MSI/NSIS packaging
   - Artifact upload

2. **Linux Build**
   - Rust toolchain for x86_64-unknown-linux-gnu
   - GTK3 and OpenSSL dev dependencies
   - DEB/snap/AppImage packaging
   - Artifact upload

3. **TypeScript Linting**
   - `tsc --noEmit` for type checking
   - Validates JSX/React code

4. **Cargo Checks**
   - `cargo check` for compilation
   - `cargo test --lib` for unit tests

### Install Test Workflow (`.github/workflows/test-install.yml`)
1. **Windows Tests**
   - Verify service not present before install
   - Run installer
   - Check service registration
   - Test uninstall cleanup

2. **Linux Tests**
   - Verify service not present before install
   - Check systemd service file creation
   - Validate D-Bus registration
   - Test uninstall preserves data

3. **Artifact Verification**
   - Confirm all platform installers created
   - Ready for distribution

## Local Development

### Setup
```bash
cd tauri-installer
npm install
cargo fetch
```

### Development Mode
```bash
# Terminal 1: Frontend dev server
npm run dev

# Terminal 2: Tauri app with hot reload
npm run tauri dev
```

### Build
```bash
# Windows MSI
npm run tauri build -- --target x86_64-pc-windows-msvc

# Linux x86_64
npm run tauri build -- --target x86_64-unknown-linux-gnu

# macOS (requires macOS)
npm run tauri build -- --target x86_64-apple-darwin
```

## Testing

### Manual Testing

**Windows**:
```powershell
# Build
npm run tauri build -- --target x86_64-pc-windows-msvc

# Run installer (as Administrator)
.\src-tauri\target\release\bundle\msi\Indra\ Installer_*.msi

# Verify
Get-Service -Name IndraStorageSync
Get-ChildItem "$env:USERPROFILE\Indra Drive"
reg query "HKCU\Software\Indra\IndraStorageSync"

# Uninstall
.\src-tauri\target\release\bundle\msis\Indra\ Installer_*.msi /uninstall
```

**Linux**:
```bash
# Build
npm run tauri build -- --target x86_64-unknown-linux-gnu

# Install
sudo dpkg -i ./src-tauri/target/release/bundle/deb/indra-installer_*.deb

# Verify
systemctl --user status indra-storage-sync
ls -la ~/Indra\ Drive/

# Uninstall
sudo dpkg -r indra-installer
```

### Automated Tests
- Unit tests in `src/` with `#[test]`
- Integration tests in `tests/integration_tests.rs`
- CI workflows run on push and pull requests

## Distribution

### Artifacts Generated
```
Windows:
  - Indra Installer_0.1.0_x64_en-US.msi
  - Indra Installer_0.1.0_x64-setup.exe (NSIS)

Linux:
  - indra-installer_0.1.0_amd64.deb
  - indra-installer_0.1.0_amd64.snap
  - indra-installer_0.1.0_amd64.AppImage

macOS:
  - Indra Installer_0.1.0_x64.dmg
  - Indra Installer_0.1.0_aarch64.dmg
```

### Release Process
1. Build on CI completes successfully
2. Download artifacts from GitHub Actions
3. Sign/notarize if required
4. Upload to CDN or release repository
5. Update download page with new version

## Troubleshooting

### Windows Issues
- **UAC Prompt**: Expected for service installation
- **Service won't start**: Check Event Viewer for errors
- **Registry errors**: May need admin privileges
- **Port conflicts**: Check for other services on same ports

### Linux Issues
- **Systemd errors**: Run `systemctl --user daemon-reload`
- **D-Bus registration**: May require session restart
- **Permissions**: Ensure ~/.local/share and ~/.config are writable
- **AppImage execution**: May need `chmod +x` on downloaded file

### macOS Issues
- **Notarization**: Required for distribution
- **LaunchAgent**: Check ~/Library/Logs/indra-sync.log
- **Permissions**: May require Gatekeeper bypass on first run

## Future Enhancements

1. **Auto-update**: Mechanism for updating daemon and installer
2. **Custom themes**: Branding customization per distributor
3. **Multi-user installation**: Support system-wide vs user-specific
4. **Upgrade path**: Preserve config during upgrades
5. **Silent mode**: Headless installation for deployment
6. **Package signing**: GPG/authenticode signatures
7. **Rollback recovery**: Restore previous working state
8. **Telemetry**: Anonymous usage analytics (opt-in)

## References

- Plan: `docs/plans/04_PLAN_tauri-installer.md`
- Research: `docs/research/Local drive integration.md.txt`
- Tauri Docs: https://tauri.app
- React Docs: https://react.dev
- Rust Async: https://tokio.rs
