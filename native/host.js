// Chrome native messaging host: runs the Claude Code or Codex CLI you are logged in to, so summaries need no API key.
// Chrome starts it once per chrome.runtime.sendNativeMessage call: one request in, one reply out,
// each framed as a 4-byte little-endian length followed by UTF-8 JSON.
// Requests:
//   { type: 'ping' }  -> { ok: true, clis: { claude: version|null, codex: version|null }, models: { claude: [{ id, name, efforts }], codex: [...] } }
//   { type: 'summarize', provider, model, effort, system, prompt, schema } -> { ok: true, content } | { ok: false, kind, message }
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// ponytail: fixed cap for a stuck CLI; make it a setting if very long meetings hit it.
const TIMEOUT_MS = 10 * 60_000;

/** Error kind for the side panel from CLI output. Limit before auth: limit messages can also say "log in". */
export function errorKind(text) {
  if (/ENOENT|command not found/i.test(text)) return 'nocli';
  if (/model/i.test(text) && /not exist|not found|not supported|access|invalid/i.test(text)) return 'model';
  if (/rate.?limit|usage limit|quota|\b429\b/i.test(text)) return 'limit';
  if (/not logged in|log ?in|\/login|unauthori[sz]ed|\b401\b|credential|auth/i.test(text)) return 'auth';
  return 'retry';
}

function exec(cmd, args, input, cwd) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '', err = '';
    const timer = setTimeout(() => p.kill(), TIMEOUT_MS);
    const done = (code) => { clearTimeout(timer); resolve({ code, out, err }); };
    p.stdout.setEncoding('utf8').on('data', (d) => (out += d)); // utf8 decoder keeps Thai characters split across chunks intact
    p.stderr.setEncoding('utf8').on('data', (d) => (err += d));
    p.stdin.on('error', () => {}); // CLI missing or exited before reading stdin
    p.on('error', (e) => { err += e.message; done(-1); });
    p.on('close', done);
    p.stdin.end(input);
  });
}

// Tools, settings, hooks and MCP servers off: the model only reads the transcript it is given.
async function claude({ model, effort, system, prompt, schema }, dir) {
  const args = ['-p', '--output-format', 'json', '--tools', '', '--no-session-persistence', '--setting-sources', '', '--strict-mcp-config',
    '--system-prompt', system, '--json-schema', JSON.stringify(schema)];
  if (model) args.push('--model', model);
  if (effort) args.push('--effort', effort);
  const r = await exec('claude', args, prompt, dir);
  let j;
  try { j = JSON.parse(r.out); } catch {}
  if (!j || j.is_error) {
    const text = String(j?.result || r.err || r.out || `exit ${r.code}`);
    return { ok: false, kind: errorKind(text), message: text.slice(0, 500) };
  }
  return { ok: true, content: j.structured_output ? JSON.stringify(j.structured_output) : j.result };
}

// codex exec has no system prompt flag, so the instructions go first in the prompt.
async function codex({ model, effort, system, prompt, schema }, dir) {
  await writeFile(join(dir, 'schema.json'), JSON.stringify(schema));
  const args = ['exec', '--skip-git-repo-check', '--ephemeral', '--sandbox', 'read-only', '--output-schema', 'schema.json', '-o', 'out.txt'];
  if (model) args.push('-m', model);
  if (effort) args.push('-c', `model_reasoning_effort="${effort}"`);
  const r = await exec('codex', [...args, '-'], `${system}\n\n${prompt}`, dir);
  const content = await readFile(join(dir, 'out.txt'), 'utf8').catch(() => '');
  if (r.code !== 0 || !content.trim()) {
    const text = r.err || r.out || `exit ${r.code}`;
    return { ok: false, kind: errorKind(text), message: text.slice(-500) };
  }
  return { ok: true, content };
}

const version = async (cmd) => {
  const r = await exec(cmd, ['--version'], '', tmpdir());
  return r.code === 0 ? r.out.trim() : null;
};

