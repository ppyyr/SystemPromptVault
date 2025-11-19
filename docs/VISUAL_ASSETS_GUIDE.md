# Visual Assets Guide for README

This document provides recommendations for creating visual assets to enhance the README.md and README_ZH.md files.

---

## Required Assets

### 1. Project Logo (`./docs/assets/logo.png`)

**Purpose**: Brand identity in README header

**Design Specifications**:
- **Dimensions**: 200x200px (recommended) or 400x400px (high-DPI)
- **Format**: PNG with transparency
- **Style**:
  - Simple, modern icon representing "vault" or "prompt management"
  - Suggested motifs: vault lock, file switcher, multi-layer stack
  - Color scheme: Blue/Orange gradient (matches Tauri theme) or monochrome

**Design Tools**:
- **Free**: [Figma](https://figma.com), [Canva](https://canva.com), [Inkscape](https://inkscape.org)
- **AI-Powered**: [Looka](https://looka.com), [Hatchful](https://hatchful.shopify.com)

**Quick Start**:
1. Use Figma or Canva to create a simple icon
2. Export as PNG (200x200px minimum)
3. Save to `./docs/assets/logo.png`
4. Uncomment line 4 in README.md and README_ZH.md

---

### 2. Demo GIF/Screenshot (`./docs/assets/demo.gif`)

**Purpose**: Show app in action (client switching, prompt application, snapshot restore)

**Recommended Content** (choose one or combine):
- **GIF Animation (preferred)**:
  - Switch between Claude/Codex clients from dropdown
  - Apply a prompt to config file
  - Create and restore a snapshot
  - Filter prompts by tags

- **Static Screenshot**:
  - Main window showing Monaco editor + prompt library
  - Annotate key features with arrows/labels

**Technical Specs**:
- **Format**: GIF (animated) or PNG (static)
- **Dimensions**: 800-1200px width (responsive in README)
- **File Size**: <5MB for GIF, <500KB for PNG
- **Frame Rate**: 10-15 FPS for GIF (smooth but lightweight)

**Recording Tools**:
- **macOS**: QuickTime (Command+Shift+5) → convert to GIF with [EZGIF](https://ezgif.com)
- **Windows**: [ScreenToGif](https://www.screentogif.com/)
- **Cross-Platform**: [Kap](https://getkap.co/), [LICEcap](https://www.cockos.com/licecap/)

**Quick Start**:
1. Launch the app in development mode (`bun run tauri:dev`)
2. Record a 10-20 second demo showing:
   - Client switching
   - Prompt application
   - (Optional) Snapshot creation/restore
3. Convert to GIF if needed (keep under 5MB)
4. Save to `./docs/assets/demo.gif`
5. Uncomment line 14 in README.md and README_ZH.md

---

## Optional Enhancements

### 3. Feature Comparison Table Screenshot

**Purpose**: Visual comparison of manual vs. app-based config management

**Content**:
| Manual Editing | System Prompt Vault |
|----------------|---------------------|
| Text editor    | Monaco Editor (VS Code) |
| No version control | Auto/manual snapshots |
| Manual file switching | One-click client switching |
| No tagging | Smart tag filtering |

**Format**: PNG table screenshot (400-600px width)

---

### 4. Architecture Diagram

**Purpose**: Visualize app structure (Frontend → Tauri Commands → Rust Backend → JSON Storage)

**Content**:
```
┌──────────────┐
│ Monaco Editor│
│  (Vanilla JS)│
└──────┬───────┘
       │
┌──────▼───────┐
│ Tauri API    │
│ (Commands)   │
└──────┬───────┘
       │
┌──────▼───────┐
│ Rust Backend │
│ (Repository) │
└──────┬───────┘
       │
┌──────▼───────┐
│ JSON Storage │
└──────────────┘
```

**Tools**: [draw.io](https://draw.io), [Excalidraw](https://excalidraw.com)

**File**: `./docs/assets/architecture.png`

---

## Quick Checklist

- [ ] Create `./docs/assets/` directory
- [ ] Design logo (200x200px PNG)
- [ ] Record demo GIF/screenshot (800-1200px, <5MB)
- [ ] Uncomment lines 4 and 14 in README.md
- [ ] Uncomment lines 4 and 14 in README_ZH.md
- [ ] (Optional) Add feature comparison table
- [ ] (Optional) Create architecture diagram

---

## Asset Locations

After creating assets, update the following files:

**README.md**:
- Line 4: `![System Prompt Vault Logo](./docs/assets/logo.png)`
- Line 14: `![Demo Animation](./docs/assets/demo.gif)`

**README_ZH.md**:
- Line 4: `![System Prompt Vault Logo](./docs/assets/logo.png)`
- Line 14: `![演示动画](./docs/assets/demo.gif)`

---

## Tips for High-Quality Visuals

1. **Logo**: Keep it simple—fewer colors and shapes render better at small sizes
2. **Demo GIF**: Use light theme for better visibility in screenshots
3. **File Size**: Optimize images with [TinyPNG](https://tinypng.com) before committing
4. **Accessibility**: Add descriptive alt text for all images
5. **Dark Mode**: Ensure logo works on both light/dark backgrounds (use transparency)

---

**Last Updated**: 2025-11
**Created by**: SystemPromptVault Development Team
