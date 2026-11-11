// Renders a seed document's HTML source into a picture that looks scanned:
// paper grain, a little blur, JPEG artefacts. Run by hand when the HTML changes.
// Usage: node scripts/render-seed-scan.ts seed/bluth/files/<name>.html
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";
import sharp from "sharp";

const source = process.argv[2];
if (!source?.endsWith(".html")) {
  console.error("Usage: node scripts/render-seed-scan.ts seed/<family>/files/<name>.html");
  process.exit(1);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1700, height: 2200 } });
await page.goto(pathToFileURL(resolve(source)).href);
const shot = await page.screenshot({ type: "png" });
await browser.close();

// Scanner noise: a fixed pattern, so the picture is the same on every run.
const { width, height } = await sharp(shot).metadata();
const noise = Buffer.alloc(width! * height!);
let seed = 19650213;
for (let i = 0; i < noise.length; i++) {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  noise[i] = 110 + (seed >>> 27);
}
const grain = await sharp(noise, { raw: { width: width!, height: height!, channels: 1 } })
  .blur(0.6)
  .png()
  .toBuffer();

const output = source.replace(/\.html$/, ".jpg");
const scan = await sharp(shot)
  .composite([{ input: grain, blend: "soft-light" }])
  .blur(0.5)
  .modulate({ saturation: 0.85 })
  .jpeg({ quality: 68, chromaSubsampling: "4:2:0" })
  .toBuffer();
writeFileSync(output, scan);
console.log(
  `${output}: ${Math.round(scan.byteLength / 1024)} KB from ${readFileSync(source).byteLength} bytes of HTML`,
);
