import { existsSync } from 'node:fs';
import { cp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(scriptPath), '..');
const stageRoot = path.join(projectRoot, '.pristine-package');
const stageApp = path.join(stageRoot, 'app');
const runtimePackages = ['node-pty', 'node-addon-api', 'vscode-jsonrpc', 'better-sqlite3', 'bindings', 'file-uri-to-path'];
const directRuntimeDependencies = ['node-pty', 'vscode-jsonrpc', 'better-sqlite3'];
const resolvedRuntimePackagePaths = new Map();

async function readJson(filePath) {
  const raw = await readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

async function copyDirectory(relativePath) {
  const source = path.join(projectRoot, relativePath);
  const target = path.join(stageApp, relativePath);

  if (!existsSync(source)) {
    throw new Error(`Cannot stage missing path: ${relativePath}`);
  }

  await cp(source, target, {
    recursive: true,
    force: true,
    dereference: true,
  });
}

async function copyRuntimePackage(packageName) {
  const source = await resolveRuntimePackagePath(packageName);
  const target = path.join(stageApp, 'node_modules', packageName);

  resolvedRuntimePackagePaths.set(packageName, source);
  await mkdir(path.dirname(target), { recursive: true });
  await cp(source, target, {
    recursive: true,
    force: true,
    dereference: true,
  });
}

async function resolveRuntimePackagePath(packageName) {
  const resolvedPackagePath = resolvedRuntimePackagePaths.get(packageName);

  if (resolvedPackagePath) {
    return resolvedPackagePath;
  }

  const rootPackagePath = path.join(projectRoot, 'node_modules', packageName);

  if (existsSync(rootPackagePath)) {
    return rootPackagePath;
  }

  for (const parentPackageName of runtimePackages) {
    if (parentPackageName === packageName) {
      continue;
    }

    const parentPackagePath =
      resolvedRuntimePackagePaths.get(parentPackageName) ?? path.join(projectRoot, 'node_modules', parentPackageName);

    if (!existsSync(parentPackagePath)) {
      continue;
    }

    const parentRealPath = await realpath(parentPackagePath);
    const requireFromParent = createRequire(path.join(parentRealPath, 'package.json'));

    try {
      return path.dirname(requireFromParent.resolve(`${packageName}/package.json`));
    } catch {
      // Fall through to the sibling lookup used by pnpm's symlinked store layout.
    }

    const siblingPackagePath = path.join(path.dirname(parentRealPath), packageName);

    if (existsSync(siblingPackagePath)) {
      return siblingPackagePath;
    }
  }

  throw new Error(`Cannot stage missing runtime package: ${packageName}`);
}

async function writeStageManifest(rootManifest) {
  const dependencies = Object.fromEntries(
    directRuntimeDependencies.map((dependencyName) => {
      const version = rootManifest.dependencies?.[dependencyName];

      if (!version) {
        throw new Error(`Root package.json is missing runtime dependency ${dependencyName}`);
      }

      return [dependencyName, version];
    }),
  );
  const manifest = {
    name: rootManifest.name,
    productName: rootManifest.productName,
    version: rootManifest.version,
    license: rootManifest.license,
    type: rootManifest.type,
    main: rootManifest.main,
    packageManager: 'npm@10.9.3',
    dependencies,
  };

  await writeFile(path.join(stageApp, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

async function patchStagedRuntimePackageManifests() {
  const betterSqliteManifestPath = path.join(stageApp, 'node_modules', 'better-sqlite3', 'package.json');
  const betterSqliteManifest = await readJson(betterSqliteManifestPath);

  if (betterSqliteManifest.dependencies?.['prebuild-install']) {
    delete betterSqliteManifest.dependencies['prebuild-install'];
  }

  if (betterSqliteManifest.scripts?.install) {
    delete betterSqliteManifest.scripts.install;
  }

  await writeFile(betterSqliteManifestPath, `${JSON.stringify(betterSqliteManifest, null, 2)}\n`, 'utf8');
}

async function writeStageBuilderConfig() {
  const electronManifest = await readJson(path.join(projectRoot, 'node_modules', 'electron', 'package.json'));
  const config = `appId: com.pristine.ide
productName: Pristine
electronVersion: ${electronManifest.version}
npmRebuild: false
directories:
  buildResources: ../../build
  output: ../../release/\${version}
files:
  - dist/**/*
  - dist-electron/**/*
  - package.json
  - node_modules/node-pty/**/*
  - node_modules/node-addon-api/**/*
  - node_modules/vscode-jsonrpc/**/*
  - node_modules/better-sqlite3/**/*
  - node_modules/bindings/**/*
  - node_modules/file-uri-to-path/**/*
protocols:
  - name: Pristine Auth Callback
    schemes:
      - pristine
extraResources:
  - from: ../../binaries
    to: binaries
    filter:
      - '**/*'
  - from: ../..
    to: licenses
    filter:
      - LICENSE
      - ATTRIBUTIONS.md
      - NOTICE
  - from: ../../licenses/pristine-engine
    to: licenses/pristine-engine
    filter:
      - '**/*'
asar: true
asarUnpack:
  - node_modules/node-pty/**
  - node_modules/better-sqlite3/**
win:
  icon: icon.ico
  target:
    - target: nsis
      arch: [x64]
    - target: portable
      arch: [x64]
nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
  perMachine: false
linux:
  icon: icon.png
  target:
    - target: AppImage
      arch: [x64]
    - target: deb
      arch: [x64]
  category: Development
mac:
  icon: icon.icns
  target:
    - target: dmg
      arch: [x64, arm64]
  category: public.app-category.developer-tools
`;

  await writeFile(path.join(stageApp, 'electron-builder.yml'), config, 'utf8');
}

function assertModelProviderLogoAssetsAvailable() {
  const logoPath = path.join(stageApp, 'dist', 'model-provider-logos', 'openrouter.svg');

  if (!existsSync(logoPath)) {
    throw new Error(
      'Cannot stage package: dist/model-provider-logos/openrouter.svg is missing. Run pnpm run sync:mastra-provider-logos and pnpm run build:app before packaging.',
    );
  }
}

async function main() {
  const rootManifest = await readJson(path.join(projectRoot, 'package.json'));

  await rm(stageRoot, { recursive: true, force: true });
  await mkdir(stageApp, { recursive: true });
  await copyDirectory('dist');
  assertModelProviderLogoAssetsAvailable();
  await copyDirectory('dist-electron');

  for (const packageName of runtimePackages) {
    await copyRuntimePackage(packageName);
  }

  await patchStagedRuntimePackageManifests();
  await writeStageManifest(rootManifest);
  await writeStageBuilderConfig();
  console.log(`Prepared package app at ${path.relative(projectRoot, stageApp)}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
