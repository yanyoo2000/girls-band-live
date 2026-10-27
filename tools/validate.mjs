/**
 * 单文件校验（tech-spec §10.3；零依赖，只读）。
 *
 * 成功输出固定一行：`validate: 14/14 rules passed`。
 * 失败输出 `validate: FAILED R<n> <message>`（每条失败一行），退出码 1。
 *
 * 说明：内联后的 HTML 里同时有“标记”和“脚本正文”。R4/R5/R6/R10 只检查标记，
 * 避免把 React 内部的字符串（如 `<script>` 模板、crossOrigin 属性名）误判为真实标签；
 * R7/R8/R14 同时检查正文。
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkLayers } from './check-layers.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MAX_BYTES = 4 * 1024 * 1024;
const artifactPath = join(ROOT, 'dist', 'girls-band-live.html');
const rootIndexPath = join(ROOT, 'index.html');

/** 去掉注释（粗粒度；只用于源码扫描）。 */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/** 递归收集 src 下 .ts/.tsx。 */
function collectSources(dir, out) {
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectSources(full, out);
    } else if ((entry.endsWith('.ts') || entry.endsWith('.tsx')) && !entry.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out;
}

const failures = [];
const fail = (id, message) => {
  failures.push({ id, message });
};

if (!existsSync(artifactPath) || !existsSync(rootIndexPath)) {
  console.error('validate: FAILED R1 缺少 dist/girls-band-live.html 或根 index.html（先运行 npm run build）');
  process.exit(1);
}

const artifact = readFileSync(artifactPath, 'utf8');
const rootIndex = readFileSync(rootIndexPath, 'utf8');
const bytes = Buffer.byteLength(artifact, 'utf8');

/* 拆分标记与脚本正文（内联脚本只有一个；正文里的 </script 已在 build-single 转义） */
const moduleMatch = /<script type="module">([\s\S]*?)<\/script>/.exec(artifact);
const scriptBody = moduleMatch === null ? '' : moduleMatch[1];
const markup =
  moduleMatch === null
    ? artifact
    : artifact.replace(moduleMatch[0], () => '<script type="module"></script>');
const combined = `${markup}\n${scriptBody}`;

/* R1 存在性（已提前返回，此处仅登记空文件） */
if (statSync(artifactPath).size === 0) fail(1, 'dist/girls-band-live.html 为空');

/* R2 根 index.html 与 dist 产物字节一致 */
if (artifact !== rootIndex) fail(2, '根 index.html 与 dist/girls-band-live.html 不一致');

/* R3 体积 ≤ 4 MiB */
if (bytes > MAX_BYTES) fail(3, `体积 ${bytes} bytes 超过 4 MiB`);

