#!/usr/bin/env node
/**
 * Generates the README screenshots and GIFs in docs/media/.
 *
 * Captures the resident dashboard (desktop + mobile) with demo mode enabled,
 * so the media is reproducible without a database or live sensor.
 *
 * Usage:
 *   1. Start the app:  ADMIN_PASSWORD=<pw> npm run dev -- -p 3719
 *   2. Run:            MEDIA_BASE_URL=http://localhost:3719 ADMIN_PASSWORD=<pw> \
 *                        node docs/generate-readme-media.mjs
 *
 * Requires dev-only packages (not in package.json — install ad hoc):
 *   npm i --no-save playwright gifenc pngjs && npx playwright install chromium
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import gifenc from "gifenc";
import pngjs from "pngjs";

// Both are CommonJS packages — pull named members off the default export.
const { GIFEncoder, quantize, applyPalette } = gifenc;
const { PNG } = pngjs;

const BASE = process.env.MEDIA_BASE_URL ?? "http://localhost:3717";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
if (!ADMIN_PASSWORD) {
  console.error("ADMIN_PASSWORD is required (used to enable demo mode).");
  process.exit(1);
}

const OUT = join(dirname(fileURLToPath(import.meta.url)), "media");
mkdirSync(OUT, { recursive: true });

// --- helpers ---------------------------------------------------------------

/** Hide the Next.js dev-tools badge/portal so it never appears in captures. */
async function prep(page, path) {
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  await page.evaluate(() => document.fonts.ready);
  // Let entrance animations (fade-in-up, bar-grow) finish.
  await page.waitForTimeout(1800);
}

function save(name, buffer) {
  writeFileSync(join(OUT, name), buffer);
  console.log(`  ✓ ${name} (${Math.round(buffer.length / 1024)} KB)`);
}

function pngToRgba(buf) {
  const png = PNG.sync.read(buf);
  return {
    data: new Uint8Array(png.data.buffer, png.data.byteOffset, png.data.length),
    width: png.width,
    height: png.height,
  };
}

/** Encode same-sized PNG buffers into an animated GIF. */
function encodeGif(pngBuffers, delayMs) {
  const gif = GIFEncoder();
  for (const buf of pngBuffers) {
    const { data, width, height } = pngToRgba(buf);
    const palette = quantize(data, 256);
    const index = applyPalette(data, palette);
    gif.writeFrame(index, width, height, { palette, delay: delayMs });
  }
  gif.finish();
  return Buffer.from(gif.bytes());
}

async function setDemoMode(ctx, on) {
  const res = await ctx.request.post(`${BASE}/api/demo-mode`, {
    data: { demoMode: on },
  });
  if (!res.ok()) throw new Error(`demo-mode ${on}: HTTP ${res.status()}`);
}

// --- main ------------------------------------------------------------------

const browser = await chromium.launch();

// Warm-up: in `next dev`, the first visit compiles the page and re-evaluates
// server modules — which would wipe the in-memory demo flag if we set it
// first. Compile everything BEFORE toggling demo mode.
{
  const warm = await browser.newPage();
  await warm.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await warm.close();
}

// One context to authenticate and flip demo mode on.
const adminCtx = await browser.newContext();
const login = await adminCtx.request.post(`${BASE}/api/admin-auth`, {
  data: { password: ADMIN_PASSWORD },
});
if (!login.ok()) {
  console.error(`Admin login failed (HTTP ${login.status()}). Wrong password?`);
  await browser.close();
  process.exit(1);
}
await setDemoMode(adminCtx, true);
console.log("Demo mode enabled — capturing…");

try {
  // ---- Desktop screenshots (crisp: 2x scale) ------------------------------
  console.log("Desktop screenshots:");
  const desktop = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  const dp = await desktop.newPage();
  await prep(dp, "/");
  save("hero-desktop.png", await dp.screenshot());
  for (const [id, name] of [
    ["best-times", "best-times-desktop.png"],
    ["conditions", "conditions-desktop.png"],
    ["insights", "insights-desktop.png"],
  ]) {
    const el = dp.locator(`#${id}`);
    await el.scrollIntoViewIfNeeded();
    await dp.waitForTimeout(900); // section entrance animations
    save(name, await el.screenshot());
  }
  await desktop.close();

  // ---- Mobile screenshots --------------------------------------------------
  console.log("Mobile screenshots:");
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const mp = await mobile.newPage();
  await prep(mp, "/");
  save("hero-mobile.png", await mp.screenshot());
  const mChart = mp.locator("#best-times");
  await mChart.scrollIntoViewIfNeeded();
  await mp.waitForTimeout(2600); // let the one-time scroll nudge finish
  save("best-times-mobile.png", await mChart.screenshot());
  const mCond = mp.locator("#conditions");
  await mCond.scrollIntoViewIfNeeded();
  await mp.waitForTimeout(900);
  save("conditions-mobile.png", await mCond.screenshot());
  await mobile.close();

  // ---- Desktop GIF: scroll tour (1x scale to keep size down) --------------
  console.log("Desktop scroll GIF:");
  const gifCtx = await browser.newContext({
    viewport: { width: 1100, height: 680 },
    deviceScaleFactor: 1,
  });
  const gp = await gifCtx.newPage();
  await prep(gp, "/");
  const maxY = await gp.evaluate(
    () => document.documentElement.scrollHeight - window.innerHeight,
  );
  const tourFrames = [];
  const STEPS = 44;
  for (let i = 0; i <= STEPS; i++) {
    // ease-in-out so the tour lingers at the top and bottom
    const t = i / STEPS;
    const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
    await gp.evaluate((y) => window.scrollTo(0, y), Math.round(maxY * eased));
    await gp.waitForTimeout(40);
    tourFrames.push(await gp.screenshot());
  }
  // hold the last frame a beat before looping
  for (let i = 0; i < 6; i++) tourFrames.push(tourFrames[tourFrames.length - 1]);
  save("tour-desktop.gif", encodeGif(tourFrames, 70));
  await gifCtx.close();

  // ---- Mobile GIF: chart sweep + tabs (clipped to the chart card) ---------
  console.log("Mobile chart GIF:");
  const mGifCtx = await browser.newContext({
    viewport: { width: 390, height: 780 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  });
  const mg = await mGifCtx.newPage();
  await prep(mg, "/");
  const chart = mg.locator("#best-times");
  await chart.scrollIntoViewIfNeeded();
  const box = await chart.boundingBox();
  const clip = {
    x: Math.max(0, box.x),
    y: Math.max(0, box.y),
    width: Math.min(box.width, 390),
    height: Math.min(box.height, 780),
  };
  const chartFrames = [];
  const grab = async () => chartFrames.push(await mg.screenshot({ clip }));
  // ~3s: catches the one-time sweep-to-end-and-back nudge
  for (let i = 0; i < 26; i++) {
    await grab();
    await mg.waitForTimeout(90);
  }
  // tab switches
  for (const label of ["Yesterday", "Weekly avg.", "Today"]) {
    await mg.getByRole("tab", { name: label }).click();
    for (let i = 0; i < 7; i++) {
      await grab();
      await mg.waitForTimeout(90);
    }
  }
  save("chart-mobile.gif", encodeGif(chartFrames, 90));
  await mGifCtx.close();
} finally {
  // Always restore live data, even if a capture failed.
  await setDemoMode(adminCtx, false);
  console.log("Demo mode disabled — resident view back on live data.");
  await browser.close();
}
