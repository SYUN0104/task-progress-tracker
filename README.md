# Task Progress Tracker

A lightweight, always-on task progress tracker for Windows 11. Built with **Tauri v2**, **Svelte 5**, and **TypeScript**, running in a local WebView2 with near-zero idle CPU consumption.

Stay focused on parallel work by organizing tasks into **work units (columns)** with elapsed timers, drag-and-drop block rearrangement, and a structured lifecycle (Active → Hold → Archive). No cloud sync, no remote content—just fast, local-first task management.

## Features

### Core Task Management
- **Blocks with elapsed time**: Each task displays real-time duration (HH:MM:SS) derived from timestamps; survives app restarts
- **Work-unit columns**: Organize tasks into vertical-divider-separated columns for parallel work streams
- **Drag & drop**: 
  - Drag a block *over* another to nest it as a child
  - Drag to a column's empty area to move as a sibling
  - Insert before/after siblings via top/bottom drop zones
  - Drag a column's header handle to reorder columns
- **Left-click complete**: Immediately move a block to Archive (with a confirmation undo prompt)
- **Right-click menu**: Edit block text or move to Hold with a mandatory note
- **Leaf-first completion rule**: Parents cannot be completed while children remain active or held; attempts show a warning
- **No arbitrary deletion**: Blocks can only leave Active by completing or holding; deletion only permitted in Archive

### Hold Section
- **Mandatory notes**: Moving a block to Hold requires a title and optional description
- **Frozen timers**: Hold pauses the elapsed-time counter at the moment of hold
- **Resume**: Blocks return to Active with timers resuming from where they left off
- **Subtree preservation**: Holding a block moves its entire child tree as a unit

### Archive Section
- **Full tree preservation**: Completed blocks retain their entire hierarchy
- **Incomplete ancestors shown dimmed**: If a child is completed but the parent is not, the parent appears with a dashed outline (dimmed) as context
- **Annotations**: Add, edit, or remove notes on archived blocks to document context or decisions
- **Cascade deletion**: Delete completed blocks from Archive; deletion only removes completed nodes (dimmed ancestors are never deleted)

### Persistence & Recovery
- **Auto-save with atomic writes**: Changes debounce for 500ms, then are written atomically (temp → fsync → rename) to guard against crashes
- **Backup recovery**: If `state.json` is corrupted or missing, the app attempts recovery from `.bak` and initializes safely on failure
- **JSON export/import**: Manually back up or transfer your state as JSON

### Undo System
- **Session-scoped unlimited undo**: Press **Ctrl+Z** or click the undo icon to step back through actions (creation, moves, indentation, completion, holds, annotations, text edits, deletions, column operations)
- **Ring-buffer cap**: The undo stack is capped at 500 snapshots, effectively unlimited for typical use but bounded in memory
- **Lost on exit**: Undo history is in-memory only; closing the app clears the stack

### Theming & Accessibility
- **Dark/light modes**: Toggle between dark (default) and light theme; preference persists
- **Column customization**: Assign colors and labels to work units for visual distinction
- **Stale-task emphasis**: Tasks older than 4 hours display a subtle orange tint; tasks over 24 hours show a red tint with a badge

### Performance
- **Always-on design**: Idle CPU is near-zero—timers are computed from timestamps, not real-time loops
- **Visibility-gated refresh**: UI updates at 1 Hz only when the window is visible; minimized windows consume no CPU
- **Single-instance guard**: Only one instance can run at a time, preventing data conflicts

## Installation

### Windows 11