/* R4 DOM 挂载点位于首个 script 之前 */
const rootMarker = /<div\b[^>]*\bid=["']root["'][^>]*>/i.exec(markup);
const firstScript = /<script\b/i.exec(markup);
if (rootMarker === null) {
  fail(4, '缺少 <div id="root">');
} else if (firstScript !== null && rootMarker.index > firstScript.index) {
  fail(4, '挂载点位于首个 <script> 之后');
}

/* R5 恰好 1 个内联 module script，且无 src */
const scriptTags = markup.match(/<script\b[^>]*>/gi) ?? [];
const moduleScripts = scriptTags.filter((tag) => /\btype=["']module["']/i.test(tag));
const scriptWithSrc = scriptTags.filter((tag) => /\bsrc\s*=/i.test(tag));
if (scriptTags.length !== 1 || moduleScripts.length !== 1 || scriptWithSrc.length > 0) {
  fail(5, `script 数量异常（总 ${scriptTags.length} / module ${moduleScripts.length} / 带 src ${scriptWithSrc.length}）`);
}

/* R6 无外链样式 / 外链 link */
if (/<link\b[^>]*\brel=["']stylesheet["']/i.test(markup)) fail(6, '仍有外链样式表');
if (/<link\b[^>]*\bhref=["'](?:https?:)?\/\//i.test(markup)) fail(6, '仍有外链 <link>');

/* R7 无外部 URL（允许 XML 命名空间；允许库内“文档引用”URL——它们只出现在注释里，不发起请求） */
const withoutExternal = combined
  .replace(/http:\/\/www\.w3\.org\/2000\/svg/g, '')
  .replace(/http:\/\/www\.w3\.org\/1999\/xlink/g, '')
  .replace(/http:\/\/www\.w3\.org\/1999\/xhtml/g, '')
  .replace(/http:\/\/www\.w3\.org\/XML\/1998\/namespace/g, '')
  .replace(/http:\/\/www\.w3\.org\/1998\/Math\/MathML/g, '')
  // React 生产构建的错误文档链接：字符串常量，不联网。
  .replace(/https:\/\/react\.dev\/errors\//g, '')
  // Three.js AgX tonemapping 的 GLSL 注释引用：只在着色器注释里，不联网。
  .replace(/https:\/\/jcgt\.org\/published\/0007\/04\/01\//g, '');
if (/https?:\/\//i.test(withoutExternal)) fail(7, '存在 http(s) 外部 URL');
if (/\/\/cdn\./i.test(withoutExternal)) fail(7, '存在 CDN 引用');

/* R8 无运行时联网 / 动态加载 */
const runtimeBans = [
  { pattern: /\bfetch\s*\(/, label: 'fetch(' },
  { pattern: /\bXMLHttpRequest\b/, label: 'XMLHttpRequest' },
  { pattern: /\bWebSocket\b/, label: 'WebSocket' },
  { pattern: /\bEventSource\b/, label: 'EventSource' },
  { pattern: /\bimport\s*\(/, label: 'dynamic import(' },
  { pattern: /\bnew\s+Worker\b/, label: 'new Worker' },
];
for (const ban of runtimeBans) {
  if (ban.pattern.test(scriptBody)) fail(8, `存在 ${ban.label}`);
}

/* R9 无外部字体 */
if (/@font-face/i.test(artifact)) fail(9, '存在 @font-face');
if (/fonts\.googleapis|\.woff2?|\.ttf|\.otf/i.test(artifact)) fail(9, '存在外部字体引用');

/* R10 无调试残留（只检查标记，避免误伤 JS 属性名） */
if (/sourceMappingURL/i.test(markup)) fail(10, '存在 sourceMappingURL');
if (/\bcrossorigin\b/i.test(markup)) fail(10, '存在 crossorigin 残留');
if (/\bintegrity\s*=/i.test(markup)) fail(10, '存在 integrity 属性');

/* R11 版本标记与产品名 */
if (!/girls-band-live/.test(artifact)) fail(11, '缺少 girls-band-live 标识');
if (!/build:inline/.test(artifact)) fail(11, '缺少构建标记（build:inline）');

/* R12 分层检查 */
const layers = checkLayers(ROOT);
for (const violation of layers.violations) {
  fail(12, `${violation.file} [${violation.rule}] ${violation.detail}`);
}
for (const cycle of layers.cycles) {
  fail(12, `循环 import：${cycle.join(' -> ')}`);
}

/* R13 确定性 / 分层源码扫描 */
const sources = [];
for (const dir of ['game', 'ui']) {
  const target = join(ROOT, 'src', dir);
  if (existsSync(target)) collectSources(target, sources);
}
for (const file of sources) {
  const rel = relative(ROOT, file).replace(/\\/g, '/');
  const source = stripComments(readFileSync(file, 'utf8'));
  if (rel.startsWith('src/game/')) {
    if (/\bMath\.random\s*\(/.test(source)) fail(13, `${rel} 使用 Math.random`);
    if (/\bDate\.now\s*\(/.test(source)) fail(13, `${rel} 使用 Date.now`);
  }
  if (rel.startsWith('src/ui/') && /\bnew\s+THREE\b/.test(source)) {
    fail(13, `${rel} 直接 new THREE`);
  }
}

/* R14 可重复构建：无绝对路径 / 时间戳 */
if (/(?:^|[^A-Za-z])[A-Za-z]:[\\/](?![\\/])/.test(withoutExternal)) fail(14, '产物包含 Windows 绝对路径');
if (/file:\/\//i.test(withoutExternal)) fail(14, '产物包含 file:// 绝对路径');
if (/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(withoutExternal)) fail(14, '产物包含 ISO 时间戳');

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`validate: FAILED R${failure.id} ${failure.message}`);
  }
  console.error(`validate: FAILED ${failures.length} 条`);
  process.exit(1);
}

const sha256 = createHash('sha256').update(artifact, 'utf8').digest('hex');
console.log(`validate: 14/14 rules passed（${(bytes / 1024).toFixed(1)} KiB，sha256 ${sha256.slice(0, 12)}）`);
