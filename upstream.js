import { existsSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const DEFAULT_UPSTREAM = fileURLToPath(new URL('./vendor/gods-eye-view', import.meta.url));

function defaultNodePath() {
  const versions = join(homedir(), '.nvm', 'versions', 'node');
  if (existsSync(versions)) {
    const compatible = readdirSync(versions)
      .filter((name) => /^v24\.\d+\.\d+$/.test(name))
      .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
    const latest = compatible.at(-1);
    if (latest) {
      const executable = join(versions, latest, 'bin', 'node');
      if (existsSync(executable)) return executable;
    }
  }
  return 'node';
}

/** Own only the upstream process spawned here; never kill a user's server. */
export function createUpstreamManager(ctx, config = {}) {
  const directory = resolve(config.upstreamDir || DEFAULT_UPSTREAM);
  const port = Math.min(65535, Math.max(1024, Number(config.port) || 4173));
  const url = `http://127.0.0.1:${port}/`;
  const nodePath = config.nodePath || defaultNodePath();
  let child = null;
  let owned = false;
  let disposed = false;
  let startPromise = null;
  let state = { status: 'starting', url, message: '正在检查 God’s Eye View 服务…' };

  async function probe() {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2500), redirect: 'error' });
      if (!response.ok) return false;
      const text = await response.text();
      return text.includes("God's Eye View");
    } catch {
      return false;
    }
  }

  async function start() {
    if (disposed) return;
    if (await probe()) {
      state = { status: 'ready', url, managed: false, message: 'God’s Eye View 已就绪' };
      return;
    }
    if (!existsSync(join(directory, 'package.json')) || !existsSync(join(directory, 'node_modules', 'vite', 'bin', 'vite.js'))) {
      state = {
        status: 'error', url,
        message: `原项目或依赖未安装：${directory}。请先执行 npm ci。`,
      };
      return;
    }
    try {
      const executable = await ctx.subprocess.resolveExecutable(nodePath, undefined, AbortSignal.timeout(5000));
      const versionResult = spawnSync(executable, ['--version'], { encoding: 'utf8', timeout: 5000 });
      const version = versionResult.stdout?.trim() || versionResult.stderr?.trim() || '';
      if (!/^v(?:24|26)\./.test(version)) {
        throw new Error(`God’s Eye View 需要 Node.js 24.x 或 26.x，当前为 ${version || '未知版本'}。请通过 nodePath 配置兼容版本。`);
      }
      const environment = {
        ...process.env,
        PATH: `${dirname(executable)}:${process.env.PATH || ''}`,
        HOST: '127.0.0.1',
        PORT: String(port),
        GEV_ALLOWED_HOSTS: '127.0.0.1,localhost',
        GEV_EMBED_FRAME_ANCESTORS: ctx.webServer.getOrigin(),
      };
      child = ctx.subprocess.spawn({
        argv: [executable, join(directory, 'node_modules', 'vite', 'bin', 'vite.js'), '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
        cwd: directory,
        env: environment,
        stdio: { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' },
        graceMs: 5000,
      });
      owned = true;
      state = { status: 'starting', url, managed: true, message: '正在启动 God’s Eye View…' };
      child.done.then((outcome) => {
        if (disposed) return;
        state = {
          status: 'error', url, managed: true,
          message: `God’s Eye View 已退出（code=${outcome.exitCode ?? 'null'}, signal=${outcome.signal ?? 'null'}）。请检查端口和启动日志。`,
        };
      }, (error) => {
        if (!disposed) state = { status: 'error', url, managed: true, message: String(error) };
      });
      const deadline = Date.now() + 60000;
      while (!disposed && Date.now() < deadline) {
        if (await probe()) {
          state = { status: 'ready', url, managed: true, message: 'God’s Eye View 已就绪' };
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 400));
      }
      if (!disposed) {
        state = { status: 'error', url, managed: true, message: 'God’s Eye View 启动超时。请检查 4173 端口、依赖和启动日志。' };
      }
    } catch (error) {
      state = {
        status: 'error', url,
        message: `无法启动 God’s Eye View：${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  startPromise = start();
  ctx.effect(() => async () => {
    disposed = true;
    await startPromise?.catch(() => {});
    if (child && owned) {
      child.terminate();
      await child.waitForExit(AbortSignal.timeout(5000));
    }
  }, 'gods-eye-panel: upstream process');

  return {
    getState: () => state,
    start: () => {
      if (!startPromise || state.status === 'error') startPromise = start();
      return startPromise;
    },
  };
}
