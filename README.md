# System Prompt Vault

**English** | [中文](./README_ZH.md)

<p align="center">
  <img src="./docs/assets/logo.png" alt="System Prompt Vault Logo" width="200">
</p>

[![Version](https://img.shields.io/badge/version-0.1.16-blue.svg)](https://github.com/ppyyr/SystemPromptVault/releases)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)
[![Tauri](https://img.shields.io/badge/Tauri-v2.0-orange.svg)](https://tauri.app/)
[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey.svg)](#quick-start)
[![CI](https://img.shields.io/github/actions/workflow/status/ppyyr/SystemPromptVault/ci.yml?branch=main&label=CI)](https://github.com/ppyyr/SystemPromptVault/actions/workflows/ci.yml)
[![Build](https://img.shields.io/github/actions/workflow/status/ppyyr/SystemPromptVault/build.yml?label=build)](https://github.com/ppyyr/SystemPromptVault/actions/workflows/build.yml)


**A lightning-fast desktop app for managing AI client configurations with visual editing, version control, and instant switching between Claude, Codex, Gemini, and more.**

## Screenshots

<p align="center">
  <img src="./docs/assets/screenshots/screenshot-main.png" alt="Main Interface" width="800">
  <br>
  <em>Main Interface - Monaco Editor with Prompt Library</em>
</p>

<details>
<summary>📸 More Screenshots</summary>

### Client Management
<p align="center">
  <img src="./docs/assets/screenshots/screenshot-client-manager.png" alt="Client Manager" width="700">
</p>

### Prompt Management
<p align="center">
  <img src="./docs/assets/screenshots/screenshot-prompt-manager.png" alt="Prompt Manager" width="700">
</p>

### Snapshot Management
<p align="center">
  <img src="./docs/assets/screenshots/screenshot-snapshot-manager.png" alt="Snapshot Manager" width="700">
</p>

### Dark Mode
<p align="center">
  <img src="./docs/assets/screenshots/screenshot-main-dark.png" alt="Dark Mode" width="700">
</p>

</details>

---

## Why System Prompt Vault?

Managing multiple AI tool configurations (`.claude/CLAUDE.md`, `.codex/AGENTS.md`, `.gemini/GEMINI.md`) is painful:
- ✅ Switching between AI clients requires manual file editing
- ✅ No version control means no easy rollback
- ✅ Reusing prompts across projects is tedious
- ✅ Keeping track of changes is impossible

**System Prompt Vault solves this** with:
- 🚀 **Instant Client Switching**: Toggle between Claude, Codex, Gemini in seconds
- 🎨 **Professional Editor**: Monaco Editor (VS Code core) with syntax highlighting, undo/redo
- 📸 **Snapshot Management**: Auto/manual snapshots with FIFO cleanup and tray recovery
- 🏷️ **Smart Tagging**: Filter prompts by tags, auto-detect client labels
- 🔄 **Live File Watching**: Real-time detection of config file changes
- 🌍 **i18n + Themes**: English/Chinese UI with light/dark mode
- 🎯 **Zero Frameworks**: Vanilla JS + Rust + Tauri v2 for maximum performance

---

## Core Features

### 🎛️ Client Management
- Add custom AI clients with config paths (e.g., `~/.claude/CLAUDE.md`)
- Switch active client from dropdown menu
- Auto-tag prompts by client type

### 📝 Prompt Library
- Create, edit, delete prompts with Monaco Editor
- Apply prompts to active client config in one click
- Import/export prompt collections for backup

### 🔍 Smart Filtering
- Multi-tag filtering with dropdown selector
- Search by name or content
- Recent tags auto-remembered

### 📸 Version Control
- **Auto Snapshots**: Created on app launch (max 10, FIFO cleanup)
- **Manual Snapshots**: User-triggered with custom labels (max 20)
- **Tray Restore**: Recover previous configs from system tray menu

### 🎨 Modern UX
- Dark/Light theme with system preference detection
- Responsive layout with Tailwind CSS
- Accessible keyboard navigation (ARIA compliant)

---

## Quick Start

### Prerequisites
- **Rust 1.70+**: [Install Rust](https://rustup.rs/)
- **Bun 1.0+**: [Install Bun](https://bun.sh/docs/installation) (or npm)
- **OS**: macOS / Windows / Linux

### Installation

```bash
# Clone the repository
git clone https://github.com/ppyyr/SystemPromptVault.git
cd SystemPromptVault

# Install dependencies (Bun is 2-10x faster than npm)
bun install

# Run in development mode
bun run tauri:dev
```

### Build for Production

```bash
# Standard build
bun run tauri:build

# macOS Universal (Intel + Apple Silicon)
bun run tauri:build:universal
```

**Build artifacts**:
- **macOS**: `src-tauri/target/release/bundle/dmg/`
- **Windows**: `src-tauri/target/release/bundle/nsis/`
- **Linux**: `src-tauri/target/release/bundle/deb/`

---

## Usage Guide

### 1. Add AI Clients
1. Open **Settings** (⚙️ icon in top-right)
2. Navigate to **Client Management** tab
3. Click **+ Add Client**
4. Fill in:
   - **ID**: Unique identifier (e.g., `claude`)
   - **Name**: Display name (e.g., `Claude Desktop`)
   - **Path**: Config file path (e.g., `~/.claude/CLAUDE.md`)
5. Save and switch from main page dropdown

### 2. Manage Prompts
1. In **Settings** → **Prompt Management**
2. Click **+ New Prompt**
3. Enter:
   - **Name**: Descriptive title
   - **Content**: Your prompt text
   - **Tags**: Add multiple tags (use dropdown or free input)
4. Click **Apply** to append to active client config

### 3. Version Control
- **Auto Snapshot**: Created every app launch
- **Manual Snapshot**: Click snapshot button in main page
- **Restore**: Right-click system tray → Select snapshot

### 4. Import/Export
- **Export**: Settings → Export Prompts → JSON file
- **Import**: Settings → Import Prompts → Select JSON file

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Vanilla JavaScript (ES6+), Vite 7, Tailwind CSS 3 |
| **Editor** | Monaco Editor (VS Code core) |
| **Backend** | Rust + Tauri v2 |
| **Package Manager** | Bun (2-10x faster than npm) |
| **Storage** | JSON file storage with atomic writes |

---

## Project Structure

```
SystemPromptVault/
├── dist/                  # Frontend source (NOT build output)
│   ├── index.html         # Main page (config editing)
│   ├── settings.html      # Settings page (prompts/clients)
│   ├── js/
│   │   ├── main.js        # Main page logic
│   │   ├── settings.js    # Settings page logic
│   │   ├── api.js         # Tauri API wrapper
│   │   ├── i18n.js        # Internationalization
│   │   └── theme.js       # Theme management
│   └── locales/           # i18n resources
├── build/                 # Vite build output
├── src-tauri/             # Rust backend
│   ├── src/
│   │   ├── commands/      # Tauri commands
│   │   ├── models/        # Data models
│   │   ├── storage/       # JSON repositories
│   │   └── tray.rs        # System tray
│   └── tauri.conf.json
└── llmdoc/                # Developer documentation
```

---

## Contributing

We welcome contributions! Please follow these steps:

1. Fork this repository
2. Create a feature branch (`git checkout -b feature/YourFeature`)
3. Commit changes (`git commit -m 'Add YourFeature'`)
4. Push to branch (`git push origin feature/YourFeature`)
5. Open a Pull Request

### Development Guidelines
- Follow existing code style (use `cargo fmt` for Rust)
- Update documentation in `llmdoc/` if adding features
- Test on your platform before submitting
- Keep commits atomic and descriptive

For detailed architecture and development guides, see [`llmdoc/`](./llmdoc/).

---

## FAQ

**Q: Can I use this with other AI tools beyond Claude/Codex/Gemini?**
A: Yes! Add any custom client in Settings → Client Management with a config file path.

**Q: Where are my prompts and settings stored?**
A:
- **macOS**: `~/Library/Application Support/SystemPromptVault/`
- **Windows**: `C:\Users\<User>\AppData\Roaming\SystemPromptVault\`
- **Linux**: `~/.config/SystemPromptVault/`

**Q: How do I restore a previous config snapshot?**
A: Right-click the system tray icon → Select a snapshot from the list.

**Q: Does this app send data to external servers?**
A: No. All data is stored locally on your machine.

**Q: Why use Bun instead of npm?**
A: Bun is 2-10x faster for installs and runs. npm still works if you prefer.

---

## Documentation

- **Full Docs**: [`llmdoc/`](./llmdoc/) (architecture, features, guides)
- **Architecture**: [`llmdoc/architecture/systemprompt-vault-architecture.md`](./llmdoc/architecture/systemprompt-vault-architecture.md)
- **Features**: [`llmdoc/features/`](./llmdoc/features/) (i18n, themes, snapshots, etc.)
- **Tech Guides**: [`llmdoc/guides/`](./llmdoc/guides/) (Vite, Bun, CI/CD)

---

## License

[MIT License](./LICENSE)

---

## Credits

Built with:
- [Tauri](https://tauri.app/) - Cross-platform desktop framework
- [Vite](https://vitejs.dev/) - Next-gen frontend tooling
- [Bun](https://bun.sh/) - Fast JavaScript runtime
- [Monaco Editor](https://microsoft.github.io/monaco-editor/) - VS Code editor core
- [Tailwind CSS](https://tailwindcss.com/) - Utility-first CSS

---

**Version**: 0.1.16
**Last Updated**: 2025-11
**Maintainer**: Saul <p@sora.im>

---
