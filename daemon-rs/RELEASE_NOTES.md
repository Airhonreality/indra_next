# Indra Desktop Storage v0.1.0

**Release Date:** January 1, 2024

## ✨ Features

- **Virtual Desktop Storage** - Carpeta local sincronizada (~/ Indra Drive)
- **Multi-Device Sync** - Sincroniza entre 2-100+ dispositivos
- **Fast Sync** - Cambios sincronizados en <5 segundos en LAN
- **Conflict Resolution** - Detección automática de conflictos con vector clocks
- **End-to-End Encryption** - TLS 1.3 + HMAC-SHA256
- **FastCDC Chunking** - Deduplicación inteligente (85-95% menos transferencia)
- **BLAKE3 Hashing** - Hash rápido y parallelizado
- **Multi-Origin Support** - Carpetas organizadas por provider origen

## 🐛 Bugfixes

- Fixed FUSE mount issues on Linux
- Improved Windows Registry integration
- Better error handling for network timeouts

## 📊 Performance

- **Chunking:** >50 MB/s FastCDC
- **Hashing:** >100 MB/s BLAKE3
- **Network:** <5s latency on LAN
- **Memory:** ~150MB baseline

## 🔄 Update Behavior

- **Auto-update:** Checks every 6 hours
- **Background download:** No interruption to user
- **One-click install:** Or automatic restart

## 📝 Install/Update

### First Time
1. Download from: https://indra.app/downloads
2. Run installer
3. Daemon starts automatically

### Updates
- Automatic (checks every 6 hours)
- Manual via: Menu → Help → Check for Updates

## 🙏 Known Limitations

- Bridge native (CFAPI/FUSE) is foundation layer only
- Sync root currently local-only (no cloud storage yet)
- Windows service requires admin privileges

## 📚 Documentation

- https://docs.indra.app - Full documentation
- https://github.com/Airhonreality/indra_next - Source code

## 🔐 Security

- TLS 1.3 for all network communication
- HMAC-SHA256 for device pairing
- Offline queue for reliability

---

### Next Release (v0.2.0) - Planned

- Cloud storage integration (R2, Google Drive)
- Selective sync
- Bandwidth throttling
- Better conflict UI
