import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const repositoryRoot = fileURLToPath(new URL("../../..", import.meta.url));
const sourceIconPath = join(
  repositoryRoot,
  "assets",
  "branding",
  "icon.svg",
);

const webIconTargets = [
  ["favicon-16x16.png", 16],
  ["favicon-32x32.png", 32],
  ["apple-touch-icon.png", 180],
  ["icon-192.png", 192],
  ["android-chrome-192x192.png", 192],
  ["icon-256.png", 256],
  ["android-chrome-512x512.png", 512],
] as const;

const extensionIconTargets = [16, 32, 48, 96, 128] as const;

const defaultOgImage = {
  height: 1260,
  icon: { left: 96, radius: 32, size: 172, top: 96 },
  width: 2400,
} as const;

function publicPath(application: "app" | "www", filename: string) {
  return join(repositoryRoot, "apps", application, "public", filename);
}

async function writeAsset(path: string, contents: Buffer) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents);
  console.log(`wrote ${relative(repositoryRoot, path)}`);
}

async function renderIcon(size: number) {
  return sharp(sourceIconPath)
    .resize(size, size, { fit: "fill", kernel: sharp.kernel.lanczos3 })
    .flatten({ background: "#2c2521" })
    .removeAlpha()
    .png({ adaptiveFiltering: false, compressionLevel: 9, palette: false })
    .toBuffer();
}

function createIco(images: Array<{ image: Buffer; size: number }>) {
  const headerSize = 6;
  const directoryEntrySize = 16;
  const directorySize = images.length * directoryEntrySize;
  const header = Buffer.alloc(headerSize + directorySize);

  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);

  let imageOffset = header.length;
  images.forEach(({ image, size }, index) => {
    const entryOffset = headerSize + index * directoryEntrySize;
    header.writeUInt8(size === 256 ? 0 : size, entryOffset);
    header.writeUInt8(size === 256 ? 0 : size, entryOffset + 1);
    header.writeUInt8(0, entryOffset + 2);
    header.writeUInt8(0, entryOffset + 3);
    header.writeUInt16LE(1, entryOffset + 4);
    header.writeUInt16LE(32, entryOffset + 6);
    header.writeUInt32LE(image.length, entryOffset + 8);
    header.writeUInt32LE(imageOffset, entryOffset + 12);
    imageOffset += image.length;
  });

  return Buffer.concat([header, ...images.map(({ image }) => image)]);
}

async function updateDefaultOgImage(icon: Buffer) {
  const appOgImagePath = publicPath("app", "og-image.png");
  const sourceImage = await readFile(appOgImagePath);
  const metadata = await sharp(sourceImage).metadata();

  if (
    metadata.width !== defaultOgImage.width ||
    metadata.height !== defaultOgImage.height
  ) {
    throw new Error(
      `Expected the default OG image to be ${defaultOgImage.width}x${defaultOgImage.height}; received ${metadata.width}x${metadata.height}`,
    );
  }

  const { left, radius, size, top } = defaultOgImage.icon;
  const whitePatch = Buffer.from(
    `<svg width="${size}" height="${size}"><rect width="${size}" height="${size}" fill="#fff"/></svg>`,
  );
  const roundedMask = Buffer.from(
    `<svg width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${radius}" fill="#fff"/></svg>`,
  );
  const roundedIcon = await sharp(icon)
    .composite([{ input: roundedMask, blend: "dest-in" }])
    .png({
      adaptiveFiltering: true,
      compressionLevel: 9,
      effort: 10,
      palette: false,
    })
    .toBuffer();
  const updatedImage = await sharp(sourceImage)
    .composite([
      { input: whitePatch, left, top },
      { input: roundedIcon, left, top },
    ])
    .flatten({ background: "#fff" })
    .removeAlpha()
    .png({
      adaptiveFiltering: true,
      compressionLevel: 9,
      effort: 10,
      palette: false,
    })
    .toBuffer();

  await Promise.all(
    (["app", "www"] as const).map((application) =>
      writeAsset(publicPath(application, "og-image.png"), updatedImage),
    ),
  );
}

const iconSizes = new Set<number>([
  ...webIconTargets.map(([, size]) => size),
  ...extensionIconTargets,
  defaultOgImage.icon.size,
]);
const renderedIcons = new Map(
  await Promise.all(
    [...iconSizes].map(async (size) => [size, await renderIcon(size)] as const),
  ),
);

for (const application of ["app", "www"] as const) {
  for (const [filename, size] of webIconTargets) {
    await writeAsset(publicPath(application, filename), renderedIcons.get(size)!);
  }

  const favicon = createIco(
    [16, 32].map((size) => ({ image: renderedIcons.get(size)!, size })),
  );
  await writeAsset(publicPath(application, "favicon.ico"), favicon);
}

for (const size of extensionIconTargets) {
  await writeAsset(
    join(repositoryRoot, "apps", "extension", "public", "icon", `${size}.png`),
    renderedIcons.get(size)!,
  );
}

await updateDefaultOgImage(renderedIcons.get(defaultOgImage.icon.size)!);
