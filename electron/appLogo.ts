import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { nativeImage } from 'electron';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const APP_LOGO_RELATIVE_PATHS = [
  path.join(__dirname, '../dist/generated/logo/logo-v1-256.png'),
  path.join(__dirname, '../public/generated/logo/logo-v1-256.png'),
  path.join(__dirname, '../build/icon.png'),
  path.join(__dirname, '../public/generated/logo/logo-v1.png'),
];

function findFirstExistingPath(paths: readonly string[]): string | null {
  return paths.find((candidate) => fs.existsSync(candidate)) ?? null;
}

export function getAppLogoPath(size = 256): string | null {
  const candidates = [
    path.join(__dirname, `../dist/generated/logo/logo-v1-${size}.png`),
    path.join(__dirname, `../public/generated/logo/logo-v1-${size}.png`),
    ...APP_LOGO_RELATIVE_PATHS,
  ];

  return findFirstExistingPath(candidates);
}

export function createAppLogoNativeImage(size = 256): Electron.NativeImage {
  const logoPath = getAppLogoPath(size);
  if (!logoPath) {
    return nativeImage.createEmpty();
  }

  return nativeImage.createFromPath(logoPath);
}
