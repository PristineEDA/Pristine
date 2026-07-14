# Pristine Agent Rules

This file contains execution rules for agents working in this repository. Keep it short, current, and actionable. Product direction, target architecture, long-term C++ plans, UI guidelines, and performance goals live in [docs/project-direction.md](docs/project-direction.md).

## Current Repository

Pristine is currently an Electron, Vite, React, and TypeScript workspace.

- Main app: Electron 35, Vite 8, React 19, TypeScript, Tailwind CSS v4, Monaco Editor, Radix/shadcn-style primitives, lucide-react, assistant-ui, and Zustand.
- Agent server: the Mastra server lives in sibling `../pristine-agent` and is consumed through the local HTTP API. Do not reintroduce `agent-server/` as a Pristine workspace package.
- Tests: Vitest for unit tests and Playwright for end-to-end and performance tests.
- Native/core roadmap work is documented separately. Do not assume a C++ source tree exists unless the repository contains one.

## Working Rules

- Inspect the relevant code before proposing or making changes.
- Keep edits scoped to the requested behavior and aligned with existing local patterns.
- Explain the intended approach before substantial implementation work.
- Clarify ambiguous, high-risk, or broad requests before changing code.
- Prefer small, independently verifiable changes over large rewrites.
- Respect the active tool model. When using the Pristine agent service, propose pending file changes and pending shell commands for review. When operating in a normal workspace with write access, edit files directly only when the user requested implementation.
- Use subagents or workers only when the environment supports them and the task can be split into clear, independently verifiable responsibilities.
- Optional workflow commands such as loop, batch, or simplify may be used only when they exist in the active environment. They are not required repository rules.

## Code Rules

- Code, comments, commit messages, and PR text must be written in English.
- Do not include development-process notes in code comments.
- Avoid AI tool names in code comments, commit messages, authorship metadata, and PR text.
- Avoid progress labels such as `FIXED`, `Step`, `Week`, `Section`, `Phase`, or `AC-x` in code comments, commit messages, and PR text.
- Prefer TypeScript interfaces for component props and shared contracts.
- Use PascalCase for components and TypeScript types, camelCase for variables, functions, and state, `handle*` for event handlers, and `on*` for callback props.
- Use functional React components and hooks, following the patterns already present in nearby files.
- Use lucide-react for icons when an appropriate icon exists.
- Use Tailwind utilities and shared style files. Do not add component-local CSS files unless the surrounding implementation already requires that pattern.

## Architecture Boundaries

- Keep UI rendering and interaction concerns in React components.
- Keep Electron windowing, preload, and IPC concerns in the Electron layer.
- Validate all IPC input and keep channel contracts explicit.
- Do not use synchronous IPC for long-running work.
- Run third-party tools in isolated child processes when they can block, crash, or execute user-controlled input.
- Keep file operations constrained to the selected workspace or project root through the existing path-safety helpers.
- Do not add mandatory network dependencies to core editing, workspace, simulation, or local analysis flows.

## Code Viewer and LSP Rules

- Top-level code viewer subpages that use left, bottom, or right panels should be wired through `CodeWorkspaceShell`, `codeViewPanels.ts`, the activity bar, status bar, unit tests, and Playwright coverage together.
- Placeholder code viewer workspaces should reuse the existing `PlaceholderView` styling and shared panel labels unless the user asks for a real feature surface.
- Keep SystemVerilog LSP access under the existing `window.electronAPI.lsp` namespace. Do not add a separate preload namespace unless the public API boundary is intentionally changed.
- When adding or changing LSP methods, update the shared TypeScript LSP types, Electron IPC handlers, preload wiring, renderer bridge, debug request/response logging, normalization fallbacks, and targeted tests together.
- LSP request handlers must fail safely on timeout or engine errors. Interactive requests should use short timeouts; hierarchy and outline requests should keep their longer 30 second timeout unless there is a measured reason to change it.
- The LSP debug panel should be able to show initialization and request history even when a feature panel triggers engine startup before Monaco opens a document.

## Desktop Workflow Rules

- Keep main-window visibility coordinated with renderer workspace bootstrap. Do not reintroduce an `EmptyProject` flash while a previous project session is restoring.
- Native notifications are main-process owned. Preserve the validated `window.electronAPI.notifications` boundary, the renderer history contract, unread/read semantics, and tray badge/tooltip updates together.
- Bottom panel layouts and focused panes are project-session UI state. Preserve tab-scoped split behavior and do not persist transient WSL terminal overrides or terminal buffers.
- The RTL Regression panel currently presents mock data and mock interactions only. Do not describe or wire it as a real simulation/regression runner until a backend contract exists.

