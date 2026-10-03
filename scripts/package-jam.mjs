import { build } from 'vite';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';
import { lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = join(root, 'artifacts/gamejam');
const web = join(output, 'web');
const ownerFile = join(output, '.package-jam-owner.json');
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const zipName = `plumjam-web-${pkg.version}.zip`;
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const exists = async (path) => { try { await lstat(path); return true; } catch (e) { if (e.code === 'ENOENT') return false; throw e; } };
async function filesIn(directory) {
  const result = [];
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Refusing symbolic link: ${path}`);
    if (entry.isDirectory()) result.push(...await filesIn(path));
    else if (entry.isFile()) result.push(path);
    else throw new Error(`Unsupported file: ${path}`);
  }
  return result;
}
async function hashes(directory) {
  return Object.fromEntries(await Promise.all((await filesIn(directory)).map(async (path) => [relative(directory, path).replaceAll('\\', '/'), sha(await readFile(path))])));
}
async function sources() {
  const paths = ['src', 'public', 'index.html', 'vite.config.ts', 'package.json', 'package-lock.json', 'scripts/package-jam.mjs'];
  const entries = [];
  for (const input of paths) {
    const path = join(root, input);
    for (const file of (await lstat(path)).isDirectory() ? await filesIn(path) : [path]) entries.push([relative(root, file).replaceAll('\\', '/'), sha(await readFile(file))]);
  }
  entries.sort(([a], [b]) => a.localeCompare(b));
  return Object.fromEntries(entries);
}
// Only outputs from an intact earlier package may be replaced. Unrelated files are left alone.
async function validatePrevious() {
  const hasWeb = await exists(web), hasZip = await exists(join(output, zipName));
  if (!await exists(ownerFile)) {
    if (hasWeb || hasZip) throw new Error('Existing output has no ownership record; move it aside before packaging.');
    return;
  }
  const previous = JSON.parse(await readFile(ownerFile, 'utf8'));
  if (previous.schema !== 1 || !previous.files || typeof previous.files !== 'object') throw new Error('Invalid package ownership record.');
  const actual = hasWeb ? Object.fromEntries(Object.entries(await hashes(web)).map(([path, hash]) => [`web/${path}`, hash])) : {};
  if (hasZip) actual[zipName] = sha(await readFile(join(output, zipName)));
  if (Object.keys(previous.files).some((path) => !(path.startsWith('web/') && !path.split('/').includes('..') || path === zipName))) throw new Error('Unexpected owned output path.');
  if (JSON.stringify(Object.entries(actual).sort()) !== JSON.stringify(Object.entries(previous.files).sort())) throw new Error('Previous outputs were changed; move them aside before packaging.');
}

for (const path of [join(root, 'artifacts'), output]) {
  if (await exists(path) && (await lstat(path)).isSymbolicLink()) throw new Error(`Refusing symbolic output directory: ${path}`);
}
await mkdir(output, { recursive: true });
execFileSync('python3', ['--version'], { stdio: 'ignore' });
await validatePrevious();
const sourceFiles = await sources();
const sourceHash = sha(JSON.stringify(sourceFiles));
const distBefore = await exists(join(root, 'dist')) ? await hashes(join(root, 'dist')) : null;
const staging = await mkdtemp(join(output, '.stage-'));
try {
  const stagedWeb = join(staging, 'web');
  await build({ root, base: './', build: { outDir: stagedWeb, emptyOutDir: false } });
  await writeFile(join(stagedWeb, 'PLAY_README.txt'), `인간의 마지막 출근 — PLUMJAM 팀\nPC 키보드와 마우스로 플레이합니다.\n\nindex.html을 file://로 직접 열지 말고 HTTP로 실행하세요.\nZIP을 풀고 그 폴더에서:\n  python3 -m http.server 4174 --bind 127.0.0.1\n브라우저: http://127.0.0.1:4174/\n종료: 터미널 Ctrl+C\n\n게임 내 '플레이 방법'과 '크레딧'을 확인하세요.\n저장은 브라우저와 사이트 주소별로 유지됩니다.\nCREDITS.md / THIRD_PARTY_LICENSES.txt / assets/music/CREDITS.md 동봉.\n`);
  if (sha(JSON.stringify(await sources())) !== sourceHash) throw new Error('Build inputs changed during packaging; retry after source freeze.');
  const distAfter = await exists(join(root, 'dist')) ? await hashes(join(root, 'dist')) : null;
  if (JSON.stringify(distBefore) !== JSON.stringify(distAfter)) throw new Error('Normal dist changed during packaging.');
  const manifest = { schema: 1, game: pkg.name, version: pkg.version, builtAt: new Date().toISOString(), base: './', gitHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), sourceHash, sourceFiles, files: await hashes(stagedWeb) };
  await writeFile(join(stagedWeb, 'BUILD_MANIFEST.json'), JSON.stringify(manifest, null, 2) + '\n');
  // Archive at the root, then verify every entry/hash against the copied build.
  execFileSync('python3', ['-c', `import hashlib,json,pathlib,sys,zipfile
web=pathlib.Path(sys.argv[1]); target=pathlib.Path(sys.argv[2])
paths=sorted(p for p in web.rglob('*') if p.is_file())
with zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED) as z:
 for p in paths: z.write(p,p.relative_to(web).as_posix())
with zipfile.ZipFile(target) as z:
 assert z.testzip() is None
 assert 'index.html' in z.namelist() and 'CREDITS.md' in z.namelist()
 assert set(z.namelist()) == {p.relative_to(web).as_posix() for p in paths}
 m=json.loads(z.read('BUILD_MANIFEST.json'))
 assert set(z.namelist()) == set(m['files']) | {'BUILD_MANIFEST.json'}
 for name,digest in m['files'].items(): assert hashlib.sha256(z.read(name)).hexdigest()==digest,name
`, stagedWeb, join(staging, zipName)], { stdio: 'inherit' });
  await validatePrevious();
  if (await exists(web)) await rm(web, { recursive: true });
  if (await exists(join(output, zipName))) await rm(join(output, zipName));
  await rename(stagedWeb, web);
  await rename(join(staging, zipName), join(output, zipName));
  const owned = Object.fromEntries(Object.entries(await hashes(web)).map(([path, hash]) => [`web/${path}`, hash]));
  owned[zipName] = sha(await readFile(join(output, zipName)));
  await writeFile(ownerFile, JSON.stringify({ schema: 1, files: owned }, null, 2) + '\n');
  console.log(`\nPortable web: ${web}\nBackup ZIP: ${join(output, zipName)}\nSource SHA-256: ${sourceHash}\nVerified root ZIP entries, file hashes, source freeze, and unchanged normal dist.`);
} finally { await rm(staging, { recursive: true, force: true }); }
