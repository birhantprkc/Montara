// @montara/render-three — REAL native three.js renderer (not an ffmpeg degrade).
// Strategy: render a deterministic three.js scene one frame at a time with headless Chrome/Edge
// (software WebGL via ANGLE+SwiftShader, so no GPU needed), then stitch the PNG frames to MP4 with
// ffmpeg. three is imported from node_modules over file://, so the whole path is offline.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { drawtextFont, mediaBin } from "../../render-ffmpeg/src/index";

const CHROME_CANDIDATES = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
];

/** A concrete Chrome/Edge executable, or null if none is installed. */
export function chromeBin(): string | null {
  for (const c of CHROME_CANDIDATES) if (existsSync(c)) return c;
  return null;
}

/** Locate node_modules/three/build/three.module.js by walking up from `start`. */
export function threeModulePath(start: string = process.cwd()): string | null {
  let dir = start;
  for (let i = 0; i < 6; i++) {
    const p = join(dir, "node_modules", "three", "build", "three.module.js");
    if (existsSync(p)) return p;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/** True when a real three.js render can run (a Chromium-family browser + the three module). */
export function threeAvailable(start: string = process.cwd()): boolean {
  return Boolean(chromeBin()) && Boolean(threeModulePath(start));
}

export interface ThreeRenderOptions {
  width?: number;
  height?: number;
  fps?: number;
  seconds?: number;
  /** Burned-in wordmark (drawn by ffmpeg over the 3D), e.g. "MONTARA". */
  title?: string;
  /** Override the default scene with your own HTML (must read ?f=&n=&w=&h= and render once). */
  htmlPath?: string;
  background?: string;
}

export interface ThreeRenderResult {
  ok: boolean;
  path: string;
  frames: number;
  renderer: "three-webgl" | "ffmpeg-fallback";
  error?: string;
}

/** Default scene: a metallic torus knot orbiting on a dark stage. Deterministic per frame `f`. */
function defaultSceneHtml(threeFileUrl: string, background: string): string {
  return `<!doctype html><html><head><meta charset="utf8"><style>html,body{margin:0;overflow:hidden;background:#${background}}</style></head>
<body><canvas id="c"></canvas>
<script type="module">
import * as THREE from '${threeFileUrl}';
const p = new URLSearchParams(location.search);
const f = +(p.get('f')||0), n = +(p.get('n')||48), W = +(p.get('w')||1280), H = +(p.get('h')||720);
const t = n > 1 ? f/(n-1) : 0;
const canvas = document.getElementById('c'); canvas.width = W; canvas.height = H;
const r = new THREE.WebGLRenderer({canvas, antialias:true}); r.setSize(W,H,false); r.setClearColor(0x${background},1);
const scene = new THREE.Scene();
const cam = new THREE.PerspectiveCamera(50, W/H, 0.1, 100);
const ang = t*Math.PI*2; cam.position.set(Math.sin(ang)*4.2, 1.2, Math.cos(ang)*4.2); cam.lookAt(0,0,0);
const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(0.9,0.3,160,40),
  new THREE.MeshStandardMaterial({color:0x12dce8, metalness:0.55, roughness:0.18}));
knot.rotation.x = t*Math.PI*2; scene.add(knot);
scene.add(new THREE.AmbientLight(0xffffff,0.45));
const key = new THREE.DirectionalLight(0xffffff,1.4); key.position.set(3,4,5); scene.add(key);
const rim = new THREE.DirectionalLight(0xe6b44c,0.7); rim.position.set(-4,-2,-3); scene.add(rim);
r.render(scene,cam); document.title='ready';
</script></body></html>`;
}

function fallbackThreePreview(
  outPath: string,
  opts: { width: number; height: number; fps: number; seconds: number; title?: string; background: string },
  reason: string,
): ThreeRenderResult {
  const ff = mediaBin("ffmpeg");
  const vf: string[] = [
    `drawbox=x='(iw*0.5)+(sin(t*4)*iw*0.18)-iw*0.11':y='(ih*0.5)+(cos(t*3)*ih*0.15)-ih*0.11':w='iw*0.22':h='ih*0.22':color=0x12dce8@0.88:t=fill`,
    `drawbox=x='(iw*0.5)-(sin(t*4)*iw*0.18)-iw*0.08':y='(ih*0.5)-(cos(t*3)*ih*0.15)-ih*0.08':w='iw*0.16':h='ih*0.16':color=0xe6b44c@0.78:t=fill`,
    "format=yuv420p",
  ];
  if (opts.title) {
    const text = opts.title.replace(/[\\:']/g, " ").trim().slice(0, 40);
    vf.unshift(`drawtext=${drawtextFont()}:text='${text}':fontcolor=white:fontsize=${Math.round(opts.height * 0.11)}:x=(w-text_w)/2:y=h-${Math.round(opts.height * 0.2)}:shadowcolor=black:shadowx=3:shadowy=3`);
  }
  const enc = spawnSync(ff, [
    "-y",
    "-f", "lavfi", "-i", `color=c=0x${opts.background}:s=${opts.width}x${opts.height}:d=${opts.seconds}:r=${opts.fps}`,
    "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo",
    "-vf", vf.join(","), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "veryfast", "-crf", "22",
    "-c:a", "aac", "-ar", "48000", "-ac", "2", "-shortest", outPath,
  ], { encoding: "utf8" });
  if (enc.status !== 0) return { ok: false, path: outPath, frames: 0, renderer: "ffmpeg-fallback", error: `${reason}; fallback failed: ${(enc.stderr || "").slice(-220)}` };
  return { ok: true, path: outPath, frames: Math.max(1, Math.round(opts.fps * opts.seconds)), renderer: "ffmpeg-fallback", error: reason };
}

/** Render a three.js scene to a real MP4 via headless WebGL + ffmpeg. */
export function renderThreeScene(outPath: string, opts: ThreeRenderOptions = {}): ThreeRenderResult {
  const chrome = chromeBin();
  const three = threeModulePath();
  if (!chrome) return { ok: false, path: outPath, frames: 0, renderer: "three-webgl", error: "no Chrome/Edge browser found" };
  if (!three && !opts.htmlPath) return { ok: false, path: outPath, frames: 0, renderer: "three-webgl", error: "three not installed (pnpm add -w three)" };

  const W = opts.width ?? 1280, H = opts.height ?? 720, fps = opts.fps ?? 24, seconds = opts.seconds ?? 1.5;
  const bg = (opts.background ?? "07121d").replace(/^#/, "");
  const n = Math.max(2, Math.round(fps * seconds));
  const work = join(tmpdir(), `montara-three-${Date.now().toString(36)}`);
  const profile = join(work, "profile");
  mkdirSync(profile, { recursive: true });
  mkdirSync(dirname(outPath), { recursive: true });

  let html = opts.htmlPath;
  if (!html) {
    html = join(work, "scene.html");
    const threeUrl = `file:///${three!.replace(/\\/g, "/")}`;
    writeFileSync(html, defaultSceneHtml(threeUrl, bg));
  }
  const htmlUrl = `file:///${html.replace(/\\/g, "/")}`;

  let rendered = 0;
  for (let f = 0; f < n; f++) {
    const framePng = join(work, `frame_${String(f).padStart(4, "0")}.png`);
    const r = spawnSync(chrome, [
      "--headless=new", "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
      "--disable-gpu", "--disable-dev-shm-usage", "--no-first-run", "--no-default-browser-check",
      "--disable-background-networking", "--allow-file-access-from-files", "--hide-scrollbars", "--disable-extensions", "--mute-audio",
      `--user-data-dir=${profile}`, `--window-size=${W},${H}`,
      `--screenshot=${framePng}`, "--virtual-time-budget=2500",
      `${htmlUrl}?f=${f}&n=${n}&w=${W}&h=${H}`,
    ], { encoding: "utf8", timeout: 30000 });
    if (existsSync(framePng)) rendered++;
    else if (f === 0) {
      try { rmSync(work, { recursive: true, force: true }); } catch { /* best effort */ }
      return fallbackThreePreview(outPath, { width: W, height: H, fps, seconds, title: opts.title, background: bg }, `headless WebGL produced no frame: ${(r.stderr || "").slice(-220)}`);
    }
  }

  // stitch frames -> mp4 (+ silent audio + optional wordmark)
  const ff = mediaBin("ffmpeg");
  const vf: string[] = ["format=yuv420p"];
  if (opts.title) {
    const text = opts.title.replace(/[\\:']/g, " ").trim().slice(0, 40);
    vf.unshift(`drawtext=${drawtextFont()}:text='${text}':fontcolor=white:fontsize=${Math.round(H * 0.11)}:x=(w-text_w)/2:y=h-${Math.round(H * 0.2)}:shadowcolor=black:shadowx=3:shadowy=3`);
  }
  const enc = spawnSync(ff, [
    "-y", "-framerate", String(fps), "-start_number", "0", "-i", join(work, "frame_%04d.png"),
    "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo",
    "-vf", vf.join(","), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "veryfast", "-crf", "20",
    "-c:a", "aac", "-ar", "48000", "-ac", "2", "-shortest", outPath,
  ], { encoding: "utf8" });

  try { rmSync(work, { recursive: true, force: true }); } catch { /* best effort */ }
  if (enc.status !== 0) return fallbackThreePreview(outPath, { width: W, height: H, fps, seconds, title: opts.title, background: bg }, `three frame encode failed: ${(enc.stderr || "").slice(-220)}`);
  return { ok: true, path: outPath, frames: rendered, renderer: "three-webgl" };
}
