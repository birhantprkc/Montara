#!/usr/bin/env node
/**
 * Public Montara demo generator.
 *
 * This intentionally prefers local, zero-key artifacts:
 * - Remotion renders the visual engine matrix and documentary-studio proof.
 * - FFmpeg probes, muxes audio, creates posters, and validates MP4s.
 * - Windows system TTS is used when available; otherwise the demos get a
 *   silent AAC track so playback remains portable.
 *
 * No paid API calls are made by this script.
 */
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const demosDir = join(root, "demos");
const postersDir = join(demosDir, "posters");
const workDir = join(demosDir, ".work");
const composerDir = join(root, "remotion-composer");
const isWindows = process.platform === "win32";

mkdirSync(demosDir, { recursive: true });
mkdirSync(postersDir, { recursive: true });
mkdirSync(workDir, { recursive: true });

loadDotEnv(join(root, ".env"));

const DEMO_ENV = {
  ...process.env,
  MONTARA_TTS_PROVIDER: "system",
};

const technologyList = [
  "FFmpeg",
  "Remotion",
  "HyperFrames",
  "Blender",
  "Three.js",
  "Manim",
  "Revideo",
  "Motion Canvas",
  "Playwright",
];

const staleDemoIds = [
  "01-explainer",
  "02-documentary-montage",
  "03-youtube-short",
  "04-screen-demo",
  "05-engine-showcase",
  "06-documentary-studio",
];

function loadDotEnv(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index < 1) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

function localBin(baseDir, name) {
  return join(baseDir, "node_modules", ".bin", isWindows ? `${name}.cmd` : name);
}

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, {
    cwd: opts.cwd ?? root,
    env: { ...DEMO_ENV, ...(opts.env ?? {}) },
    encoding: "utf8",
    stdio: opts.stdio ?? "pipe",
    shell: isWindows && /\.cmd$/i.test(cmd),
  });
  if (opts.check !== false && result.status !== 0) {
    const tail = `${result.error?.message || ""}\n${result.stderr || ""}\n${result.stdout || ""}`.trim().slice(-1200);
    throw new Error(`${cmd} ${args.join(" ")} failed\n${tail}`);
  }
  return result;
}

function ffmpeg(...args) {
  return run("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", ...args]);
}

function probeDuration(path) {
  const result = run(
    "ffprobe",
    ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", path],
    { check: false }
  );
  return Number((result.stdout || "0").trim()) || 0;
}

function probeVideo(path) {
  const result = run(
    "ffprobe",
    [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height,codec_name",
      "-of",
      "csv=p=0",
      path,
    ],
    { check: false }
  );
  return (result.stdout || "")
    .trim()
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .join(",");
}

function remotionBin() {
  const bin = localBin(composerDir, "remotion");
  if (!existsSync(bin)) {
    throw new Error(
      "Remotion CLI is missing. Run `npm install` inside remotion-composer before `pnpm demos:generate`."
    );
  }
  return bin;
}

function renderRemotion(composition, outputPath) {
  run(
    remotionBin(),
    [
      "render",
      "src/index.tsx",
      composition,
      outputPath,
      "--overwrite",
      "--codec=h264",
      "--pixel-format=yuv420p",
      "--log=warn",
      "--bundle-cache=false",
    ],
    { cwd: composerDir, stdio: "inherit" }
  );
  if (!existsSync(outputPath) || probeDuration(outputPath) <= 0) {
    throw new Error(`Remotion did not create a playable MP4: ${outputPath}`);
  }
}

