// @montara/render-blender — real Blender render adapter.
// Drives headless Blender (`blender --background --python <script>`) to a PNG frame sequence,
// then encodes the frames to MP4 with ffmpeg. Resolves a concrete blender.exe on Windows /
// common install dirs; reports availability so callers degrade to ffmpeg when Blender is absent.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { mediaBin } from "../../render-ffmpeg/src/index";

export interface BlenderRenderResult {
  ok: boolean;
  path: string | null;
  frames: number;
  error?: string;
}

/** Resolve a concrete blender executable, or null. */
export function blenderBin(): string | null {
  const win = process.platform === "win32";
  if (win) {
    const root = "C:\\Program Files\\Blender Foundation";
    try {
      for (const entry of readdirSync(root, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const candidate = join(root, entry.name, "blender.exe");
        if (existsSync(candidate)) return candidate;
      }
    } catch { /* not installed there */ }
  }
  for (const c of ["/opt/blender/blender", "/usr/bin/blender", "/usr/local/bin/blender", "/Applications/Blender.app/Contents/MacOS/Blender"]) {
    if (existsSync(c)) return c;
  }
  const probe = spawnSync("blender", ["--version"], { encoding: "utf8", timeout: 5000 });
  return probe.status === 0 ? "blender" : null;
}

export function blenderAvailable(): boolean {
  return blenderBin() !== null;
}

/** Render a Blender python scene to MP4 via headless Blender + ffmpeg. */
export function renderBlenderScene(scriptPath: string, outPath: string, opts: { fps?: number } = {}): BlenderRenderResult {
  const bin = blenderBin();
  if (!bin) return { ok: false, path: null, frames: 0, error: "Blender not found (install Blender to use the 3D adapter)" };
  if (!existsSync(scriptPath)) return { ok: false, path: null, frames: 0, error: `scene script not found: ${scriptPath}` };

  const fps = opts.fps ?? 24;
  // Blender resolves relative/backslash paths against the drive root on Windows — always pass an
  // absolute, forward-slash path so frames land where we expect.
  const absOut = resolve(outPath);
  const framesDir = join(dirname(absOut), "blender-frames");
  mkdirSync(framesDir, { recursive: true });

  const blenderFramesArg = framesDir.replace(/\\/g, "/");
  const blend = spawnSync(bin, ["--background", "--python", scriptPath, "--", blenderFramesArg], { encoding: "utf8" });
  if (blend.status !== 0) {
    return { ok: false, path: null, frames: 0, error: `Blender exited ${blend.status}: ${(blend.stderr || "").slice(-300)}` };
  }

  const frames = readdirSync(framesDir).filter((f) => /^frame_\d+\.png$/.test(f)).length;
  if (frames === 0) return { ok: false, path: null, frames: 0, error: "Blender produced no frames" };

  const ff = spawnSync(mediaBin("ffmpeg"), [
    "-y", "-framerate", String(fps), "-start_number", "1",
    "-i", join(framesDir, "frame_%04d.png"),
    "-c:v", "libx264", "-pix_fmt", "yuv420p", absOut,
  ], { encoding: "utf8" });
  if (ff.status !== 0 || !existsSync(absOut)) {
    return { ok: false, path: null, frames, error: `ffmpeg encode failed: ${(ff.stderr || "").slice(-300)}` };
  }
  return { ok: true, path: absOut, frames };
}
