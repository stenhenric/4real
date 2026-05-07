import { spawnSync } from 'node:child_process';
import { statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const REQUIRED_AUTH_SESSION_FIX_GIT_SHA = '5f35940';

export interface BuildInfo {
  gitSha: string;
  builtAt: string;
  startedAt: string;
  authSessionFix: {
    requiredGitSha: string;
    isPresent: boolean | null;
  };
}

const startedAt = new Date().toISOString();
let cachedBuildInfo: BuildInfo | null = null;

function runGit(args: string[]): { status: number | null; stdout: string } | null {
  const result = spawnSync('git', args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });

  if (result.error) {
    return null;
  }

  return {
    status: result.status,
    stdout: result.stdout.trim(),
  };
}

function normalizeTimestamp(value: string | undefined): string | null {
  if (!value || value.trim().length === 0) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function detectGitSha(): string {
  const envSha = process.env.APP_GIT_SHA?.trim() || process.env.BUILD_GIT_SHA?.trim();
  if (envSha) {
    return envSha;
  }

  const gitResult = runGit(['rev-parse', 'HEAD']);
  if (gitResult?.status === 0 && gitResult.stdout.length > 0) {
    return gitResult.stdout;
  }

  return 'unknown';
}

function detectBuiltAt(): string {
  const envBuiltAt = normalizeTimestamp(process.env.APP_BUILD_TIMESTAMP ?? process.env.BUILD_TIMESTAMP);
  if (envBuiltAt) {
    return envBuiltAt;
  }

  try {
    return statSync(fileURLToPath(import.meta.url)).mtime.toISOString();
  } catch {
    return startedAt;
  }
}

function detectAuthSessionFixPresence(gitSha: string): boolean | null {
  if (
    gitSha === REQUIRED_AUTH_SESSION_FIX_GIT_SHA
    || (gitSha.length >= REQUIRED_AUTH_SESSION_FIX_GIT_SHA.length && gitSha.startsWith(REQUIRED_AUTH_SESSION_FIX_GIT_SHA))
  ) {
    return true;
  }

  const gitResult = runGit(['merge-base', '--is-ancestor', REQUIRED_AUTH_SESSION_FIX_GIT_SHA, 'HEAD']);
  if (!gitResult || gitResult.status === null) {
    return null;
  }

  if (gitResult.status === 0) {
    return true;
  }

  if (gitResult.status === 1) {
    return false;
  }

  return null;
}

export function getBuildInfo(): BuildInfo {
  if (cachedBuildInfo) {
    return cachedBuildInfo;
  }

  const gitSha = detectGitSha();
  cachedBuildInfo = {
    gitSha,
    builtAt: detectBuiltAt(),
    startedAt,
    authSessionFix: {
      requiredGitSha: REQUIRED_AUTH_SESSION_FIX_GIT_SHA,
      isPresent: detectAuthSessionFixPresence(gitSha),
    },
  };

  return cachedBuildInfo;
}

export function resetBuildInfoForTests(): void {
  cachedBuildInfo = null;
}
