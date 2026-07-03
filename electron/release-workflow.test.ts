import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const repoRoot = path.resolve(__dirname, '..')
const releaseScriptPath = path.join(repoRoot, 'scripts', 'release-version.mjs')
const workflowPath = path.join(repoRoot, '.github', 'workflows', 'ci.yml')
const prepareEngineScriptPath = path.join(repoRoot, 'scripts', 'prepare-pristine-engine.mjs')
const engineRemoteSourceHelperPath = path.join(repoRoot, 'scripts', 'pristine-engine-remote-source.mjs')
const electronBuilderConfigPath = path.join(repoRoot, 'electron-builder.yml')
const preparePackageAppScriptPath = path.join(repoRoot, 'scripts', 'prepare-package-app.mjs')
const hookPath = path.join(repoRoot, '.githooks', 'pre-commit')

function createPackageFixture(rootVersion = '0.0.1') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pristine-release-version-'))

  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'pristine', version: rootVersion }, null, 2))

  return root
}

function readFixtureVersion(root: string, relativePath: string) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8')).version as string
}

function runReleaseScript(root: string, args: string[]) {
  const result = spawnSync(
    process.execPath,
    [releaseScriptPath, ...args, '--root', root],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      windowsHide: true,
    },
  )

  if (result.error) {
    throw result.error
  }

  return result
}

function getPreparedEngineBinaryName() {
  return process.platform === 'win32' ? 'pristine-engine.exe' : 'pristine-engine'
}

function writeFixtureFile(filePath: string, contents: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, contents)
}

function createPrepareEngineFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pristine-prepare-engine-'))
  const appRoot = path.join(root, 'pristine')
  const engineRoot = path.join(root, 'pristine-engine')
  const binaryName = getPreparedEngineBinaryName()
  const licenseRoot = path.join(engineRoot, 'build', 'install-smoke', 'share', 'pristine-engine', 'licenses')

  fs.mkdirSync(appRoot, { recursive: true })
  fs.mkdirSync(licenseRoot, { recursive: true })
  writeFixtureFile(path.join(licenseRoot, 'LICENSE'), 'license')
  writeFixtureFile(path.join(licenseRoot, 'ATTRIBUTIONS.md'), 'attributions')
  writeFixtureFile(path.join(licenseRoot, 'NOTICE'), 'notice')

  return {
    appRoot,
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
    paths: {
      release: path.join(engineRoot, 'build', 'release', binaryName),
      installSmoke: path.join(engineRoot, 'build', 'install-smoke', 'bin', binaryName),
      dev: path.join(engineRoot, 'build', 'dev', binaryName),
      clangCl: path.join(engineRoot, 'build', 'clang-cl', binaryName),
      target: path.join(appRoot, 'binaries', binaryName),
    },
  }
}

function runPrepareEngineScript(appRoot: string, envOverrides: Record<string, string | undefined> = {}) {
  const env = { ...process.env }
  for (const key of [
    'GITHUB_ACTIONS',
    'PRISTINE_ENGINE_SOURCE',
    'PRISTINE_ENGINE_ALLOW_DEBUG_SOURCE',
    'PRISTINE_ENGINE_LICENSES_SOURCE',
  ]) {
    delete env[key]
  }
  for (const [key, value] of Object.entries(envOverrides)) {
    if (value === undefined) {
      delete env[key]
      continue
    }

    env[key] = value
  }

  const result = spawnSync(process.execPath, [prepareEngineScriptPath], {
    cwd: appRoot,
    env,
    encoding: 'utf8',
    windowsHide: true,
  })

  if (result.error) {
    throw result.error
  }

  return result
}

const itLocalWindowsEnginePrepare = process.platform === 'win32' ? it : it.skip

