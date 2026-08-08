declare const process: {
  argv: string[];
  arch: string;
  cwd(): string;
  env: Record<string, string | undefined>;
  exit(code?: number): never;
  exitCode?: number;
  platform: string;
  version: string;
};

interface FetchResponse {
  ok: boolean;
  status: number;
  arrayBuffer(): Promise<ArrayBuffer>;
  json(): Promise<unknown>;
  text(): Promise<string>;
}

declare function fetch(
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
): Promise<FetchResponse>;

declare function setTimeout(callback: () => void, ms: number): unknown;
declare function clearTimeout(handle: unknown): void;
declare function atob(data: string): string;

declare module "node:child_process" {
  export interface SpawnSyncResult {
    status: number | null;
    stdout?: string;
    stderr?: string;
    error?: Error;
  }

  export function spawnSync(command: string, args?: string[], options?: Record<string, unknown>): SpawnSyncResult;
}

declare module "node:process" {
  export const stdin: unknown;
  export const stdout: unknown;
}

declare module "node:readline/promises" {
  export interface Interface {
    question(prompt: string): Promise<string>;
    close(): void;
  }

  export function createInterface(options: { input: unknown; output: unknown }): Interface;
}

declare module "node:buffer" {
  export class Buffer extends Uint8Array {
    static alloc(size: number): Buffer;
    static byteLength(value: string, encoding?: string): number;
    static concat(list: Uint8Array[]): Buffer;
    static from(value: string | number[] | Uint8Array, encoding?: string): Buffer;
    write(value: string, offset?: number, encoding?: string): number;
    writeFloatLE(value: number, offset: number): number;
    writeUInt16LE(value: number, offset: number): number;
  }
}

declare module "node:fs" {
  export interface Dirent {
    name: string;
    isDirectory(): boolean;
    isFile(): boolean;
  }

  export interface Stats {
    size: number;
    mtimeMs: number;
    isDirectory(): boolean;
    isFile(): boolean;
  }

  export function copyFileSync(src: string, dest: string): void;
  export function existsSync(path: string): boolean;
  export function mkdirSync(path: string, options?: { recursive?: boolean }): void;
  export function readFileSync(path: string, encoding: "utf8"): string;
  export function readdirSync(path: string, options: { withFileTypes: true }): Dirent[];
  export function readdirSync(path: string): string[];
  export function rmSync(path: string, options?: { recursive?: boolean; force?: boolean }): void;
  export interface StatsFs {
    /** Free blocks available to an unprivileged user. */
    bavail: number | bigint;
    bfree: number | bigint;
    blocks: number | bigint;
    bsize: number | bigint;
  }

  export function statSync(path: string): Stats;
  export function statfsSync(path: string): StatsFs;
  export function writeFileSync(path: string, data: string | Uint8Array): void;
}

declare module "node:os" {
  export interface CpuInfo {
    model: string;
    speed: number;
  }

  export function cpus(): CpuInfo[];
  export function tmpdir(): string;
  export function totalmem(): number;
}

declare module "node:path" {
  export function basename(path: string, ext?: string): string;
  export function dirname(path: string): string;
  export function extname(path: string): string;
  export function join(...parts: string[]): string;
  export function relative(from: string, to: string): string;
  export function resolve(...parts: string[]): string;
}
