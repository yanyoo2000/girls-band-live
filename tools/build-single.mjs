/**
 * 单文件构建（tech-spec §10.2；零依赖）。
 *
 * 读取 Vite 产物 `dist/index.html`，把 CSS 与 module script 内联，
 * 写出：
 * - `dist/girls-band-live.html`
 * - 仓库根 `index.html`（与前者字节一致）
 *
 * 不改任何源文件；不联网。
 */
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** 读取 package.json 版本号（缺失时回落 0.0.0）。 */
function readVersion() {
  try {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
    return typeof pkg.version === 'string' ? pkg.version : '0.0.0';
  } catch {
    return '0.0.0';
  }
}

/** 把 HTML 里的 `href/src` 相对路径解析成 dist 内的绝对路径。 */
function assetPath(distDir, raw) {
  const cleaned = raw.replace(/^\.?\//, '').replace(/^file:\/\//, '');
  return resolve(distDir, cleaned);
}

function escapeScript(source) {
  return source.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');
}

function escapeStyle(source) {
  return source.replace(/<\/style/gi, '<\\/style');
}

/**
 * 执行单文件内联。
 * @param {string} [rootDir] 仓库根目录。
 * @returns {{ bytes: number, sha256: string, htmlPath: string, rootIndexPath: string }}
 */
export function buildSingle(rootDir = ROOT) {
  const distDir = join(rootDir, 'dist');
  const inputPath = join(distDir, 'index.html');
  let html = readFileSync(inputPath, 'utf8');
  const version = readVersion();

  // 1) 去掉 modulepreload / preload（内联后不再需要）。
  html = html.replace(/<link\b[^>]*\brel=["'](?:modulepreload|preload)["'][^>]*>/gi, '');

  // 2) 内联样式表。
  html = html.replace(/<link\b[^>]*\brel=["']stylesheet["'][^>]*>/gi, (tag) => {
    const href = /\bhref=["']([^"']+)["']/i.exec(tag);
    if (href === null) return '';
    const css = readFileSync(assetPath(distDir, href[1]), 'utf8');
    return `<style>\n${escapeStyle(css)}\n</style>`;
  });

  // 3) 内联 module script（Vite 单入口只会有一个）。
  let inlinedScripts = 0;
  html = html.replace(/<script\b([^>]*)\bsrc=["']([^"']+)["']([^>]*)>\s*<\/script>/gi, (_tag, _pre, src) => {
    const js = readFileSync(assetPath(distDir, src), 'utf8');
    inlinedScripts += 1;
    return `<script type="module">\n${escapeScript(js)}\n</script>`;
  });
  if (inlinedScripts !== 1) {
    throw new Error(`build-single: 期望恰好内联 1 个 module script，实际 ${inlinedScripts} 个`);
  }

  // 4) 去掉残余 crossorigin（内联后无意义）。
  html = html.replace(/\s+crossorigin(?:=["'][^"']*["'])?/gi, '');

  // 5) module script 统一放到 </body> 前（React 挂载点先于脚本，便于 file:// 首屏）。
  const inlineModule = /<script type="module">[\s\S]*?<\/script>/.exec(html);
  if (inlineModule !== null) {
    html = html.replace(inlineModule[0], () => '');
    html = html.replace('</body>', () => `${inlineModule[0]}\n  </body>`);
  }

  // 6) 版本标记（可重复构建：只写版本，不写时间戳）。
  const marker = `<!-- girls-band-live v${version} build:inline -->`;
  if (!html.includes(marker)) {
    html = html.replace(/<head(\s[^>]*)?>/i, (tag) => `${tag}\n    ${marker}`);
  }

  const htmlPath = join(distDir, 'girls-band-live.html');
  const rootIndexPath = join(rootDir, 'index.html');
  writeFileSync(htmlPath, html, 'utf8');
  writeFileSync(rootIndexPath, html, 'utf8');

  const bytes = Buffer.byteLength(html, 'utf8');
  const sha256 = createHash('sha256').update(html, 'utf8').digest('hex');
  const sizeKib = (bytes / 1024).toFixed(1);
  console.log(`build-single: dist/girls-band-live.html ${sizeKib} KiB (sha256 ${sha256.slice(0, 12)})`);
  console.log(`build-single: 根 index.html 同步写入（${statSync(rootIndexPath).size} bytes）`);
  return { bytes, sha256, htmlPath, rootIndexPath };
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    buildSingle();
  } catch (error) {
    console.error(`build-single: FAILED ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