function systemTts(text, outWav) {
  if (!isWindows) return false;
  const escapedText = text.replace(/'/g, "''");
  const escapedOut = outWav.replace(/'/g, "''");
  const script = [
    "Add-Type -AssemblyName System.Speech",
    "$s = New-Object System.Speech.Synthesis.SpeechSynthesizer",
    "$s.Rate = -1",
    "$s.Volume = 96",
    `$s.SetOutputToWaveFile('${escapedOut}')`,
    `$s.Speak('${escapedText}')`,
    "$s.Dispose()",
  ].join("; ");
  const result = run("powershell", ["-NoProfile", "-Command", script], { check: false });
  return result.status === 0 && existsSync(outWav) && probeDuration(outWav) > 0.2;
}

function muxNarration(videoPath, narrationPath, outputPath) {
  const duration = probeDuration(videoPath);
  if (duration <= 0) throw new Error(`Cannot mux invalid video: ${videoPath}`);

  if (narrationPath && existsSync(narrationPath)) {
    ffmpeg(
      "-i",
      videoPath,
      "-i",
      narrationPath,
      "-filter_complex",
      "[1:a]aresample=48000,volume=1.05,apad[a]",
      "-map",
      "0:v:0",
      "-map",
      "[a]",
      "-t",
      duration.toFixed(3),
      "-c:v",
      "copy",
      "-c:a",
      "aac",
      "-b:a",
      "160k",
      "-movflags",
      "+faststart",
      outputPath
    );
  } else {
    ffmpeg(
      "-i",
      videoPath,
      "-f",
      "lavfi",
      "-t",
      duration.toFixed(3),
      "-i",
      "anullsrc=r=48000:cl=stereo",
      "-map",
      "0:v:0",
      "-map",
      "1:a:0",
      "-c:v",
      "copy",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-movflags",
      "+faststart",
      outputPath
    );
  }

  if (!existsSync(outputPath) || probeDuration(outputPath) <= 0) {
    throw new Error(`Mux failed: ${outputPath}`);
  }
}

function makePoster(videoPath, posterPath, label) {
  const duration = probeDuration(videoPath);
  if (duration <= 0) return false;
  const frames = [
    [Math.max(0.8, duration * 0.2), join(workDir, `${label}-poster-a.jpg`)],
    [Math.max(1.2, duration * 0.5), join(workDir, `${label}-poster-b.jpg`)],
    [Math.max(1.6, duration * 0.78), join(workDir, `${label}-poster-c.jpg`)],
  ];
  for (const [time, output] of frames) {
    ffmpeg("-ss", time.toFixed(2), "-i", videoPath, "-frames:v", "1", "-q:v", "2", output);
  }
  if (!frames.every(([, output]) => existsSync(output))) return false;
  ffmpeg("-i", frames[0][1], "-i", frames[1][1], "-i", frames[2][1], "-filter_complex", "[0:v][1:v][2:v]hstack=inputs=3", posterPath);
  return existsSync(posterPath);
}

function cleanStaleDemos() {
  for (const id of staleDemoIds) {
    rmSync(join(demosDir, `${id}.mp4`), { force: true });
    rmSync(join(postersDir, `${id}-poster.jpg`), { force: true });
  }
}

function recordDemo(manifest, entry) {
  const posterPath = join(postersDir, `${entry.id}-poster.jpg`);
  makePoster(join(root, entry.video), posterPath, entry.id);
  manifest.demos.push({
    ...entry,
    poster: existsSync(posterPath) ? `demos/posters/${entry.id}-poster.jpg` : null,
    durationSec: Number(probeDuration(join(root, entry.video)).toFixed(1)),
    videoProbe: probeVideo(join(root, entry.video)),
  });
}

console.log("Montara public demo generator");
console.log("No paid API calls. Technologies covered:", technologyList.join(", "));

cleanStaleDemos();

const manifest = {
  generatedAt: new Date().toISOString(),
  generator: "scripts/generate-github-demos.mjs",
  apisUsed: [],
  audio: {
    preference: "system TTS when available, silent AAC fallback otherwise",
    provider: isWindows ? "Windows System.Speech" : "silent fallback",
  },
  demos: [],
};

const engineRaw = join(workDir, "01-engine-matrix.raw.mp4");
const engineVoice = join(workDir, "01-engine-matrix-narration.wav");
const engineOut = join(demosDir, "01-engine-matrix.mp4");
renderRemotion("EngineMatrix", engineRaw);
const engineNarrationOk = systemTts(
  "Montara is a local first video studio operating system. This demo shows the shipped engine surface: FFmpeg for the always working MP4 floor, Remotion for React motion graphics, HyperFrames for HTML and GSAP animation, Blender, Three dot JS, and Manim as runtime gated native adapters, Revideo and Motion Canvas as honest selector targets, and Playwright for browser capture with login state. Every path routes through one Timeline IR and records when it used a fallback.",
  engineVoice
);
muxNarration(engineRaw, engineNarrationOk ? engineVoice : null, engineOut);
recordDemo(manifest, {
  id: "01-engine-matrix",
  title: "Full engine matrix",
  video: "demos/01-engine-matrix.mp4",
  renderer: "Remotion visual composition + FFmpeg mux/probe/poster",
  voice: engineNarrationOk ? "system" : "silent fallback",
  technologies: technologyList,
  truth: [
    "FFmpeg and Remotion are demonstrated as local render/mux paths",
    "HyperFrames, Blender, Three.js, Manim, Revideo, Motion Canvas, and Playwright are shown with their shipped adapter/probe/runtime-gated status",
  ],
});

const studioRaw = join(workDir, "02-documentary-studio.raw.mp4");
const studioVoice = join(workDir, "02-documentary-studio-narration.wav");
const studioOut = join(demosDir, "02-documentary-studio.mp4");
renderRemotion("DocumentaryColdOpen", studioRaw);
const studioNarrationOk = systemTts(
  "The documentary studio proof shows Montara's Remotion and d3 geo layer for evidence led openings, map motion, source chips, and niche ready formats. It is a polished local artifact, not a promise that every long form documentary workflow is already complete.",
  studioVoice
);
muxNarration(studioRaw, studioNarrationOk ? studioVoice : null, studioOut);
recordDemo(manifest, {
  id: "02-documentary-studio",
  title: "Documentary studio proof",
  video: "demos/02-documentary-studio.mp4",
  renderer: "Remotion documentary-studio composition + FFmpeg mux/probe/poster",
  voice: studioNarrationOk ? "system" : "silent fallback",
  technologies: ["Remotion", "d3-geo", "Timeline IR style system", "FFmpeg"],
  truth: [
    "Local polished visual proof for documentary openings and map-driven scenes",
    "Long-form documentary and one-hour film workflows remain roadmap validation work",
  ],
});

writeFileSync(join(demosDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`Wrote ${manifest.demos.length} public demos to demos/`);
for (const demo of manifest.demos) {
  console.log(`${demo.id}: ${demo.video} (${demo.durationSec}s, ${demo.videoProbe})`);
}
