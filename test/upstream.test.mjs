import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createUpstreamManager } from '../upstream.js';

function context(spawn) {
  const effects = [];
  return {
    effects,
    ctx: {
      webServer: { getOrigin: () => 'http://127.0.0.1:63666' },
      subprocess: {
        resolveExecutable: async () => process.execPath,
        spawn,
      },
      effect(callback) { effects.push(callback()); return () => {}; },
    },
  };
}

async function settle(manager) {
  for (let index = 0; index < 20; index += 1) {
    if (manager.getState().status !== 'starting') return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

test('an existing upstream is reused without spawning or killing a user process', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('<title>God\'s Eye View</title>', { status: 200 });
  let spawnCalls = 0;
  const { ctx, effects } = context(() => { spawnCalls += 1; throw new Error('must not spawn'); });
  try {
    const manager = createUpstreamManager(ctx, {});
    await settle(manager);
    assert.equal(manager.getState().status, 'ready');
    assert.equal(manager.getState().managed, false);
    assert.equal(spawnCalls, 0);
    for (const dispose of effects) await dispose();
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('missing checkout or dependencies produces an actionable error', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('connection refused'); };
  const directory = await mkdtemp(join(tmpdir(), 'gev-missing-'));
  const { ctx } = context(() => { throw new Error('must not spawn'); });
  try {
    const manager = createUpstreamManager(ctx, { upstreamDir: directory });
    await settle(manager);
    assert.equal(manager.getState().status, 'error');
    assert.match(manager.getState().message, /npm ci/);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(directory, { recursive: true, force: true });
  }
});

test('a managed upstream is spawned with DSH origin and terminated on unload', async () => {
  const originalFetch = globalThis.fetch;
  let probeCalls = 0;
  globalThis.fetch = async () => {
    probeCalls += 1;
    if (probeCalls === 1) throw new Error('connection refused');
    return new Response('<title>God\'s Eye View</title>', { status: 200 });
  };
  const directory = await mkdtemp(join(tmpdir(), 'gev-managed-'));
  await mkdir(join(directory, 'node_modules', 'vite', 'bin'), { recursive: true });
  await writeFile(join(directory, 'package.json'), '{"name":"fixture"}');
  await writeFile(join(directory, 'node_modules', 'vite', 'bin', 'vite.js'), '// fixture');
  let killed = false;
  const child = {
    done: new Promise(() => {}),
    terminate() { killed = true; },
    async waitForExit() { return true; },
  };
  const { ctx, effects } = context((spec) => {
    assert.equal(spec.cwd, directory);
    assert.equal(spec.env.GEV_EMBED_FRAME_ANCESTORS, 'http://127.0.0.1:63666');
    assert.equal(spec.env.GEV_ALLOWED_HOSTS, '127.0.0.1,localhost');
    return child;
  });
  try {
    const manager = createUpstreamManager(ctx, { upstreamDir: directory, nodePath: process.execPath });
    await settle(manager);
    assert.equal(manager.getState().status, 'ready');
    assert.equal(manager.getState().managed, true);
    assert.equal(effects.length, 1);
    for (const dispose of effects) await dispose();
    assert.equal(killed, true);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(directory, { recursive: true, force: true });
  }
});
