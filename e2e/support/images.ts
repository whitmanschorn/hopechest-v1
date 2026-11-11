import sharp from "sharp";

/**
 * A small JPEG no other run will produce (random colours, so its hash is
 * unique), optionally carrying a camera date such as "1998:07:04 15:30:00".
 */
export async function testJpeg(options: { taken?: string; width?: number; height?: number } = {}) {
  const { width = 320, height = 240 } = options;
  const channel = () => Math.floor(Math.random() * 256);
  const stripe = (top: number, color: string) =>
    `<rect x="0" y="${top}" width="${width}" height="${height / 4}" fill="${color}"/>`;
  const rgb = () => `rgb(${channel()},${channel()},${channel()})`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <rect width="100%" height="100%" fill="${rgb()}"/>${stripe(height / 4, rgb())}${stripe(height / 2, rgb())}
    <text x="12" y="28" font-size="18" fill="white">${Date.now()}-${channel()}${channel()}</text></svg>`;
  let image = sharp(Buffer.from(svg)).jpeg({ quality: 90 });
  if (options.taken) image = image.withExif({ IFD2: { DateTimeOriginal: options.taken } });
  return { name: `test-${Date.now()}.jpg`, mimeType: "image/jpeg", buffer: await image.toBuffer() };
}
