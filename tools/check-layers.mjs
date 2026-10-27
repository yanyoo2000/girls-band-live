/**
 * 分层检查（tech-spec §3.2 / validate R12；零依赖）。
 *
 * 规则：
 * 1. `src/game/**` 不得 import react / react-dom / three，不得使用 DOM/WebAudio/localStorage 全局；
 * 2. `src/three/**` 不得 import react；
 * 3. `src/ui/**` 不得 import three；
 * 4. `src/types/**` 只能 import 同目录类型文件，不得 import 任何实现；
 * 5. 相对 import 不得形成环（文件级图）。
 *
 * 只读源码，不写任何文件。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');

/** 递归收集 src 下的 .ts/.tsx 文件（跳过 .d.ts 与隐藏目录）。 */
function collectFiles(dir, out) {
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectFiles(full, out);
    } else if ((entry.endsWith('.ts') || entry.endsWith('.tsx')) && !entry.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out;
}

/** 去掉注释（粗粒度，足够做 import/全局名扫描）。 */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/** 提取 import/export-from 与动态 import（只扫描去注释后的源码）。 */
function extractImports(source) {
  const imports = [];
  const re = /(import|export)\s+(type\s+)?(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  let match = re.exec(source);
  while (match !== null) {
    const specifier = match[3] ?? match[4];
    if (specifier !== undefined) {
      imports.push({ specifier, typeOnly: match[2] !== undefined });
    }
    match = re.exec(source);
  }
  return imports;
}

/** 解析相对 import 到真实文件（缺失返回 null）。 */
function resolveRelative(fromFile, specifier) {
  if (!specifier.startsWith('.')) return null;
  const base = resolve(dirname(fromFile), specifier);
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.d.ts`,
    join(base, 'index.ts'),
    join(base, 'index.tsx'),
  ];
  for (const candidate of candidates) {
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      // 尝试下一个候选。
    }
  }
  return null;
}

const REACT_RE = /^react$|^react-dom(?:\/|$)/;
const THREE_RE = /^three(?:\/|$)/;
const TYPES_ALLOWED = new Set(['./game', './data', './save', './ui']);
const TYPE_FILE_RE = /^\.\/(game|data|save|ui)(?:\.ts)?$/;
// `requestAnimationFrame` / `performance.now` 是 tech-spec §6.4 允许 loop 使用的宿主调度与计时入口，
// 不属于“DOM/WebAudio/localStorage 全局”，因此不在禁用列表内。
// 只匹配真实访问（`document.` / `window.` / `new AudioContext`），避免变量名或文案里的 window 误报。
const DOM_GLOBALS =
  /\b(document|window|localStorage|sessionStorage|AudioContext|HTMLCanvasElement|WebGLRenderer)\s*[.([]|\bnew\s+(?:AudioContext|HTMLCanvasElement|WebGLRenderer)\b/;

/**
 * 执行分层检查。
 * @param {string} [rootDir] 仓库根目录（默认脚本所在仓库）。
 * @returns {{ files: number, violations: { file: string, rule: string, detail: string }[], cycles: string[][] }}
 */
export function checkLayers(rootDir = ROOT) {
  const srcDir = join(rootDir, 'src');
  const files = collectFiles(srcDir, []);
  const violations = [];
  const graph = new Map();

  for (const file of files) {
    const rel = relative(rootDir, file).replace(/\\/g, '/');
    const source = readFileSync(file, 'utf8');
    const clean = stripComments(source);
    const imports = extractImports(clean);

    for (const { specifier, typeOnly } of imports) {
      if (rel.startsWith('src/game/')) {
        if (REACT_RE.test(specifier)) {
          violations.push({ file: rel, rule: 'game-no-react', detail: specifier });
        }
        // 允许 `import type` 引用 three 的接口（编译期擦除）；运行时 import 仍禁止。
        if (!typeOnly && (THREE_RE.test(specifier) || specifier.startsWith('../three/'))) {
          violations.push({ file: rel, rule: 'game-no-three', detail: specifier });
        }
      }
      if (rel.startsWith('src/three/')) {
        if (REACT_RE.test(specifier)) {
          violations.push({ file: rel, rule: 'three-no-react', detail: specifier });
        }
      }
      if (rel.startsWith('src/ui/')) {
        if (THREE_RE.test(specifier) || specifier.startsWith('../three/')) {
          violations.push({ file: rel, rule: 'ui-no-three', detail: specifier });
        }
      }
      if (rel.startsWith('src/types/') && specifier.startsWith('.')) {
        if (!TYPES_ALLOWED.has(specifier) && !TYPE_FILE_RE.test(specifier)) {
          violations.push({ file: rel, rule: 'types-internal-only', detail: specifier });
        }
      }

      // 类型 import 在运行时被擦除，不进入文件级环图。
      if (typeOnly) continue;
      const target = resolveRelative(file, specifier);
      if (target !== null) {
        const list = graph.get(file) ?? [];
        list.push(target);
        graph.set(file, list);
      }
    }

    if (rel.startsWith('src/game/')) {
      const domHit = DOM_GLOBALS.exec(clean);
      if (domHit !== null) {
        violations.push({ file: rel, rule: 'game-no-dom-globals', detail: domHit[0] });
      }
    }
  }

  // 文件级环检测（相对 import 图）。
  const cycles = [];
  const state = new Map();
  const stack = [];
  const visit = (node) => {
    const status = state.get(node);
    if (status === 1) {
      const start = stack.indexOf(node);
      cycles.push(stack.slice(start).concat(node).map((item) => relative(rootDir, item).replace(/\\/g, '/')));
      return;
    }
    if (status === 2) return;
    state.set(node, 1);
    stack.push(node);
    for (const next of graph.get(node) ?? []) visit(next);
    stack.pop();
    state.set(node, 2);
  };
  for (const file of files) visit(file);

  return {
    files: files.length,
    violations: violations.map((item) => ({
      file: item.file,
      rule: item.rule,
      detail: item.detail,
    })),
    cycles,
  };
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = checkLayers();
  for (const violation of result.violations) {
    console.error(`check-layers: ${violation.file} [${violation.rule}] ${violation.detail}`);
  }
  for (const cycle of result.cycles) {
    console.error(`check-layers: 循环 import：${cycle.join(' -> ')}`);
  }
  if (result.violations.length > 0 || result.cycles.length > 0) {
    console.error(`check-layers: FAILED（${result.violations.length} 违规 / ${result.cycles.length} 环）`);
    process.exit(1);
  }
  console.log(`check-layers: ${result.files} files, 0 violations`);
}
