import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, lstat } from 'node:fs/promises';

export function enforcesPosixMode(platform = process.platform) {
  return platform !== 'win32';
}

export async function assertPrivateDirectory(dirPath, { errorCode = 'client_directory_must_be_private', platform = process.platform } = {}) {
  await mkdir(dirPath, { recursive: true, mode: 0o700 });
  const info = await lstat(dirPath);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error(errorCode);
  if (enforcesPosixMode(platform) && (info.mode & 0o077)) throw new Error(errorCode);
  return info;
}

export async function assertPrivateFile(filePath, { errorCode = 'unsafe_client_state', platform = process.platform } = {}) {
  const info = await lstat(filePath);
  if (!info.isFile() || info.isSymbolicLink() || info.nlink > 1) throw new Error(errorCode);
  if (enforcesPosixMode(platform) && (info.nlink !== 1 || (info.mode & 0o077))) throw new Error(errorCode);
  return info;
}

export function createProcessStopper(child, { graceMs = 2000, platform = process.platform } = {}) {
  let killTimer = null;
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (!child.pid) return;
    if (platform === 'win32') {
      try {
        const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
          stdio: 'ignore',
          windowsHide: true,
        });
        killer.on('error', () => {});
        killer.unref();
      } catch {}
      try { child.kill(); } catch {}
      return;
    }
    try { process.kill(-child.pid, 'SIGTERM'); } catch { return; }
    killTimer = setTimeout(() => {
      try { process.kill(-child.pid, 'SIGKILL'); } catch {}
    }, graceMs);
    killTimer.unref?.();
  };
  const cleanup = () => {
    if (killTimer) {
      clearTimeout(killTimer);
      killTimer = null;
    }
  };
  return { stop, cleanup };
}

export function resolvePythonExecutable(env = process.env, platform = process.platform) {
  if (env.AWC_PYTHON) return env.AWC_PYTHON;
  if (platform === 'win32') return 'python';
  return existsSync('/usr/bin/python3') ? '/usr/bin/python3' : 'python3';
}
