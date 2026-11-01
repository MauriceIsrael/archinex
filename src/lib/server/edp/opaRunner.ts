import { spawn, spawnSync } from 'node:child_process';
import { existsSync, writeFileSync, unlinkSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

export type OpaRunnerStatus = 'pass' | 'fail' | 'unavailable' | 'runner_error';

export interface OpaExecResult<T = unknown> {
  status: OpaRunnerStatus;
  exitCode: number | null;
  output?: T;
  rawOutput: string;
  error?: string;
  opaVersion?: string;
  durationMs: number;
}

export interface OpaVersionInfo {
  available: boolean;
  version?: string;
  regoV1: boolean;
  raw: string;
  error?: string;
}

export interface OpaTestOptions {
  policyFiles: string[];
  dataFiles?: string[];
  timeoutMs?: number;
  opaPath?: string;
}

export interface OpaEvalOptions {
  query: string;
  input?: unknown;
  data?: unknown;
  policyFiles?: string[];
  timeoutMs?: number;
  opaPath?: string;
}

const DEFAULT_TIMEOUT_MS = 10000;

/**
 * Résout le chemin du binaire OPA selon la priorité :
 * 1. Paramètre explicite
 * 2. Variable d'environnement OPA_PATH
 * 3. Binaire local sous tools/bin/opa (ou .exe sous Windows)
 * 4. Binaire global disponible dans le PATH
 */
export function resolveOpaBinary(customPath?: string): string | null {
  if (customPath !== undefined) {
    return existsSync(customPath) ? customPath : null;
  }

  if (process.env.OPA_PATH) {
    return existsSync(process.env.OPA_PATH) ? process.env.OPA_PATH : null;
  }

  const isWin = process.platform === 'win32';
  const localBin = resolve(process.cwd(), 'tools/bin', isWin ? 'opa.exe' : 'opa');
  if (existsSync(localBin)) {
    return localBin;
  }

  // 4. Binaire global disponible dans le PATH
  try {
    const cmd = isWin ? 'opa.exe' : 'opa';
    const check = spawnSync(cmd, ['version'], { stdio: 'ignore' });
    if (check.status === 0) {
      return cmd;
    }
  } catch {
    // Absent du PATH
  }

  return null;
}

/**
 * Exécute une commande OPA avec délai maximal et capture déterministe.
 */
function execOpaProcess(
  binPath: string,
  args: string[],
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
  stdinContent?: string
): Promise<{ exitCode: number | null; stdout: string; stderr: string; timedOut: boolean }> {
  return new Promise((resolvePromise) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;

    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(binPath, args, {
        env: { ...process.env, OPA_CHECK_VERSION: 'false' },
        stdio: ['pipe', 'pipe', 'pipe']
      });
    } catch (err: any) {
      return resolvePromise({
        exitCode: null,
        stdout: '',
        stderr: err?.message || 'Failed to spawn process',
        timedOut: false
      });
    }

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      setTimeout(() => {
        if (!child.killed) child.kill('SIGKILL');
      }, 500);
    }, timeoutMs);

    if (stdinContent && child.stdin) {
      child.stdin.write(stdinContent);
      child.stdin.end();
    }

    child.stdout?.on('data', (data) => {
      stdout += data.toString('utf-8');
    });

    child.stderr?.on('data', (data) => {
      stderr += data.toString('utf-8');
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      resolvePromise({
        exitCode: null,
        stdout,
        stderr: stderr || err.message,
        timedOut
      });
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      resolvePromise({
        exitCode: code,
        stdout,
        stderr,
        timedOut
      });
    });
  });
}

/**
 * Vérifie la version et la disponibilité d'OPA (Issue #171).
 */
export async function checkOpaVersion(customPath?: string): Promise<OpaVersionInfo> {
  const bin = resolveOpaBinary(customPath);
  if (!bin) {
    return {
      available: false,
      regoV1: false,
      raw: '',
      error: 'Binaire OPA introuvable (recherché dans tools/bin/opa, OPA_PATH et PATH).'
    };
  }

  const res = await execOpaProcess(bin, ['version'], 3000);
  if (res.exitCode !== 0 || res.timedOut) {
    return {
      available: false,
      regoV1: false,
      raw: res.stdout + res.stderr,
      error: `Échec d'exécution de 'opa version' (code ${res.exitCode}) : ${res.stderr}`
    };
  }

  const raw = res.stdout;
  const versionMatch = raw.match(/Version:\s*([0-9.]+)/i);
  const regoV1 = /Rego Version:\s*v1/i.test(raw);

  return {
    available: true,
    version: versionMatch ? versionMatch[1] : undefined,
    regoV1,
    raw
  };
}