## PDF Viewer Rules

- Keep the PDF viewer on its self-managed `pdfjs-dist` rendering path. Do not import PDF.js official viewer components or copy code from its `web/` implementation.
- Keep PDF.js documents, pages, render tasks, canvas caches, observers, and text/link caches local to the viewer lifecycle. Zustand stores only per-file UI session state such as page, zoom, rails, search state, and local annotation data.
- PDF files must continue to use the existing constrained binary file-read APIs. They must not enter Monaco text loading, LSP, dirty-state, or save flows.
- Local PDF highlights and comments are renderer-session data only. Do not write them back to PDF files or project SQLite unless a dedicated persistence contract is introduced.
- PDF changes require focused unit coverage and Playwright coverage for file-tree opening, viewer interaction, and any affected rendering, scrolling, thumbnail, search, link, or annotation workflow. Large-document changes must keep visible thumbnail rendering bounded and cancellable.

## WSL Development Environment Rules

- The managed Pristine EDA environment is Windows-only. Keep WSL commands in Electron IPC and retain the restricted `wsl-pristine-eda` terminal profile; never expose arbitrary shell command arguments through the renderer API.
- Starting WSL may temporarily replace the focused PowerShell pane. Preserve the original session and restore it after pause, shell exit, close cleanup, or a start/stop failure.
- Before renderer-approved app exit, best-effort deactivate the managed distro, restore any overridden terminal pane, then persist the project session. Main-process shutdown fallback must not block application exit.
- WSL failures must return the UI to an actionable state and publish an error through the existing native notification path.

## Waveform and PixiJS Rules

- The waveform production path is `pristine-engine` LSP control, `PWF1` pipe transport, `PWVF v2` binary frames, and PixiJS rendering. Do not restore runtime mock waveform JSON or segment-object rendering in the app path.
- Preserve waveform visual quality: do not reduce DPR, downsample, drop segments, hide labels, change line widths, change colors, blur/scale old bitmaps, or otherwise trade fidelity for speed unless the user explicitly asks for that tradeoff.
- Keep high-frequency waveform rendering on the GPU batch/glyph path. Do not keep row/primitive `Graphics` or `Text` fallback renderers in the production hot path unless a concrete compatibility requirement is documented.
- Low-frequency chrome such as fixed backgrounds, separators, and small cursor badge containers may use simple PixiJS objects when they are not part of the pan/zoom hot path.
- Waveform performance changes must be driven by measured data. Update or add perf probes before drawing conclusions, and report FPS, render time, frame interval, dropped frames, scene update, GPU/glyph buffer update, React commit, pipe roundtrip, and parse timing when relevant.
- Waveform perf coverage should include continuous pan, continuous zoom, rapid pan+zoom, large-range pan, extreme zoom in/out, and vertical-scroll-then-interact cases.
- When waveform performance is part of the request, include the packaged app in the same verification loop when practical: build, package, run packaged perf, and compare dev and packaged results.
- Physical large-GDS 2D rendering should use the v3 staged status/catalog-page/tile-geometry path. Do not use full-cell geometry pulls or row/primitive Graphics redraws as the pan/zoom hot path for large GDS.
- Preserve Physical GDS visual quality during performance work: do not lower DPR, downsample, hide labels or shapes, change colors, line widths, opacity, outline, or layer/category/opacity semantics to improve FPS.
- Physical GDS performance work should include measured tile/mesh metrics and the local `tt_um_tt_tinyQV.gds` fixture when practical. Use `pnpm run prepare:physical-gds-fixture` to fetch it into `.deps`; do not commit the downloaded GDS.
- Physical large-GDS pan/zoom must keep displayed tile atlases and persistent Pixi resources off the React hot path; use idle snapshots for secondary consumers such as 2.5D, and avoid full scene `removeChildren`/recreate cycles during tile apply.
- Physical large-GDS pan/zoom should keep a viewport tile window with coverage/no-blank metrics, not a single arbitrary bbox tile plus one last-good tile. Validate manual-style rapid pan+zoom, coverage ratio, blank-frame count, cache bounds, and tinyQV before claiming 60fps behavior.
- Physical large-GDS manual interaction validation must include displayed tile atlas coverage, tile apply/mesh build stall metrics, and cache/mesh reuse behavior; transform-only FPS is not sufficient evidence by itself.
- Physical GDS performance summaries should include tinyQV baseline/after JSON metrics when practical, covering FPS, p95 frame time, render time, tile roundtrip, cache bytes, inflight requests, and buffer reallocations. Keep pan/zoom transform-only after tiles are loaded, keep tile caches bounded, and do not use large-bbox empty-tile `lod=0` retries to mask missing overview data.
- Physical staged GDS open should surface `PLST` parsing progress in the renderer and wait for `ready` before catalog-page or tile requests. Do not hide staged parsing entirely inside Electron handlers when UI or perf metrics need it.
- Physical large-GDS tile retries and caches must be bounded: do not retry large empty viewport bboxes with full `lod=0`, cap raw tile cache entries/bytes, release stale mesh resources, and report cache/inflight/retry metrics.
- Physical large-GDS PixiJS rendering should keep displayed tiles as an atlas of persistent tile layers. Avoid merging viewport tiles into one geometry and rebuilding the whole scene on each tile response; pan/zoom should update transforms while tile buffers update asynchronously.
- Physical large-GDS tile cache keys should come from stable quantized tile coordinates, not arbitrary per-wheel viewport bboxes. Keep App-level GDS geometry sync to idle snapshots only; hot-path tile updates should stay inside the Pixi tile atlas.
- Physical large-GDS perf validation must prove the current viewport is visually nonblank. World coverage, displayed tile count, and renderable shape count are not enough when the viewport has panned outside the cell or only off-screen cached tiles remain. Use screen-visible coverage, cell-intersection ratio, screenshot pixel checks, and visual-empty diagnostics in tinyQV perf reports.
- Physical large-GDS PixiJS perf work must measure columnar tile cache bytes, TileLayer/batch pool reuse, buffer subarray commits vs data replacement, chunked tile apply stalls, and idle snapshot skips; do not claim improvement from transform-only FPS without tinyQV manual pan/zoom before/after metrics.
- Physical large-GDS mesh buffers should use stable typed-array capacity and explicit active draw counts or an equivalent strategy. Track buffer data replacement, subarray/range commits, reallocations, and update time; avoid replacing active `MeshGeometry` subarrays on every tile apply.
- Physical large-GDS atlas apply and geometry snapshots must stay budgeted. Defer or chunk tile apply during active pan/zoom, skip oversized App-level snapshots, and include LOD 0/1/2 plus rapid burst pan/zoom coverage in tinyQV perf validation before claiming 60fps behavior.
- Physical large-GDS e2e perf changes should save per-scenario tinyQV JSON for LOD 0/1/2, large pan, rapid pan+zoom, coverage, blank frames, cache/atlas bytes, and tile apply/build timing so each optimization can be compared against the previous run.

