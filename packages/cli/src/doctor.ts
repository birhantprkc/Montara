import { spawnSync } from "node:child_process";
import { mediaBin } from "../../render-ffmpeg/src/index";
import { engineReady } from "../../engine/src/index";

const tool = (label: string, bin: string): boolean => {
  const r = spawnSync(bin, ["-version"], { encoding: "utf8" });
  const ok = r.status === 0;
  console.log(`  ${ok ? "ok" : "missing"} ${label.padEnd(8)} ${ok ? bin : "(not found)"}`);
  return ok;
};

export function runDoctor(): number {
  console.log("== montara doctor ==\n");
  console.log(`  ok node     ${process.version}`);
  const ffmpeg = tool("ffmpeg", mediaBin("ffmpeg"));
  const ffprobe = tool("ffprobe", mediaBin("ffprobe"));

  // Python engine readiness — advisory (the ffmpeg path renders without it).
  const eng = engineReady();
  if (eng.ready && eng.info) {
    console.log(
      `  ok engine   Python ${eng.info.python_version} · ${eng.info.tools} tools · ${eng.info.lib} lib · ${eng.info.pipelines.length} pipelines`,
    );
  } else {
    console.log(`  warn engine  ${eng.reasons.join("; ") || "not ready"} (TS/ffmpeg path still works)`);
  }

  console.log(
    ffmpeg && ffprobe
      ? "\n  Ready to render."
      : "\n  Install FFmpeg (for example `winget install Gyan.FFmpeg`) to render.",
  );
  return ffmpeg && ffprobe ? 0 : 1;
}