/**
 * Exécute `opa test` sur les fichiers de politique et de données (Issue #171).
 * « Indisponible » n'est JAMAIS « conforme » (pass).
 */
export async function runOpaTest(options: OpaTestOptions): Promise<OpaExecResult<unknown[]>> {
  const start = Date.now();
  const bin = resolveOpaBinary(options.opaPath);

  if (!bin) {
    return {
      status: 'unavailable',
      exitCode: null,
      rawOutput: '',
      error: 'Binaire OPA indisponible : impossible d’exécuter les tests Rego.',
      durationMs: Date.now() - start
    };
  }

  const args = ['test', '--format=json', ...options.policyFiles];
  if (options.dataFiles && options.dataFiles.length > 0) {
    args.push(...options.dataFiles);
  }

  const timeout = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const res = await execOpaProcess(bin, args, timeout);
  const durationMs = Date.now() - start;

  if (res.timedOut) {
    return {
      status: 'runner_error',
      exitCode: null,
      rawOutput: res.stdout,
      error: `Dépassement du délai maximal d’exécution OPA (${timeout} ms)`,
      durationMs
    };
  }

  let parsed: unknown[] | undefined;
  try {
    if (res.stdout.trim()) {
      parsed = JSON.parse(res.stdout);
    }
  } catch {
    // Si la sortie JSON est corrompue
    return {
      status: 'runner_error',
      exitCode: res.exitCode,
      rawOutput: res.stdout + '\n' + res.stderr,
      error: 'Sortie JSON OPA test invalide ou inexploitable',
      durationMs
    };
  }

  if (res.exitCode === 0) {
    return {
      status: 'pass',
      exitCode: 0,
      output: parsed,
      rawOutput: res.stdout,
      durationMs
    };
  }

  return {
    status: 'fail',
    exitCode: res.exitCode,
    output: parsed,
    rawOutput: res.stdout,
    error: res.stderr || 'Tests OPA en échec',
    durationMs
  };
}

/**
 * Exécute `opa eval` pour évaluer une requête Rego sur une entrée donnée (Issue #171).
 */
export async function runOpaEval<T = unknown>(options: OpaEvalOptions): Promise<OpaExecResult<T>> {
  const start = Date.now();
  const bin = resolveOpaBinary(options.opaPath);

  if (!bin) {
    return {
      status: 'unavailable',
      exitCode: null,
      rawOutput: '',
      error: 'Binaire OPA indisponible : évaluation impossible.',
      durationMs: Date.now() - start
    };
  }

  const tempFilesToClean: string[] = [];
  const args = ['eval', '--format=json'];

  if (options.policyFiles && options.policyFiles.length > 0) {
    for (const pf of options.policyFiles) {
      args.push('--data', pf);
    }
  }

  if (options.data !== undefined) {
    const dataPath = join(tmpdir(), `opa_data_${randomUUID()}.json`);
    writeFileSync(dataPath, JSON.stringify(options.data), 'utf-8');
    tempFilesToClean.push(dataPath);
    args.push('--data', dataPath);
  }

  let stdinContent: string | undefined;
  if (options.input !== undefined) {
    stdinContent = JSON.stringify(options.input);
    args.push('--stdin-input');
  }

  args.push(options.query);

  const timeout = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const res = await execOpaProcess(bin, args, timeout, stdinContent);
  const durationMs = Date.now() - start;

  // Nettoyage fichiers temporaires
  for (const f of tempFilesToClean) {
    try {
      unlinkSync(f);
    } catch {
      // Ignorer
    }
  }

  if (res.timedOut) {
    return {
      status: 'runner_error',
      exitCode: null,
      rawOutput: res.stdout,
      error: `Dépassement du délai maximal d’évaluation OPA (${timeout} ms)`,
      durationMs
    };
  }

  if (res.exitCode !== 0) {
    return {
      status: 'runner_error',
      exitCode: res.exitCode,
      rawOutput: res.stdout + '\n' + res.stderr,
      error: res.stderr || `Erreur d’évaluation OPA (code ${res.exitCode})`,
      durationMs
    };
  }

  try {
    const json = JSON.parse(res.stdout);
    const value = json.result?.[0]?.expressions?.[0]?.value as T;
    return {
      status: 'pass',
      exitCode: 0,
      output: value,
      rawOutput: res.stdout,
      durationMs
    };
  } catch (err: any) {
    return {
      status: 'runner_error',
      exitCode: res.exitCode,
      rawOutput: res.stdout,
      error: `Format de réponse JSON OPA inattendu : ${err.message}`,
      durationMs
    };
  }
}
