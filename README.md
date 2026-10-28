# 《谁在听》 / WHO'S LISTENING

> **少女乐队 × 吸血鬼幸存者**：你只有一束光——照向台下，他们为你燃烧，噪音也循光而来。整场演出你只做一件事：**决定看哪里。**

**状态**：v1.0.0 已发布（GitHub Release + GitHub Pages 在线版） · **平台**：桌面浏览器（WebGL2） · **素材**：零外部素材

- **成品名**：《谁在听》（英文副题 WHO'S LISTENING）；仓库代号 Girls Band Live（`girls-band-live`）。乐队「留声」，场馆 B2 旧货仓，本场曲目《再亮一会儿》。
- **形态**：桌面浏览器、离线单文件、`file://` 双击可玩；**零外部素材、零运行时网络请求**。
- **技术栈**：React 19 + TypeScript 5.9 + Three.js 0.186 + Vite 8（Vitest 5 单元测试）。
- **发布状态**：**v1.0.0 已发布**（[GitHub Release](https://github.com/yanyoo2000/girls-band-live/releases/tag/v1.0.0) · **在线试玩**：https://yanyoo2000.github.io/girls-band-live/ ）；单文件附件即 `dist/girls-band-live.html`。
  - 最终构建：`dist/girls-band-live.html` = 根 `index.html` = **1,045,498 B（1,021.0 KiB，0.997 MiB）**，SHA-256 `2D2D91C2670BB447AD27D27950A627502D1AA9E7FFBD6AA6BDF14768014E0079`（2026-10-28）。
  - 四命令：`typecheck` exit 0；`test` **26 文件 / 268 用例**；`build` 两次构建同 SHA；`validate` **14/14**。
  - 发布流程见 [docs/release-checklist.md](docs/release-checklist.md)，最终产物、发布步骤与待确认项见 [docs/reports/m7-release.md](docs/reports/m7-release.md)。

---

## 给玩家

### 这是什么

《谁在听》把 Livehouse 变成一张注意力地图。你扮演主唱**江栖**：台下的 768 个座位既是你的观众，也是你的血条与弹药。你的光只有三个去向——**照亮观众**、**烧穿噪音**、**照回自己**；三者互斥，没有"免费的看"。

观众不是被杀死后掉落的经验，而是**被你的目光养出来的人**。你照亮谁，谁就为你唱；你越亮，循光而来的噪音也越多。一局 9 分 30 秒，结束时你要么把整座场馆点亮，要么一个人把剩余段落弹完。

### 如何打开单文件（推荐）

1. 取得单文件 **`dist/girls-band-live.html`**（发布后即 GitHub Release `v1.0.0` 的附件）。
2. 双击它，或拖进 **Chrome / Edge / Firefox**；也可以在 PowerShell 里执行：
   ```powershell
   start .\dist\girls-band-live.html
   ```
3. 需要 **WebGL2** 与硬件加速；窗口至少 1024×640，推荐 **1280×720 及以上**（更小会显示"窗口太小了"提示）。
4. **不需要联网、不需要安装、不写注册表**。游戏只在本机 `localStorage` 的 `gbl.save.v1` 里保存设置与最佳记录；删掉这条记录即可重置。

> 最终 v1.0.0 构建已在 Chrome（`file://`，无 `?dev` 参数）验证：启动 → 主菜单 → 演出 → 升级三选一 → 暂停 → 回主菜单 → 离开确认，以及 `?dev=1` 快进 9:30 结算 → 再演一场；全程 **console 0 条**、**Network 仅 1 条 `file://` 文档请求**。也可以用 `npm run dev` 开发服务器试玩，但发行体验以单文件为准。

### 操作

| 操作 | 键鼠 |
| --- | --- |
| 移动主唱 | `W A S D` / 方向键 |
| 移动光 | 鼠标指针（光有 0.15s 惯性，要提前想） |
| 束光（按住） | 鼠标左键按住；松手回到散光 |
| 点燃（脉冲） | 鼠标左键按下（0.3s 脉冲，冷却 2 拍） |
| 插线（队友线断后） | 靠近队友按 `E` |
| 终曲「放下光」 | 长按 `Space` |
| 暂停 / 继续 | `Esc` |
| 查看构筑 | `Tab`（当前实现打开暂停面板并显示构筑；与 HUD 提示"Tab 看构筑"不完全一致，见已知限制 10） |

### 一局怎么进行（9:30）

| 时间 | 段落 | 你在做什么 |
| --- | --- | --- |
| 0:00–1:30 | 序曲 | 走位、移光、第一次转化；开场 5 秒宽限、首次移动鼠标前不进入返听/过热；1:12 后排右端荧光棒亮起（等价钩子，见已知限制 8） |
| 1:30–3:40 | 主歌 | 第一次被噪音追；**2:00 第一次人浪** |
| 3:40–5:50 | 副歌 | 雪球；**5:00 第二次人浪**；第一次返听 |
| 5:50–7:40 | 桥段 / 静默 | 6:30 系统抽走声音；撑过 Boss「静默」三阶段 |
| 7:40–9:10 | 终曲 | **8:00 第三次人浪**；**8:50 长按 Space 放下光** |
| 9:10–9:30 | 结算 | 空位、真实数据、评级；按「再演一场」立即重开 |

### 核心规则（一句话版）

- **人气 = 血量 = 弹药**：观众总数同时是你的生命、输出与安可资本；局内 HUD **不显示任何数字**，你只能读画面。
- **掌声 = 经验**：转化 +1；点燃按拍点 +1/+2/+3；点燃击杀或合唱击杀 +1/只；人浪 +10；另有按人气系数给的基础演出经验。烧掉的噪音本身不给经验——这是「烧 vs 唱化」的核心取舍。
- **光的三形态**：散光（宽、慢）、束光（窄、强）、回照（自保，但每 4 拍人气 −1）。
- **四座区 = 四声部**：四个座区分别对应根、三、五、七四个声部；每区 192 席，共 768 席。
- **养人即招灾**：每次人浪让天花板多裂一道缝，裂缝让噪音更多，逼你继续养人。
- **白光**：人气相对本局峰值下降时，屏幕边缘会泛起白光；它不只是滤镜，而是"你正在失去他们"的读数。表现层为中央与 42% 半径内不遮挡舞台、边缘渐晕。

### 内容规模（GDD 锁定）

- 1 名可操作主唱 + 3 名队友（吉他 许燎、贝斯 闻笙、鼓 邵砚），4 个不靠立绘和配音的角色瞬间。
- 3 种光形态；4 个座区 / 4 个声部；**768 席**（24×32）。
- 3 种常规噪音（底噪 / 啸叫 / 失真）+ 1 名精英「返听」+ 1 个三阶段 Boss「静默」。
- **24 张卡池 / 单局最多 10 次三选一 / 3 条互斥构筑 / 3 个进化**（合唱流、独奏流、招灾流）；实测主动局 7–10 次三选一、进化可成型。
- 5 段、3 种灯光态、1 首固定曲（128 BPM、4/4、304 小节）、4 档评级（S/A/B/C）、3 种结局形状。
- 12 声部合唱池（4 区 × 3 层）、12 个音效；舞台、模型、材质、音乐全部程序化生成。

### 设置与无障碍

- 三路音量（总 / 音乐 / 音效）、高 / 低画质、**减少动态**、**高对比**、**节拍脉冲**、**低闪**。
- 支持键盘全流程、可见焦点环、`prefers-reduced-motion`、`prefers-contrast`、`forced-colors`；暂停即安全，失焦自动降音/冻结；暂停对话框已对背景 `inert`/`aria-hidden`。
- 无文本输入、无账号、无内购、无联网。

### 已知限制（发布前请先读）

以下为 v1.0.0 发布时仍存在的限制（来源：[m6-gate §6](docs/reports/m6-gate.md)、[m6-rc §6](docs/reports/m6-rc.md)、t122/t123），**不阻塞发布，但都未被人测/产品裁决覆盖**。

1. **90 秒真人门未做**：AC-13 / AC-H01 需要 10 名外部新玩家，≥7 人在 90 秒内主动移光；当前只有 AI 试玩、冷启采样与 bot 埋点，**不能替代真人样本**。
2. **音频听感 / 盲听 A/B 未人测**：5 层音乐、12 声部合唱、12 个 SFX 的听感、静默段与"少一轨是否疼"尚未由人耳验证；现有的是逻辑单测与原型切片技术测量。
3. **性能未正式验收**：现有帧率约为 t111 的 130fps 级采样（RTX 4080）；1920×1080、连续 3 局、集显/低画质未正式测。
4. **W 边界相机构图**：走到舞台后侧时台面/成员/观众/荧光棒仍可见，但画面底部约 55% 接近黑色（t122 medium）。
5. **升级曲线前重后空**：主动局 10 次三选一集中在 3:48 内，之后 5:42 没有新的构筑推进（t122 medium）。
6. **评级可达性（REV-M3，刻意设计 / 已知 P1）**：常规扫场+点燃约 160 人 = C，B 需要终场 ≥300。**理由**：评级奖励「养人/唱化」而非单纯扫场击杀，C 是常规打法基线，B 及以上要求把观众养到 300+（与 GDD §13.5 一致）；制作人确认为刻意设计，待 90 秒真人门与玩家反馈后再评估。
7. **序曲可逆空场（REV-M4，刻意设计 / 已知 P1）**：驻守把 30 人打到 4 后，45 秒扫场可回满 30，序曲的 F3 代价偏弱。**理由**：序曲是教学/邀请段（GDD §14 温柔开局），设计上不允许第一分钟即锁死失败；反驻守主要针对中后段驻守（返听/过热在有噪音时生效）。制作人确认为刻意设计，P1 观察中后段是否需要补强。
8. **H2 等价钩子位置**：1:12 荧光棒位于后区第一排最右端（back-right，1.7m），不是 GDD 原文的第 24 排——固定 45°/22° 相机看不到第 24 排，已在 GDD §14 记为等价处理。
9. **whiteout 临界动画峰值**：HUD 内联上限 0.85，但临界态动画峰值可达 0.957–1.000（表现层脉动，非静态超限）；`dwellRewardRatio` 负值 = 停住期人气净下降，属预期证据，不是阈值失败。
10. **暂停面板构筑区不列已选核心**：已选核心后仍显示"还没有拿到卡"（F5，low；HUD 核心显示正确）；`Tab` 与 HUD 提示不完全一致（t110-M6 未修）。
11. **其他未覆盖**：Firefox 未实机验证；失败卡/中断局、三构筑各一局、三进化、评级边界、静默可读性、高对比/色觉复述未专门构造；仅桌面，不做移动端/触屏/手柄。
12. **命名 / 商标 / 许可证 / 仓库公开 / Pages 未定**：发布前需用户确认；GitHub Pages 未上线，只提供离线单文件与 Release 附件。

---

## 给开发者

### 快速开始

```powershell
npm install          # 安装依赖（Node >= 20.19）
npm run dev          # Vite 开发服务器（默认 http://localhost:5173）
```

### 命令

| 命令 | 作用 | v1.0.0 实测 |
| --- | --- | --- |
| `npm run typecheck` | `tsc --noEmit`，覆盖 `src/**`、`tests/**`、`tools/**` | exit 0，0 错误 |
| `npm test` | `vitest run`，纯逻辑单元测试 | **26 个测试文件 / 268 用例**全过，无 skip/todo |
| `npm run build` | `tsc --noEmit` + `vite build` + `node tools/build-single.mjs` | exit 0；产出 `dist/girls-band-live.html` 与根 `index.html`，两者字节一致；两次构建同 SHA |
| `npm run validate` | 校验单文件自包含、必需 DOM、版本元信息、分层与确定性（R1–R14） | `validate: 14/14 rules passed（1021.0 KiB，sha256 2d2d91c2670b）` |
| `node tools/check-layers.mjs` | 额外分层检查（可选） | `83 files, 0 violations` |

- 构建产物：`dist/index.html` + `dist/assets/*` 是 Vite 常规中间产物；**发布物是内联后的 `dist/girls-band-live.html`**（同时复制为根 `index.html`，供 Pages 使用）。
- 版本标记：单文件内为 `<!-- girls-band-live v1.0.0 build:inline -->`；`package.json` version = `1.0.0`。
- 连续两次构建的 SHA-256 必须一致（AC-T10）；产物内无时间戳、无 sourcemap、无 crossorigin/integrity。
- 依赖锁定见 `package-lock.json`；运行时依赖仅 `react`、`react-dom`、`three`，**0 个新增运行时依赖**。

### 目录结构

```
src/
  main.tsx          React 入口、DOM 输入装配、启动顺序
  App.tsx           UI 根组件（屏幕路由）
  game/             纯 TypeScript 玩法逻辑（无 react / three / DOM，可 Node 单测）
  three/            Three.js 渲染器、场景、相机、实例化、特效、程序化模型
  ui/               React 屏幕、HUD、覆盖层、外部 store 桥（≤10Hz）
  audio/            WebAudio 五层音乐、12 声部合唱、程序化 IR、12 SFX
  data/             角色/卡池/噪音/段落/和弦/座位/文案/配色/平衡表
  platform/         localStorage、WebGL2 检测、启动引导
  types/            共享类型契约（game/data/save/ui）
  styles/           base / ui / theme（CSS token）
  assets/           程序化 SVG/Canvas 视觉资产（无外部图片/字体/音频）
tests/              26 个 Vitest 文件（含 f3-bot 反驻守 bot、座位布局、UI 冒烟、存档链路）
tools/              build-single / validate / check-layers（零依赖 Node 脚本）
docs/               工作室文档（提案、讨论、评审、GDD、技术方案、验收、QA 报告、发布）
dist/               构建产物（发布物为 dist/girls-band-live.html）
prototypes/          音频垂直切片原型（独立 file:// 页面）
index.html          构建生成的单文件入口（发布/Pages 用）
```

### 架构与边界（代码审查会直接判 blocking）

- `src/game/**` 不 import `react` / `three` / DOM API；`src/three/**` 不 import `react`；`src/ui/**` 不 import `three`；`src/types/**` 不 import 任何实现。
- React 只通过外部 store + `useSyncExternalStore` 读快照；HUD ≤10Hz，**禁止在 rAF 内 setState**。
- 固定步长 1/60、单帧最多补 5 步；`src/game/**` 禁止 `Math.random` / `Date.now`（确定性由 seed 驱动）。
- 渲染预算：draw calls ≤60（目标 45）、三角面 ≤120k、后处理 0、真 SpotLight ≤2；低画质自动降 DPR / 粒子 / 噪音上限。
- 存档 key 固定 `gbl.save.v1`；损坏时回退默认并把坏档备份为 `gbl.save.v1.bad`，不阻塞启动。
- 窗口缩放：`main.tsx` 读 `document.documentElement` 尺寸，`renderer.setSize(..., false)` 不清写内联 px；resize / orientation / fullscreen / visualViewport / ResizeObserver / DPR 变化均触发同步。

### 测试与验收

- 68 项验收矩阵见 [docs/acceptance.md](docs/acceptance.md)：20 项工程门 + 22 项 P0 + 5 项 GDD 补充 + 13 项修复项 + 8 项人测。自动化部分由 `tests/**` 与四命令覆盖；人测部分见 QA 报告与发布检查表。
- **发布候选状态**：t123 独立代码审查 **PASS**（4 medium + 3 low 转 P1）；t125 M6 门禁 **通过，无 blocker/high**；t124 产出 v1.0.0 候选（`2d2d91c2…`）。
- 发布前 4 项文档/口径小修已处理（F1 acceptance 动画峰值注记、F2 verification-report 旧版注记、F3 acceptance 测试文件名、F4 评级/序曲设计口径；F5 列入已知限制），均不影响产物字节，见 [m7-release](docs/reports/m7-release.md) 与 [release-checklist](docs/release-checklist.md)。
- 单元测试覆盖（v1.0.0）：26 文件 / 268 用例，含 F3 反驻守 bot、768 席布局、UI 冒烟、存档链路、确定性、Boss 相位、开场宽限、结算口径等。

### 工作室与过程（36 人 / M1–M7）

这是一次"AI 游戏工作室"实验：36 个智能体在同一仓库里从创意走到发行。

| 组 | 人数 | 角色 |
| --- | --- | --- |
| 管理层 | 4 | 制作人、创意总监、技术总监、美术总监 |
| 策划组 | 10 | 叙事、Roguelike、氛围、融合、社区、街机、极简、长线、实验、新手 |
| 评审 / 打分 | 10 | 3 位评审（乐趣 / 可行性 / 玩家价值）+ 7 位独立打分员 |
| 开发组 | 7 | 引擎、Three.js、战斗、成长、内容、UI、音频 |
| 质量与发行 | 5 | 单元测试、实机试玩、兼容性、代码审查、发行 |

完整名册与流程见 [docs/production-plan.md](docs/production-plan.md)。

| 里程碑 | 交付 | 过程记录 |
| --- | --- | --- |
| M1 企划提案 | 10 份自由企划 | [m1-pitches.md](docs/reports/m1-pitches.md)、[pitch-narrative.md](docs/pitches/pitch-narrative.md) 等 10 份 |
| M2 交叉讨论 | 10 份互评 + 3 个融合案 | [m2-discussion.md](docs/reports/m2-discussion.md)、[hybrid-c.md](docs/concepts/hybrid-c.md) |
| M3 评审打分 | 3 评审 + 7 打分 + 计票定案 | [m3-selection.md](docs/reports/m3-selection.md)、[selected-concept.md](docs/decision/selected-concept.md) |
| M4 设计定稿 | GDD / 技术方案 / 验收矩阵 / 美术方向 | [gdd.md](docs/gdd.md)、[tech-spec.md](docs/tech-spec.md)、[acceptance.md](docs/acceptance.md)、[art-direction.md](docs/art-direction.md) |
| M5 开发 | 8 个实现任务 + 单测 | [m5-dev.md](docs/reports/m5-dev.md)、[unit-report.md](docs/qa/unit-report.md) |
| M6 测试与审查 | 候选版 / 验证 / 试玩 / 兼容 / 修复 / 门禁 | [verification-report.md](docs/qa/verification-report.md)、[playtest-report.md](docs/qa/playtest-report.md)、[compat-report.md](docs/qa/compat-report.md)、[m6-rc.md](docs/reports/m6-rc.md)、[m6-gate.md](docs/reports/m6-gate.md) |
| M7 发布 | README / CHANGELOG / 检查表 / 发布记录 | [m7-release.md](docs/reports/m7-release.md)、[release-checklist.md](docs/release-checklist.md)、[CHANGELOG.md](CHANGELOG.md) |

### 更多文档

- [项目简报](docs/brief.md)：产品定义、设计支柱、硬约束、评审规则
- [工作室手册](docs/agent-handbook.md)：协作约定、代码契约、完成定义
- [制作计划](docs/production-plan.md)：36 人名册、M1–M7、质量门与 Git 流程
- [技术决策](docs/decisions/0001-project-setup.md)、[React + TS + Three 决策](docs/decisions/0002-react-ts-three.md)、[依赖策略](docs/decisions/0003-dependency-policy.md)、[仅桌面](docs/decisions/0004-desktop-only.md)、[最佳游戏优先](docs/decisions/0005-best-game-first.md)
- [M6 门禁](docs/reports/m6-gate.md)、[M6 发布候选](docs/reports/m6-rc.md)、[修复记录](docs/reports/gameplay-repair-2.md)、[兼容修复](docs/reports/compat-fix-report.md)
- [QA 报告入口](docs/qa/verification-report.md)（t109 旧版，已加 t113/t123 取代注记）、[实机试玩 3](docs/qa/playtest-report-3.md)、[过程报告入口](docs/reports/m1-pitches.md)
- [音频垂直切片报告](docs/reports/audio-slice.md) 与 [原型](prototypes/audio-slice.html)

### 原创、素材与许可证

- **零外部素材**：角色、舞台、观众、噪音全部由 Three.js 基础几何 + 程序化材质构成；音乐与音效 100% 由 WebAudio 合成；UI 用系统字体栈；无 `<img>` / `<audio>` / `<video>` / glTF / 字体文件 / CDN。
- `tools/validate.mjs` 的 R6–R9 会拒绝任何外部链接、字体与运行时联网调用；`legalComments: 'eof'` 保留 React / Three 的 MIT 声明。
- 运行时依赖：`react`、`react-dom`（MIT）、`three`（MIT）；构建/测试依赖均为 MIT / Apache-2.0。**项目自身许可证尚未选定**，发布前由用户确认（见 [发布检查表](docs/release-checklist.md)）。
- 角色、乐队、曲目、场馆、文案均为本项目原创；不使用现实乐队、歌曲、人物或既有 IP 素材。

---

**一句话**：一局结束时，你会知道——是你把这一屋子人养出来的，也是你把噪音招来的。
