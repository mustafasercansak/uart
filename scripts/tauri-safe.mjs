#!/usr/bin/env node
import { spawn } from 'node:child_process';

const args = process.argv.slice(2);
const env = { ...process.env };

// VS Code Snap on Linux can leak incompatible runtime libs into GUI app launch.
if (process.platform === 'linux') {
  const isSnapSession = Boolean(env.SNAP) || String(env.GTK_PATH || '').includes('/snap/');

  if (isSnapSession) {
    delete env.LD_LIBRARY_PATH;
    delete env.SNAP;
    delete env.SNAP_NAME;
    delete env.SNAP_REVISION;
    delete env.GTK_PATH;
    delete env.GIO_MODULE_DIR;
    delete env.GDK_PIXBUF_MODULE_FILE;
    delete env.GTK_EXE_PREFIX;
    delete env.GTK_IM_MODULE_FILE;
  }
}

const npxBin = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const child = spawn(npxBin, ['tauri', ...args], {
  stdio: 'inherit',
  env,
  shell: process.platform === 'win32',
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});

child.on('error', (error) => {
  console.error(error.message);
  process.exit(1);
});