## pristine-engine Coordination

- `pristine-engine` lives in a sibling repository. Before editing it, read `../pristine-engine/AGENTS.md` and follow its build and test workflow.
- On Windows, use the `Enter-VS2026` environment before building `pristine-engine` when required by that repository.
- Pristine launches `pristine-engine` as a no-argument stdio JSON-RPC/LSP child process and disposes it with the app lifecycle. Preserve that contract unless both repositories are updated together.
- Do not commit or vendor the `pristine-engine` binary. Keep local development binaries under `binaries/` through `pnpm run prepare:pristine-engine`, and keep packaged binaries under Electron `resources/binaries/`.
- Local Windows packaging and app builds must not silently bundle known debug engine sources such as `build/dev` or `build/clang-cl`. Prefer release or install-smoke engine outputs, and require an explicit override for debug sources.
- Do not change the waveform LSP control plane, `PWF1` envelope, or `PWVF v2` payload shape unless perf or correctness evidence shows the protocol is the bottleneck or source of the bug.
- Do not move waveform payloads back to JSON or add LOD/downsample behavior that sacrifices current visible waveform fidelity.

## Dependencies and Notices

- Prefer existing dependencies and local components before adding new packages. Do not add mandatory network dependencies to core local workflows.
- When adding or changing shipped runtime dependencies, update the canonical attribution source and tests, then run `pnpm run generate:notice`. Do not hand-edit generated `NOTICE` or `ATTRIBUTIONS.md` files.
- For charting or visualization dependencies such as Apache ECharts, use package imports and modular runtime loading patterns that match the surrounding code, and keep license coverage in the generated notice pipeline.

## Verification

Run the narrowest useful verification for the change. Prefer the existing commands:

- `pnpm typecheck`
- `pnpm test:unit`
- `pnpm test:e2e`
- `pnpm build`
- `pnpm package:win`

For bug fixes, reproduce the issue first when practical, then verify the fix. Report any verification that could not be run.
Before Electron Playwright or packaged-app validation on Windows, clean leftover `Pristine`, `Electron`, and `pnpm dev` processes so app startup, ports, and user-data isolation are reliable.
