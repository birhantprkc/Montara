declare const process: {
  argv: string[];
  cwd(): string;
  env: Record<string, string | undefined>;
  exit(code?: number): never;
  exitCode?: number;
  platform: string;
  version: string;
};

declare module "node:child_process" {
  export interface SpawnSyncResult {
    status: number | null;
    stdout?: string;
    stderr?: string;
    error?: Error;
  }

  export function spawnSync(command: string, args?: string[], options?: Record<string, unknown>): SpawnSyncResult;
}

declare module "node:fs" {
  export interface Dirent {
    name: string;
    isDirectory(): boolean;
  }

  export function existsSync(path: string): boolean;
  export function mkdirSync(path: string, options?: { recursive?: boolean }): void;
  export function readFileSync(path: string, encoding: "utf8"): string;
  export function readdirSync(path: string, options: { withFileTypes: true }): Dirent[];
  export function rmSync(path: string, options?: { recursive?: boolean; force?: boolean }): void;
  export function writeFileSync(path: string, data: string): void;
}

declare module "node:os" {
  export function tmpdir(): string;
}

declare module "node:path" {
  export function dirname(path: string): string;
  export function join(...parts: string[]): string;
}