1. **Download the installer**: Visit [GitHub Releases](https://github.com/SYUN0104/task-progress-tracker/releases) and download the latest `.exe` installer.
2. **Run the installer**: Execute the `.exe` file and follow the prompts to install.
3. **WebView2 note**: Windows 11 comes with WebView2 pre-installed; no additional dependencies needed.

## Task Management Philosophy

This app enforces a deliberate, structured task lifecycle to prevent data loss and maintain task history:

1. **Active blocks cannot be deleted arbitrarily**—only completed (moved to Archive) or held (with a mandatory note explaining the hold reason).
2. **Parents block completion**—a parent task cannot be marked complete until all its children are complete or held. This prevents orphaning work and encourages finishing subtasks first.
3. **Archive preserves everything**—completed tasks and their full trees are kept as a permanent record, including incomplete ancestors shown as dimmed context.
4. **Hold is reversible**—temporarily pausing work requires documentation but allows the task to resume later with its timer intact.

These constraints are designed to work well for context switching, parallel work, and audit trails—not for pure speed.

## Development

### Branch Workflow

- **`dev`** — web-first iteration branch. Every push builds the browser version and deploys it to **GitHub Pages** (https://syun0104.github.io/task-progress-tracker/), so changes can be checked in a browser immediately without installing anything. The web version stores data in that browser's localStorage (independent from the desktop app's data).
- **`main`** — release branch. When a change is ready, merge `dev` into `main` and push a `v*` tag; CI builds the Windows installer and publishes a GitHub Release.

```bash
# iterate on dev, check in the browser after each push
git checkout dev && git push

# ship: merge into main and tag
git checkout main && git merge dev && git push
git tag vX.Y.Z && git push origin vX.Y.Z
```

### Prerequisites

- **Node.js** 20 or later
- **Rust** (stable toolchain)
- **Windows 11** (for building the native app; development can occur in WSL2)

### Quick Start

#### Option A: Browser-based UI development (WSL2-friendly)

```bash
npm install
npm run dev
```

Open http://localhost:5173 in your browser. The frontend runs with a localStorage adapter, allowing full UI iteration without Tauri or WebView2.

#### Option B: Native desktop development

```bash
npm install
npm run tauri:dev
```

Builds the frontend and launches the app in a WebView2 window (Windows only).

### Development Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start Vite dev server for browser-based UI development |
| `npm run build` | Build frontend (SvelteKit → dist/) |
| `npm run check` | TypeScript and Svelte syntax check |
| `npm test` | Run Vitest unit tests (113 tests: domain logic, undo, timer, projections) |
| `npx playwright test` | Run Playwright e2e tests (35 tests: Chromium, browser adapter, core workflows) |
| `cargo test -p persist --manifest-path src-tauri/Cargo.toml` | Run Rust tests for atomic save/load logic (7 tests) |
| `npm run tauri:build` | Build the production Windows installer and executable |

### Project Structure

```
taskTracker/
├── src/                              # Svelte frontend
│   ├── lib/domain/                   # Pure domain logic (no DOM/Tauri dependency)
│   │   ├── types.ts                  # Block, WorkUnit, AppState definitions
│   │   ├── tree.ts                   # Tree operations (children, subtree, etc.)
│   │   ├── actions.ts                # Domain reducers (create, move, complete, hold, etc.)
│   │   ├── rules.ts                  # Completion rules, delete guards
│   │   ├── timer.ts                  # Elapsed-time calculation (timestamp-derived)
│   │   ├── projections.ts            # Active/Hold/Archive view projections
│   │   └── undo.ts                   # Snapshot-based undo (ring buffer, cap 500)
│   ├── lib/platform/                 # Platform adapters
│   │   ├── tauri.ts                  # Tauri integration (file I/O, window events)
│   │   └── browser.ts                # localStorage fallback (dev/testing)
│   ├── lib/components/               # Svelte components
│   ├── lib/dnd/                      # Drag-and-drop engine
│   └── App.svelte                    # Main app entry
├── src-tauri/
│   ├── app/                          # Tauri app (WebView2 shell)
│   ├── persist/                      # Rust library (atomic save/load, testable standalone)
│   └── Cargo.toml
├── tests/                            # Test suites
│   ├── domain/                       # Unit tests (rules, timer, undo, etc.)
│   ├── e2e/                          # Playwright e2e tests
│   └── dnd/                          # DnD classification tests
├── .github/workflows/                # CI/CD pipelines
└── README.md
```

### Architecture Highlights

- **Single source of truth**: One `AppState` (blocks + work units); Active/Hold/Archive are pure projections.
- **Pure domain core**: All task logic lives in `lib/domain/` and is independent of UI or runtime—fully unit-tested.
- **Snapshot undo**: Each domain action is captured as a before-action snapshot; 500-deep ring buffer prevents unbounded memory growth.
- **Atomic persistence**: 2-step write (temp file + fsync, then atomic rename) ensures data integrity on any crash.
- **Visibility-gated timer**: 1 Hz UI refresh only while the window is visible; minimized windows consume no CPU.
- **Single-instance guard**: Prevents two copies from conflicting over `state.json`.

### Tauri Workspace Layout

The `src-tauri/` directory contains two Cargo crates:

- **persist**: Pure library for save/load with atomic writes; testable and cross-platform.
- **app**: Tauri shell (WebView2 integration, window management, file dialogs).

This separation allows testing persistence logic in WSL2 without Tauri or WebView2.

## Testing Strategy

- **Unit tests** (Vitest, `npm test`): Domain rules, timer math, undo behavior, projections, DnD classification.
- **E2E tests** (Playwright, `npx playwright test`): User workflows (creation, drag-drop, completion, hold, archive, theme).
- **Manual verification** (Windows 11): Keyboard shortcuts, WebView2 rendering, CPU idle state, installer UX.

## License

Personal project; no license granted.
