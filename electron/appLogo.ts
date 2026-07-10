import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { nativeImage } from 'electron';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const APP_LOGO_RELATIVE_PATHS = [
  path.join(__dirname, '../dist/generated/logo/logo-256.png'),
  path.join(__dirname, '../public/generated/logo/logo-256.png'),
  path.join(__dirname, '../build/icon.png'),
  path.join(__dirname, '../public/generated/logo/logo.png'),
];

function findFirstExistingPath(paths: readonly string[]): string | null {
  return paths.find((candidate) => fs.existsSync(candidate)) ?? null;
}

export function getAppLogoPath(size = 256): string | null {
  const candidates = [
    path.join(__dirname, `../dist/generated/logo/logo-${size}.png`),
    path.join(__dirname, `../public/generated/logo/logo-${size}.png`),
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

export function createAppLogoUnreadNativeImage(size = 32): Electron.NativeImage {
  const sourceImage = createAppLogoNativeImage(size);
  if (sourceImage.isEmpty()) {
    return sourceImage;
  }

  try {
    const image = sourceImage.resize({ height: size, width: size });
    const { height, width } = image.getSize();
    const bitmap = Buffer.from(image.toBitmap());
    if (width <= 0 || height <= 0 || bitmap.length < width * height * 4) {
      return sourceImage;
    }

    const dotRadius = Math.max(4, Math.round(Math.min(width, height) * 0.18));
    const strokeWidth = Math.max(1, Math.round(Math.min(width, height) * 0.06));
    const outerRadius = dotRadius + strokeWidth;
    const dotCenterX = width - outerRadius - 1;
    const dotCenterY = height - outerRadius - 1;
    const outerRadiusSquared = outerRadius * outerRadius;
    const innerRadiusSquared = dotRadius * dotRadius;

    for (let y = Math.max(0, dotCenterY - outerRadius); y <= Math.min(height - 1, dotCenterY + outerRadius); y += 1) {
      for (let x = Math.max(0, dotCenterX - outerRadius); x <= Math.min(width - 1, dotCenterX + outerRadius); x += 1) {
        const distanceSquared = ((x - dotCenterX) ** 2) + ((y - dotCenterY) ** 2);
        if (distanceSquared > outerRadiusSquared) {
          continue;
        }

        const offset = ((y * width) + x) * 4;
        if (distanceSquared <= innerRadiusSquared) {
          bitmap[offset] = 0x44;
          bitmap[offset + 1] = 0x44;
          bitmap[offset + 2] = 0xef;
        } else {
          bitmap[offset] = 0xff;
          bitmap[offset + 1] = 0xff;
          bitmap[offset + 2] = 0xff;
        }
        bitmap[offset + 3] = 0xff;
      }
    }

    const unreadImage = nativeImage.createFromBuffer(bitmap, {
      height,
      scaleFactor: 1,
      width,
    });

    return unreadImage.isEmpty() ? sourceImage : unreadImage;
  } catch {
    return sourceImage;
  }
}
