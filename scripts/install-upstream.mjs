import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const VENDOR = join(ROOT, 'vendor', 'gods-eye-view');
const REPOSITORY = 'https://github.com/bilawalsidhu/gods-eye-view.git';
const COMMIT = 'c0a5d4141d4fa6f7648910cedd98654f2381989d';

function run(command, args, options = {}) {
  console.log(`> ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, {
    cwd: options.cwd || ROOT,
    env: options.env || process.env,
    stdio: 'inherit',
    timeout: options.timeout || 10 * 60 * 1000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with status ${result.status}`);
}

function nodeVersion(executable) {
  const result = spawnSync(executable, ['--version'], { encoding: 'utf8', timeout: 5000 });
  return result.stdout?.trim() || '';
}

function compatibleNode() {
  if (/^v(?:24|26)\./.test(nodeVersion(process.execPath))) return process.execPath;
  const versions = join(homedir(), '.nvm', 'versions', 'node');
  if (existsSync(versions)) {
    const candidates = readdirSync(versions)
      .filter((name) => /^v(?:24|26)\.\d+\.\d+$/.test(name))
      .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
    for (const name of candidates.reverse()) {
      const executable = join(versions, name, 'bin', 'node');
      if (existsSync(executable) && /^v(?:24|26)\./.test(nodeVersion(executable))) return executable;
    }
  }
  if (/^v(?:24|26)\./.test(nodeVersion('node'))) return 'node';
  throw new Error('God’s Eye View requires Node.js 24.x or 26.x. Install it with `nvm install 24`, then rerun `npm run setup`.');
}

const node = compatibleNode();
const environment = { ...process.env, PATH: `${dirname(node)}:${process.env.PATH || ''}` };
console.log(`Using ${nodeVersion(node)} for the upstream installation`);

mkdirSync(VENDOR, { recursive: true });
if (!existsSync(join(VENDOR, '.git'))) {
  run('git', ['init'], { cwd: VENDOR });
  run('git', ['remote', 'add', 'origin', REPOSITORY], { cwd: VENDOR });
}
run('git', ['fetch', '--depth', '1', 'origin', COMMIT], { cwd: VENDOR });
run('git', ['reset', '--hard', COMMIT], { cwd: VENDOR });
copyFileSync(join(ROOT, 'patches', 'embed-framing.js'), join(VENDOR, 'build', 'embed-framing.js'));
copyFileSync(join(ROOT, 'patches', 'embed.js'), join(VENDOR, 'src', 'app', 'embed.js'));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
run(npm, ['ci', '--no-audit', '--no-fund'], { cwd: VENDOR, env: environment });
console.log('God’s Eye View upstream is ready in vendor/gods-eye-view.');
