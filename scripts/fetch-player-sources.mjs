/**
 * 下载玩家角色用到的三个 Quaternius 包到 assets/_src/player/（不入库）并解压。
 *
 *   node scripts/fetch-player-sources.mjs [--only=关键字] [--out=目录]
 *
 * 三个都是 CC0，都是 itch.io 上的「免费版 Standard」。itch 的免费下载不是直链：
 * 页面上的 csrf_token → POST download_url 拿到带时效的下载页 → 页面里找文件的 upload_id
 * → POST file/<id> 拿到签名的 CDN 地址。浏览器里点「No thanks, just take me to the downloads」
 * 走的就是这一串。
 *
 * 为什么要留这个脚本：assets/player/ 里是加工过的，没有这份「从哪来、原件是哪个」的记录，
 * CC0 的出处链就断了。压缩包已经在的话不重复下载（三个加起来四百多 MB）。
 * 解压用系统的 tar（Windows 10 起自带，能解 zip）。
 */
import { mkdir, writeFile, access } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = k => (process.argv.find(a => a.startsWith(`--${k}=`)) || '').slice(k.length + 3);
const out = arg('out') ? resolve(arg('out')) : resolve(root, 'assets', '_src', 'player');

// [itch 页面, 要的文件名]
export const SOURCES = [
  ['https://quaternius.itch.io/universal-base-characters', 'Universal Base Characters[Standard].zip'],
  ['https://quaternius.itch.io/modular-character-outfits-fantasy', 'Modular Character Outfits - Fantasy[Standard].zip'],
  ['https://quaternius.itch.io/universal-animation-library', 'Universal Animation Library[Standard].zip'],
];

// itch 对 Node fetch 默认的 UA 直接回 429，同样的请求 curl 能过 —— 带一个普通浏览器的 UA
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

function cookieJar() {
  const jar = new Map();
  return {
    take(res) { for (const c of res.headers.getSetCookie()) { const [kv] = c.split(';'); const i = kv.indexOf('='); jar.set(kv.slice(0, i), kv.slice(i + 1)); } },
    header() { return [...jar].map(([k, v]) => `${k}=${v}`).join('; '); },
  };
}

async function itchDownload(page, wanted, target) {
  const jar = cookieJar();
  const get = async url => { const r = await fetch(url, { headers: { cookie: jar.header(), 'user-agent': UA } }); jar.take(r); if (!r.ok) throw new Error(`${url} -> HTTP ${r.status}`); return r.text(); };
  const post = async (url, csrf) => {
    const r = await fetch(url, { method: 'POST', headers: { cookie: jar.header(), 'user-agent': UA, 'content-type': 'application/x-www-form-urlencoded' }, body: 'csrf_token=' + encodeURIComponent(csrf) });
    jar.take(r); if (!r.ok) throw new Error(`${url} -> HTTP ${r.status}`); return r.json();
  };
  const csrfOf = html => (html.match(/name="csrf_token" value="([^"]+)"/) || [])[1];

  const csrf = csrfOf(await get(page));
  if (!csrf) throw new Error(`${page}: 页面上没找到 csrf_token，itch 可能改版了`);
  const { url: downloadPage } = await post(page + '/download_url', csrf);
  if (!downloadPage) throw new Error(`${page}: 没拿到下载页`);
  const html = await get(downloadPage);
  const key = decodeURIComponent(downloadPage.split('/download/')[1]);
  const uploads = [...html.matchAll(/data-upload_id="(\d+)"[\s\S]*?class="name"[^>]*>([^<]+)</g)].map(m => ({ id: m[1], name: m[2].trim() }));
  const upload = uploads.find(u => u.name === wanted);
  if (!upload) throw new Error(`${page}: 下载页里没有 ${wanted}（有：${uploads.map(u => u.name).join(', ')}）`);
  const { url } = await post(`${page}/file/${upload.id}?source=game_download&key=${encodeURIComponent(key)}`, csrfOf(html) || csrf);
  if (!url) throw new Error(`${page}: 没拿到 ${wanted} 的签名地址`);
  const res = await fetch(url, { headers: { 'user-agent': UA } });
  if (!res.ok) throw new Error(`${wanted}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.subarray(0, 2).toString() !== 'PK') throw new Error(`${wanted}: 不是 zip`);
  await writeFile(target, buf);
  return buf.length;
}

await mkdir(out, { recursive: true });
for (const [page, name] of SOURCES.filter(([, n]) => !arg('only') || n.includes(arg('only')))) {
  const zip = resolve(out, name);
  const have = await access(zip).then(() => true, () => false);
  if (have) console.log(`已有  ${name}`);
  else {
    try {
      console.log(`下载  ${name}  ${(await itchDownload(page, name, zip) / 1048576).toFixed(1)}MB  ${page}`);
    } catch (error) {
      /* 2026-09-13 实测：itch 会限流（HTTP 429），而且 Node 这边最后一步 file/<id> 一直回
         {"errors":["invalid key"]}，同一串请求用 curl 当时是通的，原因没查清。
         自动下载不稳，所以失败时告诉人怎么手动下，下好放进来再跑一遍就只剩解压。 */
      console.error(`\n自动下载 ${name} 失败：${error.message}\n`
        + `请手动下载：打开 ${page} → Download Now → 「No thanks, just take me to the downloads」→ 下载 ${name}\n`
        + `放到 ${out}\\ 下（文件名保持原样），再跑一遍这个脚本。`);
      process.exitCode = 1;
      continue;
    }
  }
  // Git Bash 里 PATH 上的 tar 是 GNU tar，解不了 zip；Windows 自带的 bsdtar 可以
  const tar = process.platform === 'win32' ? resolve(process.env.SystemRoot || 'C:/Windows', 'System32', 'tar.exe') : 'tar';
  execFileSync(tar, ['-xf', zip, '-C', out], { stdio: 'inherit' });
}
console.log(`\n原件在 ${out}\n下一步：node scripts/prepare-player-assets.mjs`);
