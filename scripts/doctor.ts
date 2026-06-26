// `montara doctor` — pre-flight environment check. Tells the user exactly what's present and
// what's missing before they try to render. Grows as phases add runtimes/models.

import { spawnSync } from "node:child_process";
import { mediaBin } from "../packages/render-ffmpeg/src/index";

const tool = (label: string, bin: string): boolean => {
  const r = spawnSync(bin, ["-version"], { encoding: "utf8" });
  const okIt = r.status === 0;
  console.log(`  ${okIt ? "✓" : "✗"} ${label.padEnd(8)} ${okIt ? bin : "(not found)"}`);
  return okIt;
};

console.log("== montara doctor ==\n");
console.log(`  ✓ node     ${process.version}`);
const ffmpeg = tool("ffmpeg", mediaBin("ffmpeg"));
const ffprobe = tool("ffprobe", mediaBin("ffprobe"));

console.log(
  ffmpeg && ffprobe
    ? "\n  Ready to render."
    : "\n  Install FFmpeg (e.g. `winget install Gyan.FFmpeg`) to render.",
);
process.exit(ffmpeg && ffprobe ? 0 : 1);
