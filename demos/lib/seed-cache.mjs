// Re-key an already-computed artifact into the demo cache.
//
// The SF walk matte took minutes of RVM inference before the demo pipeline existed; there is no
// reason to pay for it again just because the cache key is derived differently now.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { CACHE } from "./assets.mjs";

const [existing, source, optsJson = "{}"] = process.argv.slice(2);
if (!existing || !source) {
  console.error("usage: seed-cache.mjs <existing-matte.mp4> <original-source-path> [optsJson]");
  process.exit(1);
}
if (!existsSync(existing)) {
  console.error(`no such file: ${existing}`);
  process.exit(1);
}

const key = createHash("sha1").update(source).update(optsJson).digest("hex").slice(0, 10);
const dest = join(CACHE, `matte-${key}.mp4`);
mkdirSync(CACHE, { recursive: true });
copyFileSync(existing, dest);
console.log(`seeded ${dest}`);
