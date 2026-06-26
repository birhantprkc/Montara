// Resolve a CONCRETE ffmpeg/ffprobe binary. On Windows the bare name can resolve to a winget
// App-Execution alias that crashes when spawned from a GUI/no-console process, so we prefer a
// real .exe under WinGet\Packages (depth-limited search) and common install dirs, bare name last.
// (Ported method from the WARCUT engine — our own code.)

import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

function findExe(dir: string, exe: string, depth: number): string | null {
  if (depth === 0) return null;
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  const subdirs: string[] = [];
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) subdirs.push(p);
    else if (e.name.toLowerCase() === exe.toLowerCase()) return p;
  }
  for (const s of subdirs) {
    const f = findExe(s, exe, depth - 1);
    if (f) return f;
  }
  return null;
}

export function mediaBin(name: "ffmpeg" | "ffprobe"): string {
  const win = process.platform === "win32";
  const exe = win ? `${name}.exe` : name;
  const candidates = [
    `C:\\ffmpeg\\bin\\${exe}`,
    `C:\\Program Files\\ffmpeg\\bin\\${exe}`,
    `/opt/homebrew/bin/${name}`,
    `/usr/local/bin/${name}`,
    `/usr/bin/${name}`,
  ];
  const local = process.env["LOCALAPPDATA"];
  if (win && local) {
    const found = findExe(join(local, "Microsoft", "WinGet", "Packages"), exe, 5);
    if (found) candidates.unshift(found);
  }
  for (const c of candidates) if (existsSync(c)) return c;
  return name; // bare fallback (works where it's on PATH / in a console)
}
