import { existsSync } from "node:fs";
import { join } from "node:path";

export interface DrawtextFontOptions {
  fontFile?: string;
  fontFamily?: string;
}

const FONT_CANDIDATES = [
  process.env.MONTARA_FONT_FILE,
  process.env.WINDIR ? join(process.env.WINDIR, "Fonts", "arialbd.ttf") : undefined,
  process.env.WINDIR ? join(process.env.WINDIR, "Fonts", "arial.ttf") : undefined,
  "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
  "/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf",
  "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
  "/Library/Fonts/Arial Bold.ttf",
].filter((value): value is string => Boolean(value));

function escapeDrawtextValue(value: string): string {
  return value.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

function escapeFontName(value: string): string {
  return value.replace(/[':]/g, " ").trim() || "Arial";
}

export function resolveFontFile(preferred?: string): string | null {
  const candidates = preferred ? [preferred, ...FONT_CANDIDATES] : FONT_CANDIDATES;
  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) return candidate;
  }
  return null;
}

export function drawtextFont(options: DrawtextFontOptions = {}): string {
  const fontFile = resolveFontFile(options.fontFile);
  if (fontFile) return `fontfile='${escapeDrawtextValue(fontFile)}'`;
  return `font='${escapeFontName(options.fontFamily ?? "Arial")}'`;
}