describe('local pristine-engine prepare', () => {
  itLocalWindowsEnginePrepare('prefers a release build over install-smoke', () => {
    const fixture = createPrepareEngineFixture()

    try {
      writeFixtureFile(fixture.paths.release, 'release-binary')
      writeFixtureFile(fixture.paths.installSmoke, 'install-smoke-binary')

      const result = runPrepareEngineScript(fixture.appRoot)

      expect(result.status).toBe(0)
      expect(fs.readFileSync(fixture.paths.target, 'utf8')).toBe('release-binary')
    } finally {
      fixture.cleanup()
    }
  })

  itLocalWindowsEnginePrepare('falls back to install-smoke when no release build exists', () => {
    const fixture = createPrepareEngineFixture()

    try {
      writeFixtureFile(fixture.paths.installSmoke, 'install-smoke-binary')

      const result = runPrepareEngineScript(fixture.appRoot)

      expect(result.status).toBe(0)
      expect(fs.readFileSync(fixture.paths.target, 'utf8')).toBe('install-smoke-binary')
    } finally {
      fixture.cleanup()
    }
  })

  it.each(['dev', 'clangCl'] as const)('rejects explicit Debug source paths from build/%s', (sourceKey) => {
    const fixture = createPrepareEngineFixture()
    const sourcePath = fixture.paths[sourceKey]

    try {
      writeFixtureFile(sourcePath, 'debug-binary')

      const result = runPrepareEngineScript(fixture.appRoot, {
        PRISTINE_ENGINE_SOURCE: sourcePath,
      })

      expect(result.status).toBe(1)
      expect(result.stderr).toContain('Debug pristine-engine source is not allowed')
      expect(result.stderr).toContain('PRISTINE_ENGINE_ALLOW_DEBUG_SOURCE=1')
      expect(fs.existsSync(fixture.paths.target)).toBe(false)
    } finally {
      fixture.cleanup()
    }
  })

  it('allows an explicit Debug source only when opted in', () => {
    const fixture = createPrepareEngineFixture()

    try {
      writeFixtureFile(fixture.paths.dev, 'debug-binary')

      const result = runPrepareEngineScript(fixture.appRoot, {
        PRISTINE_ENGINE_SOURCE: fixture.paths.dev,
        PRISTINE_ENGINE_ALLOW_DEBUG_SOURCE: '1',
      })

      expect(result.status).toBe(0)
      expect(fs.readFileSync(fixture.paths.target, 'utf8')).toBe('debug-binary')
    } finally {
      fixture.cleanup()
    }
  })
})

