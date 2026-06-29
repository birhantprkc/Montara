import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { scenePlanToTimeline, type ScenePlan } from "../packages/core/src/index";
import { drawtextFont, mediaBin, probeDuration, renderScenePlan } from "../packages/render-ffmpeg/src/index";
import { renderWithEngine, type EngineId } from "../packages/render-engines/src/index";
import { blenderAvailable, renderBlenderScene } from "../packages/render-blender/src/index";

const root = process.cwd();
const assetsDir = join(root, "assets");
const outDir = join(root, "out", "asset-build");
mkdirSync(assetsDir, { recursive: true });
mkdirSync(outDir, { recursive: true });

interface ManifestItem {
  id: string;
  path: string;
  kind: "image" | "video";
  engine?: string;
  renderer?: string;
  durationSec?: number;
  note: string;
}

const manifest: ManifestItem[] = [];

function run(bin: string, args: string[]): void {
  const r = spawnSync(bin, args, { encoding: "utf8" });
  if (r.status !== 0) {
    throw new Error(`${bin} failed: ${(r.stderr || r.error?.message || "").slice(-800)}`);
  }
}

function drawStill(outPath: string, width: number, height: number, title: string, subtitle: string, bg: string, accent: string): void {
  const vf = [
    `drawbox=x=0:y=0:w=iw:h=ih:color=0x${bg}:t=fill`,
    `drawbox=x=60:y=60:w=iw-120:h=ih-120:color=0x${accent}@0.15:t=6`,
    `drawtext=${drawtextFont()}:text='${title}':fontcolor=white:fontsize=${Math.round(height * 0.12)}:x=(w-text_w)/2:y=(h-text_h)/2-50`,
    `drawtext=${drawtextFont()}:text='${subtitle}':fontcolor=0x${accent}:fontsize=${Math.round(height * 0.038)}:x=(w-text_w)/2:y=(h-text_h)/2+65`,
  ].join(",");
  run(mediaBin("ffmpeg"), [
    "-y",
    "-f", "lavfi", "-i", `color=c=0x${bg}:s=${width}x${height}:d=1:r=1`,
    "-vf", vf,
    "-frames:v", "1",
    outPath,
  ]);
}

function plan(id: string, scenes: ScenePlan["scenes"]): ScenePlan {
  return { width: 1280, height: 720, fps: 24, scenes: scenes.map((s) => ({ ...s, id: `${id}-${s.id}` })) };
}

function renderEngineProof(engine: EngineId, outPath: string, p: ScenePlan): { renderer: string; durationSec: number } {
  const timeline = scenePlanToTimeline(p);
  const result = renderWithEngine(engine, timeline, outPath);
  return { renderer: result.renderer, durationSec: Number(probeDuration(outPath).toFixed(2)) };
}

const logo = join(assetsDir, "logo.png");
drawStill(logo, 1024, 1024, "MONTARA", "LOCAL FIRST VIDEO ENGINE", "07121d", "12dce8");
manifest.push({ id: "logo", path: logo, kind: "image", note: "Montara-owned generated logo card." });

const social = join(assetsDir, "social_preview.png");
drawStill(social, 1200, 630, "MONTARA", "Timeline IR  Python engine  Any assistant", "0b1020", "e6b44c");
manifest.push({ id: "social-preview", path: social, kind: "image", note: "Montara social preview generated locally." });

const showcasePlan = plan("showcase", [
  { id: "open", title: "Montara builds from one Timeline IR", durationSec: 1.5, background: "0b1020" },
  { id: "engine", title: "Python engine mirror plus typed TS boundaries", durationSec: 1.5, background: "0f3d3e" },
  { id: "adapters", title: "FFmpeg fallback keeps every run watchable", durationSec: 1.5, background: "5c3f7a" },
  { id: "documentary", title: "Documentary craft gates shape the final cut", durationSec: 1.5, background: "8a3b46" },
]);
const showcase = join(assetsDir, "montara-showcase.mp4");
renderScenePlan(showcasePlan, showcase);
manifest.push({
  id: "montara-showcase",
  path: showcase,
  kind: "video",
  engine: "ffmpeg",
  renderer: "native",
  durationSec: Number(probeDuration(showcase).toFixed(2)),
  note: "Compact capability reel generated from a Montara scene plan.",
});

const showcasePoster = join(assetsDir, "showcase.jpg");
run(mediaBin("ffmpeg"), ["-y", "-ss", "0.2", "-i", showcase, "-frames:v", "1", showcasePoster]);
manifest.push({ id: "showcase-poster", path: showcasePoster, kind: "image", note: "Poster frame extracted from the Montara showcase clip." });

const threeOut = join(assetsDir, "montara-threejs-proof.mp4");
const three = renderEngineProof("three", threeOut, plan("threejs", [
  { id: "orbit", title: "three.js intent  orbital 3D title", durationSec: 1.4, background: "07121d" },
  { id: "mesh", title: "Native runtime absent  FFmpeg fallback rendered", durationSec: 1.4, background: "164e63" },
  { id: "ir", title: "Same Timeline IR  renderer can upgrade later", durationSec: 1.4, background: "0f766e" },
]));
manifest.push({ id: "threejs-proof", path: threeOut, kind: "video", engine: "three", renderer: three.renderer, durationSec: three.durationSec, note: "Three.js adapter proof; native package can replace the fallback later." });

const manimOut = join(assetsDir, "montara-manim-proof.mp4");
const manim = renderEngineProof("manim", manimOut, plan("manim", [
  { id: "equation", title: "Manim intent  x squared to insight", durationSec: 1.4, background: "1e1b4b" },
  { id: "diagram", title: "Math scene slot is wired in the engine registry", durationSec: 1.4, background: "4338ca" },
  { id: "fallback", title: "No Manim binary found  FFmpeg fallback rendered", durationSec: 1.4, background: "312e81" },
]));
manifest.push({ id: "manim-proof", path: manimOut, kind: "video", engine: "manim", renderer: manim.renderer, durationSec: manim.durationSec, note: "Manim adapter proof; native Manim can render this slot when MANIM_BIN is configured." });

const blenderOut = join(assetsDir, "montara-blender-proof.mp4");
if (blenderAvailable()) {
  const result = renderBlenderScene(join(root, "blender", "montara_intro.py"), blenderOut);
  if (!result.ok) throw new Error(result.error || "Blender render failed");
  manifest.push({ id: "blender-proof", path: blenderOut, kind: "video", engine: "blender", renderer: "native", durationSec: Number(probeDuration(blenderOut).toFixed(2)), note: `Native Blender render with ${result.frames} frames.` });
} else {
  const blender = renderEngineProof("blender", blenderOut, plan("blender", [
    { id: "model", title: "Blender intent  extruded Montara title", durationSec: 1.4, background: "1c1917" },
    { id: "adapter", title: "Real adapter exists  install Blender to enable native", durationSec: 1.4, background: "7c2d12" },
    { id: "fallback", title: "FFmpeg fallback rendered this proof clip", durationSec: 1.4, background: "9a3412" },
  ]));
  manifest.push({ id: "blender-proof", path: blenderOut, kind: "video", engine: "blender", renderer: blender.renderer, durationSec: blender.durationSec, note: "Blender adapter proof; native render skipped because Blender was not installed." });
}

const manifestPath = join(assetsDir, "montara-assets.json");
writeFileSync(manifestPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), items: manifest }, null, 2)}\n`);
console.log(`wrote ${manifest.length} Montara assets`);
for (const item of manifest) console.log(`${item.id}: ${item.path}`);
