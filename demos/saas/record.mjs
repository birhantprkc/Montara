// Record CapCut-style product UI tours with Playwright.
//
// usage:
//   node record.mjs                         # montara studio × wide/square/linkedin
//   node record.mjs linkedin.html linkedin  # LinkedIn product demo @ 4:5
//   node record.mjs x.html square           # X product demo @ 1:1
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from "node:fs";
import { join, dirname, extname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_ROOT = join(HERE, "../../out/demos");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".css": "text/css",
  ".js": "text/javascript",
};

function serve(root) {
  const server = createServer((req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    const rel = decodeURIComponent(url.pathname === "/" ? "/studio.html" : url.pathname);
    const path = join(root, rel.replace(/^\//, ""));
    if (!path.startsWith(root) || !existsSync(path)) {
      res.writeHead(404); res.end("missing"); return;
    }
    res.writeHead(200, { "content-type": MIME[extname(path)] || "application/octet-stream" });
    res.end(readFileSync(path));
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
  });
}

const VIEWPORTS = {
  wide: { width: 1920, height: 1080 },
  square: { width: 1080, height: 1080 },
  linkedin: { width: 1080, height: 1350 },
};

async function recordOne(browser, port, { page: pageName, aspect, outDir, outName }) {
  mkdirSync(outDir, { recursive: true });
  const dir = join(outDir, `.tmp-${outName}`);
  mkdirSync(dir, { recursive: true });
  const context = await browser.newContext({
    viewport: VIEWPORTS[aspect],
    deviceScaleFactor: 1,
    recordVideo: { dir, size: VIEWPORTS[aspect] },
  });
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${port}/${pageName}?aspect=${aspect}`);
  await page.waitForFunction(() => document.body.dataset.ready === "1");
  await page.waitForFunction(() => document.body.dataset.tourDone === "1", null, { timeout: 45000 });
  await page.waitForTimeout(350);
  await context.close();

  const webm = readdirSync(dir).find((f) => f.endsWith(".webm"));
  if (!webm) throw new Error(`no recording for ${outName}`);
  const src = join(dir, webm);
  const dest = join(outDir, `${outName}.mp4`);
  const r = spawnSync("ffmpeg", [
    "-y", "-v", "error", "-i", src,
    "-c:v", "libx264", "-crf", "18", "-preset", "medium", "-pix_fmt", "yuv420p",
    "-an", dest,
  ], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`ffmpeg encode failed: ${r.stderr?.slice(-400)}`);
  try { unlinkSync(src); } catch { /* ignore */ }
  return dest;
}

const args = process.argv.slice(2);
const jobs = [];

if (!args.length) {
  for (const aspect of ["wide", "square", "linkedin"]) {
    jobs.push({
      page: "studio.html",
      aspect,
      outDir: join(OUT_ROOT, "06-saas", "recordings"),
      outName: aspect,
    });
  }
} else if (args[0].endsWith(".html")) {
  const page = args[0];
  const aspect = args[1] || "wide";
  // Optional third arg is the demo folder name (e.g. 08-x). Defaults to 07-<page>.
  const folder = args[2] || `07-${basename(page, ".html")}`;
  jobs.push({
    page,
    aspect,
    outDir: join(OUT_ROOT, folder, "recordings"),
    outName: aspect,
  });
} else {
  for (const aspect of args) {
    jobs.push({
      page: "studio.html",
      aspect,
      outDir: join(OUT_ROOT, "06-saas", "recordings"),
      outName: aspect,
    });
  }
}

const { server, port } = await serve(HERE);
const browser = await chromium.launch({ headless: true });
const out = {};
try {
  for (const job of jobs) {
    out[job.outName] = await recordOne(browser, port, job);
    console.log(`recorded ${job.page} @ ${job.aspect} -> ${out[job.outName]}`);
  }
} finally {
  await browser.close();
  server.close();
}
console.log(JSON.stringify(out, null, 2));
