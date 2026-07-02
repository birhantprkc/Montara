import { spawnSync } from "node:child_process";
import { mediaBin } from "../../render-ffmpeg/src/index";
import { engineReady, engineProviders } from "../../engine/src/index";
import { probeHyperframes } from "../../render-engines/src/index";
import { brainCatalogue, ollamaInstalled } from "../../llm/src/index";
import type { HyperframesStatus } from "../../render-engines/src/index";

const tool = (label: string, bin: string): boolean => {
  const r = spawnSync(bin, ["-version"], { encoding: "utf8" });
  const ok = r.status === 0;
  console.log(`  ${ok ? "ok" : "missing"} ${label.padEnd(8)} ${ok ? bin : "(not found)"}`);
  return ok;
};

function printFixGuide(hyperframes: HyperframesStatus, ollamaOk: boolean): void {
  console.log("\n== guided setup ==");
  console.log("Montara will not install tools without your approval. Use the commands that fit your machine:\n");
  console.log("Windows:");
  console.log("  winget install Gyan.FFmpeg");
  console.log("  winget install OpenJS.NodeJS.LTS");
  console.log("  python -m pip install -r requirements-dev.txt");
  console.log("  npm install -D playwright @playwright/test");
  console.log("  npx playwright install chromium\n");
  console.log("Optional composition/runtime unlocks:");
  console.log("  Remotion: install project dependencies for remotion-composer, then validate native render locally");
  console.log("  HyperFrames: npx --yes hyperframes doctor");
  console.log("  HyperFrames cache warm: npx --yes hyperframes --version");
  console.log("  Piper: install piper and set PIPER_BIN if it is not on PATH");
  console.log("  Manim: python -m pip install manim");
  console.log("  Blender: install Blender and set BLENDER_BIN if it is not on PATH\n");
  console.log("Local LLM backends:");
  console.log("  Ollama: install Ollama and keep it running on http://127.0.0.1:11434");
  console.log("  LM Studio: enable the local server on http://127.0.0.1:1234");
  console.log("  llama.cpp: set LLAMA_CPP_SERVER_URL when using a local server\n");
  console.log("Current optional probes:");
  console.log(`  HyperFrames: ${hyperframes.available ? "available" : "not detected"} (${hyperframes.source}) - ${hyperframes.hint}`);
  console.log(`  Ollama CLI: ${ollamaOk ? "installed" : "not detected"}`);
  console.log(`  Local brain catalogue: ${brainCatalogue().map((b) => `${b.id} ${b.baseUrl}`).join(", ")}\n`);
  console.log("Secrets stay out of the repo. Put API keys in your shell, OS keychain, or local .env.");
}

export function runDoctor(args: string[] = []): number {
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
    const prov = engineProviders();
    if (prov) {
      console.log(`  ok providers ${prov.total} engine providers · ${prov.local} local (no key) · ${prov.configured} configured`);
    }
  } else {
    console.log(`  warn engine  ${eng.reasons.join("; ") || "not ready"} (TS/ffmpeg path still works)`);
  }

  const hyperframes = probeHyperframes();
  console.log(`  ${hyperframes.available ? "ok" : "warn"} hyperframes ${hyperframes.source}${hyperframes.version ? ` ${hyperframes.version}` : ""}`);

  const ollamaOk = ollamaInstalled();
  console.log(`  ${ollamaOk ? "ok" : "warn"} local llm ${brainCatalogue().map((b) => b.id).join(", ")}${ollamaOk ? " (ollama cli)" : " (no local CLI detected)"}`);

  console.log(
    ffmpeg && ffprobe
      ? "\n  Ready to render."
      : "\n  Install FFmpeg (for example `winget install Gyan.FFmpeg`) to render.",
  );
  if (args.includes("--fix")) printFixGuide(hyperframes, ollamaOk);
  return ffmpeg && ffprobe ? 0 : 1;
}