describe('release workflow contract', () => {
  it('syncs the root package version from release branch names', () => {
    const root = createPackageFixture()

    const result = runReleaseScript(root, ['sync', '--ref', 'release/v1.2.3'])

    expect(result.status).toBe(0)
    expect(result.stdout).toContain('Synced release version 1.2.3')
    expect(readFixtureVersion(root, 'package.json')).toBe('1.2.3')
  })

  it('fails release checks when package versions do not match the tag', () => {
    const root = createPackageFixture('1.2.4')

    const result = runReleaseScript(root, ['check', '--ref', 'refs/tags/v1.2.3'])

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Release version mismatch')
    expect(result.stderr).toContain('package.json has 1.2.4, expected 1.2.3')
  })

  it('accepts tag checks when all package versions match', () => {
    const root = createPackageFixture('1.2.3')

    const result = runReleaseScript(root, ['check', '--ref', 'refs/tags/v1.2.3'])

    expect(result.status).toBe(0)
    expect(result.stdout).toContain('Release version 1.2.3 matches package.json')
  })

  it('keeps the local hook scoped to package version sync', () => {
    const hook = fs.readFileSync(hookPath, 'utf8')

    expect(hook).toContain('node scripts/release-version.mjs sync --ref "$BRANCH"')
    expect(hook).toContain('git add package.json')
    expect(hook).not.toContain('agent-server/package.json')
    expect(hook).toContain('grep -oE')
  })

  it('publishes release assets only from version-checked tag package builds', () => {
    const workflow = fs.readFileSync(workflowPath, 'utf8')

    expect(workflow).toContain('refs/tags/v*')
    expect(workflow).toContain('node scripts/release-version.mjs check --ref "${GITHUB_REF}"')
    expect(workflow).toContain('github-release:')
    expect(workflow).toContain("if: github.event_name == 'push' && startsWith(github.ref, 'refs/tags/v')")
    expect(workflow).toContain('pattern: pristine-*')
    expect(workflow).toContain('softprops/action-gh-release@v2')
    expect(workflow).toContain('generate_release_notes: true')
    expect(workflow).toContain('contents: write')
    expect(workflow).not.toMatch(/^  release:/m)
  })

  it('keeps CI manually dispatchable with explicit read permissions', () => {
    const workflow = fs.readFileSync(workflowPath, 'utf8')

    expect(workflow).toMatch(/on:\r?\n  push:\r?\n  pull_request:\r?\n  workflow_dispatch:/)
    expect(workflow).toContain('workflow_dispatch:')
    expect(workflow).toMatch(/permissions:\r?\n  actions: read\r?\n  contents: read/)
    expect(workflow).not.toContain('permissions: read-all')
    expect(workflow).not.toMatch(/push:\r?\n\s+branches:/)
    expect(workflow).not.toMatch(/push:[\s\S]*?\r?\n\s+tags:/)
  })

  it('routes pristine-engine downloads to main workflow artifacts for non-tags and latest releases for tags', () => {
    const workflow = fs.readFileSync(workflowPath, 'utf8')
    const prepareEngineScript = fs.readFileSync(prepareEngineScriptPath, 'utf8')
    const engineRemoteSourceHelper = fs.readFileSync(engineRemoteSourceHelperPath, 'utf8')

    expect(workflow).toContain('PRISTINE_ENGINE_REPOSITORY: PristineEDA/pristine-engine')
    expect(workflow).toContain('PRISTINE_ENGINE_REMOTE_SOURCE_MODE: auto')
    expect(workflow).toContain('PRISTINE_ENGINE_ARTIFACT_BRANCH: main')
    expect(workflow).toContain('PRISTINE_ENGINE_ARTIFACT_WORKFLOW: ci.yml')
    expect(workflow).toContain('actions: read')
    const buildStepTokenPattern = [
      '- name: Build',
      '\\s+env:',
      '\\s+PRISTINE_ENGINE_GITHUB_TOKEN: \\$\\{\\{ github\\.token \\}\\}',
      '\\s+run: pnpm build',
    ].join('\\r?\\n')
    const packageStepTokenPattern = [
      '- name: Package application',
      '\\s+env:',
      "\\s+CSC_IDENTITY_AUTO_DISCOVERY: 'false'",
      '\\s+PRISTINE_ENGINE_GITHUB_TOKEN: \\$\\{\\{ github\\.token \\}\\}',
      '\\s+run: pnpm run build:app',
    ].join('\\r?\\n')

    expect(workflow).toMatch(new RegExp(buildStepTokenPattern))
    expect(workflow.match(new RegExp(packageStepTokenPattern, 'g'))).toHaveLength(2)

    expect(prepareEngineScript).toContain('getRemoteSourceMode')
    expect(prepareEngineScript).toContain('resolveWorkflowArtifactDownload')
    expect(prepareEngineScript).toContain('resolveReleaseDownload')
    expect(prepareEngineScript).toContain('process.env.GITHUB_REF')
    expect(prepareEngineScript).not.toContain("?? 'v0.1.1'")

    expect(engineRemoteSourceHelper).toContain("return isGitTagRef(ref) ? 'release' : 'artifact'")
    expect(engineRemoteSourceHelper).toContain("const releaseRoute = releaseVersion ? `releases/tags/${releaseVersion}` : 'releases/latest'")
    expect(engineRemoteSourceHelper).toContain("runsUrl.searchParams.set('branch', branch)")
    expect(engineRemoteSourceHelper).toContain("runsUrl.searchParams.set('status', 'success')")
  })

  it('runs CI runtime perf against the built Electron dev app and packaged app', () => {
    const workflow = fs.readFileSync(workflowPath, 'utf8')

    expect(workflow).toContain('Run runtime performance comparison')
    expect(workflow).toContain('-DevCommand "pnpm exec electron ."')
    expect(workflow).toContain('pnpm run build:app && pnpm run prepare:package-app')
    expect(workflow).not.toContain('-DevCommand "pnpm run dev"')
  })

  it('filters uploaded package artifacts to distributable release files', () => {
    const workflow = fs.readFileSync(workflowPath, 'utf8')

    expect(workflow).toContain('release/**/*.AppImage')
    expect(workflow).toContain('release/**/*.blockmap')
    expect(workflow).toContain('release/**/*.deb')
    expect(workflow).toContain('release/**/*.dmg')
    expect(workflow).toContain('release/**/*.exe')
    expect(workflow).toContain('release/**/*.yml')
    expect(workflow).toContain('!release/**/*-unpacked/**')
    expect(workflow).toContain("target=\"release-assets/${artifact_name}-${file_name}\"")
  })

  it('uses generated Pristine logo assets for packaged Windows, Linux, and macOS icons', () => {
    const electronBuilderConfig = fs.readFileSync(electronBuilderConfigPath, 'utf8')
    const preparePackageAppScript = fs.readFileSync(preparePackageAppScriptPath, 'utf8')

    expect(electronBuilderConfig).toMatch(/win:\r?\n  icon: icon\.ico/)
    expect(electronBuilderConfig).toMatch(/linux:\r?\n  icon: icon\.png/)
    expect(electronBuilderConfig).toMatch(/mac:\r?\n  icon: icon\.icns/)
    expect(preparePackageAppScript).toContain('buildResources: ../../build')
    expect(preparePackageAppScript).toMatch(/win:\r?\n  icon: icon\.ico/)
    expect(preparePackageAppScript).toMatch(/linux:\r?\n  icon: icon\.png/)
    expect(preparePackageAppScript).toMatch(/mac:\r?\n  icon: icon\.icns/)
  })
})
