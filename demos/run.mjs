// Demo runner: bundle a demo (it imports Montara's TypeScript packages directly) and execute it.
//
// The demos import `packages/*/src` rather than a built dist so a compositor change shows up in the
// next render without a package build — the tuning loop for a shot is tight and a build step in the
// middle of it is where iteration speed goes to die.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { basename, join } from "node:path";

const BUILD = "out/demos/.build";

const targets = process.argv.slice(2);
if (!targets.length) {
  console.error("usage: node demos/run.mjs <demo.mjs> [...]");
  process.exit(1);
}

mkdirSync(BUILD, { recursive: true });

for (const target of targets) {
  const entry = existsSync(target) ? target : join("demos", target);
  if (!existsSync(entry)) {
    console.error(`no such demo: ${entry}`);
    process.exit(1);
  }
  const bundled = join(BUILD, basename(entry));
  console.log(`\n=== ${basename(entry)}`);

  const build = spawnSync(
    "npx",
    ["esbuild", entry, "--bundle", "--platform=node", "--format=esm", `--outfile=${bundled}`, "--log-level=warning"],
    { stdio: "inherit", shell: true },
  );
  if (build.status !== 0) process.exit(build.status ?? 1);

  const run = spawnSync("node", [bundled], { stdio: "inherit" });
  if (run.status !== 0) process.exit(run.status ?? 1);
}
