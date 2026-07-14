# Pristine

Pristine is an open-source desktop IDE for ASIC digital design workflows. It combines RTL editing and navigation with simulation-oriented views, document reading, local tooling, and engineering-focused desktop workflows.

> Pristine `0.1.0` is under active development. The repository is the source of truth for current behavior; interfaces and feature maturity can change between releases.

## What Is Available Today

- **Code workspace:** project and session restore, file explorer, split editor tabs, Monaco editing, SystemVerilog language-server integration, hierarchy views, and a tabbed/splittable bottom panel.
- **Design and debug surfaces:** schematic, waveform, and physical-layout workspaces with dedicated visual rendering paths.
- **PDF documentation:** read-only PDFs open in editor tabs with continuous or page-based scrolling, fit and rotation controls, bookmarks, thumbnails, search, links, page tone, local highlights, and local comments.
- **Desktop workflows:** native OS notifications with in-app history, tray unread state, startup splash/session recovery, terminals, and project-scoped layout persistence.
- **Windows development environment:** project-aware WSL integration using the `pristine-eda-env` Ubuntu distribution and a managed terminal session.
- **Optional integrations:** the sibling `pristine-agent` service provides the local AI assistant; `pristine-auth` provides optional sign-in integration.

## Current Limits

- The RTL Regression panel is a mock UI surface. It does not start or manage real regression runs yet.
- PDF highlights, colors, and comments are renderer-session data. They are not written back to the PDF, synchronized, or retained after application restart.
- The managed WSL development environment is available on Windows only.
- The sibling agent and auth services are optional development integrations. Standard build and packaging workflows prepare the `pristine-engine` binary.

## Architecture

Pristine is an Electron desktop application with a React and TypeScript renderer.

- **Renderer:** React 19, Vite 8, Tailwind CSS v4, Monaco, Radix/shadcn-style primitives, Zustand, and specialized PixiJS/Three.js rendering surfaces.
- **Desktop host:** Electron main process, preload bridges, validated IPC, project-local file access, terminal lifecycle, notifications, windowing, and packaging.
- **Design tooling:** SystemVerilog LSP integration and the sibling `pristine-engine` binary for engine-backed analysis and high-performance visual data paths.
- **Optional services:** `../pristine-agent` runs the Mastra-based local assistant API; `../pristine-auth` owns authentication infrastructure.

Long-term product direction, native-core goals, and performance targets are documented in [docs/project-direction.md](docs/project-direction.md).

## Development

CI uses Node.js 20 and pnpm 10. Install dependencies with Corepack-enabled pnpm:

```powershell
corepack enable
pnpm install --frozen-lockfile
```

Run the desktop app in development mode:

```powershell
pnpm dev
```

Useful verification commands:

```powershell
pnpm typecheck
pnpm test:unit
pnpm test:e2e
pnpm build
```

Build platform packages from the matching operating system or CI runner:

```powershell
pnpm package:win
pnpm package:linux
pnpm package:mac
```

The build and packaging scripts prepare bundled assets, BlockSuite resources, the local engine binary, and generated license notices. Do not hand-edit `NOTICE` or `ATTRIBUTIONS.md`.

## Optional Local Services

The app can run without the optional sibling services. For local AI assistant and authentication development, see [GUIDE.md](GUIDE.md). That guide documents the `pristine-agent` service, auth callback configuration, and environment overrides.

## Contributing

Read [AGENTS.md](AGENTS.md) before changing the application. It defines repository conventions, IPC and file-safety boundaries, LSP and rendering constraints, dependency notice requirements, and expected validation.

Use [docs/project-direction.md](docs/project-direction.md) for product context and long-term architecture. Keep user-facing behavior changes covered by focused unit tests and Playwright coverage when the workflow crosses the Electron boundary.
