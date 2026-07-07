import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

if (process.env.CI || process.env.MONTARA_SKIP_POSTINSTALL) {
  process.exit(0);
}

const marker = join(process.cwd(), "node_modules", ".montara-postinstall-seen");
if (existsSync(marker)) {
  process.exit(0);
}

console.log("");
console.log("Montara installed.");
console.log("Next:");
console.log("  1. copy .env.example .env");
console.log("  2. python -m pip install -r requirements/dev.txt");
console.log("  3. pnpm run montara doctor");
console.log("  4. pnpm run montara start");
console.log("");
console.log("Windows shortcut: scripts\\setup.bat");

try {
  mkdirSync(dirname(marker), { recursive: true });
  writeFileSync(marker, "ok\n");
} catch {
  // Non-critical: this message may show again if the marker cannot be written.
}
