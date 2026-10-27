# 智能体工作室手册 / Agent Handbook

本文件是所有成员的协作契约。开始任务前必须阅读：`docs/brief.md`、本文件、`docs/production-plan.md`，以及与任务相关的既有文档。

---

## 1. 十条铁律

1. **只做任务范围内的事**：只创建/修改任务描述或 inScope 指定的文件；不重构无关代码，不删除他人文件。
2. **不要运行 git / gh**：提交、打 tag、建 release、关闭 milestone 由制作人（captain）统一执行。成员只写文件并在报告中列出路径。
3. **不要安装依赖、不要访问网络、不要引入外部资源**。项目是零依赖、离线、原创。
4. **先读后写**：修改已有文件前必须先读；新文件先确认目录与命名。
5. **共享工作区**：其他成员可能同时在写别的文件；不要做全局查找替换、批量重命名、格式化全仓库。
6. **文档用中文，代码标识符用英文**；文案必须原创。
7. **不虚构验证结果**：报告中的命令、输出、截图路径必须真实；没跑就写“未验证”。
8. **交付即证据**：文件路径 + 关键内容 + 验证命令 + 结果 + 风险，缺一不可。
9. **接口以 `docs/tech-spec.md` 为准**：文档冲突时，技术方案优先；发现冲突在报告中指出，不要私自改契约。
10. **质量优先于速度**：宁可少写一个特性，也不留半成品、TODO、占位符或注释掉的死代码。

---

## 2. 目标仓库结构

```
docs/
  brief.md                 项目简报（产品/评审/硬约束）
  agent-handbook.md        本文件
  production-plan.md       名册、里程碑、GitHub 流程
  decisions/               决策记录
  pitches/                 M1：10 份企划提案
  discussion/              M2：10 份交叉讨论
  concepts/                M2：3 个融合方案
  reviews/                 M3：3 份评审意见
  scores/                  M3：7 份打分表
  decision/                M3：定案记录
  gdd.md                   M4：游戏设计文档
  tech-spec.md             M4：技术方案与接口契约
  acceptance.md            M4：验收矩阵
  art-direction.md         M4：美术方向
  reports/                 每个里程碑的制作报告
  qa/                      M6：验证、试玩、兼容性报告与截图
src/
  index.html               开发入口（由技术总监在候选版阶段接管）
  dev.html                 UI 开发调试页（UI 工程师）
  css/                     base.css / ui.css / theme.css
  js/                      data/core/entities/enemies/weapons/combat/
                           progression/upgrades/save/audio/hud/ui/main
  assets/                  SVG 角色立绘、图标、Logo（内联使用）
tests/                     Node 内置 test runner（*.test.cjs）
tools/                     build.mjs / validate.mjs（零依赖）
dist/                      girls-band-live.html（构建产物）
index.html                 发布入口（构建产物，根目录）
```

---

## 3. 代码契约

### 3.1 模块格式（经典脚本，兼容 Node 测试）

每个 `src/js/*.js` 使用 IIFE，挂到 `window.GBL`，并在 Node 下导出：

```js
(function (root) {
  'use strict';
  const GBL = (root.GBL = root.GBL || {});

  function createExample(options) {
    // ...
  }

  GBL.example = Object.freeze({ createExample });

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = GBL.example;
  }
})(typeof window !== 'undefined' ? window : globalThis);
```

- 纯逻辑模块（core/entities/enemies/weapons/combat/progression/upgrades/save/data）**不得**访问 `document`、`window` 之外的 DOM、Canvas、localStorage、AudioContext。
- 适配层（ui/hud/audio/main）负责 DOM、Canvas、存储、音频。
- 禁止使用 `Math.random()` 参与玩法判定；使用 `GBL.core.createRng(seed)`，种子可注入，保证测试可复现。
- 模块之间通过 `GBL` 命名空间显式引用；不得依赖脚本加载顺序以外的隐式全局变量。
- 事件总线：`GBL.core.bus`（`on/off/emit`）；事件名使用 `domain:action`（如 `run:start`、`xp:levelup`）。

### 3.2 固定脚本加载顺序

```
data.js → core.js → entities.js → enemies.js → weapons.js → combat.js
→ progression.js → upgrades.js → save.js → audio.js → hud.js → ui.js → main.js
```

新增模块必须由技术总监批准并在 `src/index.html`、`tools/build.mjs` 中同步登记。

### 3.3 DOM 契约（最小集合，最终以 tech-spec 为准）