// Fallback when Claude Code has no cached catalog yet: these aliases always point at the latest of each family.
const CLAUDE_MODELS = [{ id: 'fable', name: 'Fable' }, { id: 'opus', name: 'Opus' }, { id: 'sonnet', name: 'Sonnet' }, { id: 'haiku', name: 'Haiku' }];

/** Effort levels from `claude --help`, e.g. "--effort <level>  Effort level ... (low, medium, high)". */
export const claudeEfforts = (help) => help.match(/--effort\b[^(]*\(([^)]*)\)/)?.[1].split(',').map((x) => x.trim()).filter(Boolean) ?? [];

/** Models Claude Code offers this account, with versions, from the newest catalog it caches. Empty until Claude Code has run once. */
export async function claudeModels(dir = join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude'), 'cache', 'model-catalog')) {
  try {
    const files = (await readdir(dir)).filter((f) => f.endsWith('-cc.json'));
    const catalogs = await Promise.all(files.map(async (f) => JSON.parse(await readFile(join(dir, f), 'utf8'))));
    const { catalog } = catalogs.sort((a, b) => b.fetchedAt - a.fetchedAt)[0];
    return catalog.config.models.map((m) => ({ id: m.id, name: m.name || m.id, efforts: (m.thinking?.effort_options ?? []).map((o) => o.id) }));
  } catch {
    return [];
  }
}

/** Models Codex offers this account, from the list it caches after login. Empty until Codex has run once. */
export async function codexModels(file = join(process.env.CODEX_HOME || join(homedir(), '.codex'), 'models_cache.json')) {
  try {
    const { models } = JSON.parse(await readFile(file, 'utf8'));
    return models.filter((m) => m.visibility === 'list')
      .map((m) => ({ id: m.slug, name: m.display_name || m.slug, efforts: (m.supported_reasoning_levels ?? []).map((l) => l.effort) }));
  } catch {
    return [];
  }
}

export async function handle(msg) {
  if (msg?.type === 'ping') {
    const [claude, codex, claudeList, codexList] = await Promise.all([version('claude'), version('codex'), claudeModels(), codexModels()]);
    let claudeFallback = [];
    if (claude && !claudeList.length) {
      const efforts = claudeEfforts((await exec('claude', ['--help'], '', tmpdir())).out);
      claudeFallback = CLAUDE_MODELS.map((m) => ({ ...m, efforts }));
    }
    return { ok: true, clis: { claude, codex }, models: { claude: claude ? (claudeList.length ? claudeList : claudeFallback) : [], codex: codexList } };
  }
  const run = { claude, codex }[msg?.provider];
  // effort lands inside a codex -c TOML value, so only bare words get through.
  if (msg?.type !== 'summarize' || !run || !/^[a-z]*$/.test(msg.effort ?? '')) return { ok: false, kind: 'retry', message: 'bad request' };
  // Empty working folder: no project files or CLAUDE.md/AGENTS.md get pulled in.
  const dir = await mkdtemp(join(tmpdir(), 'aftercall-'));
  try {
    return await run(msg, dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export const frame = (msg) => {
  const body = Buffer.from(JSON.stringify(msg));
  const head = Buffer.alloc(4);
  head.writeUInt32LE(body.length);
  return Buffer.concat([head, body]);
};

async function readMessage() {
  let buf = Buffer.alloc(0);
  for await (const chunk of process.stdin) {
    buf = Buffer.concat([buf, chunk]);
    if (buf.length >= 4 && buf.length >= 4 + buf.readUInt32LE(0)) return JSON.parse(buf.subarray(4, 4 + buf.readUInt32LE(0)));
  }
  return null;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const reply = await handle(await readMessage()).catch((e) => ({ ok: false, kind: 'retry', message: String(e?.message ?? e) }));
  process.stdout.write(frame(reply), () => process.exit(0));
}