`#app` `#game-canvas` `#hud` `#hud-timer` `#hud-hp` `#hud-xp` `#hud-level` `#hud-kills` `#hud-weapons` `#hud-encore` `#screen-menu` `#screen-select` `#screen-help` `#screen-levelup` `#screen-pause` `#screen-settings` `#screen-results` `#screen-credits` `#toast`。

- 所有可交互元素必须可 Tab 聚焦、有可见焦点、支持 Enter/Space。
- 屏幕切换通过 `.screen.is-active`，同一时间只允许一个主屏幕激活。
- 画布逻辑分辨率 1280×720；CSS 等比缩放 letterbox；DPR 上限 2。

### 3.4 数据契约

- 角色、武器、进化、敌人、波次、台词、颜色全部在 `src/js/data.js`；逻辑层不得硬编码内容。
- 所有 id 使用 kebab-case 且全局唯一；进化必须能通过 id 引用到武器与被动。
- 数值集中可调；每项内容提供 `name`、`description`、`id`。

### 3.5 存档契约

- key：`gbl.save.v1`；schema：`{ version: 1, settings: {...}, records: {...}, unlocks: {...} }`。
- 读取必须 try/catch；损坏/旧版本回退默认值；写入失败静默降级，不影响本局。
- 禁止存储个人数据。

### 3.6 音频契约

- 仅 WebAudio 合成；首次用户手势后 `resume()`；页面隐藏/失焦时暂停或降音量。
- 至少 4 层音乐（drums/bass/chords/lead），强度随波次推进；关键 SFX（命中、升级、Encore、Boss、结算）。
- 静音/音量持久化到存档；所有节点可被总 gain 控制。

### 3.7 性能契约

- 对象池复用敌人/子弹/粒子/飘字；空间网格做碰撞粗筛。
- 每帧避免大数组分配；粒子上限；实体硬上限 250。
- 目标 60fps（150 敌人）；掉帧时优先降粒子/飘字，不降逻辑正确性。

---

## 4. 命令契约（不可改名）

| 命令 | 作用 |
| --- | --- |
| `node --check <file.js>` | 语法检查（实现任务的必跑项） |
| `node --test tests` | 运行全部单元测试（Node 内置 test runner） |
| `node tools/build.mjs` | 读取 `src/index.html`，内联 CSS/JS，生成根 `index.html` 与 `dist/girls-band-live.html` |
| `node tools/validate.mjs` | 校验单文件无外部引用、必需 DOM/版本/大小，失败退出码非 0 |

- 构建必须可重复：同一输入两次构建产物字节一致（版本号/时间戳不得写入产物）。
- 单文件产物中不得出现 `http://`、`https://`、`fetch(`、`import(`、`<link rel="stylesheet" href=` 等外部/模块引用（注释中的说明除外时，以 validate 规则为准）。

---

## 5. 文件命名与文案

- 文件名：小写 kebab-case，如 `pitch-narrative.md`、`hybrid-a.md`、`verification-report.md`。
- 文档标题：`#` 一级标题 + 稳定的二级小节。
- 代码：`camelCase` 函数/变量，`PascalCase` 类/构造器，`UPPER_SNAKE_CASE` 常量。
- 中文文案使用全角标点；专有名词保留英文时前后加空格。
- 禁止在游戏 UI 中出现 “Vampire Survivors” 等他人商标；类型描述只出现在文档中。

---

## 6. 任务报告格式

完成任务时，`output`/报告必须包含：

```
交付：<文件路径列表>
摘要：<≤150 字，做了什么、关键决策>
验证：<命令 + 结果；没有则写明“未运行”>
风险/遗留：<≤3 条；没有写“无”>
```

评审/打分任务额外包含：结论（pass/needs_revision 或 A/B/C 排名）、逐项分数、findings（id/severity/file/line/problem/requiredFix）。

---

## 7. 里程碑与提交

- 共 7 个里程碑（M1–M7），详见 `docs/production-plan.md`。
- 成员**不提交**；每个里程碑由制作人统一 commit、打 tag、push、关闭 GitHub Milestone/Issue。
- 成员完成后不要等待“下一步指令”，按 DAG 自动进入可领取的任务；需要澄清时在报告中写清楚，由制作人转达。
- 质量任务失败（review = needs_revision）时，按审查 findings 修复；不要绕过或降低验收标准。

---

## 8. 完成定义（成员级）

- 文档：结构完整、无 TBD、与 brief/rubric 一致、有明确结论。
- 实现：文件存在、`node --check` 通过、遵循 tech-spec 接口、无外部依赖、无占位代码。
- 测试：真实运行并记录输出；失败要写清复现步骤。
- 美术/音频：无外部素材、可离线、体积受控、遵循 art-direction。
- 审查：只基于证据下结论；不修改代码；findings 必须可执行。
