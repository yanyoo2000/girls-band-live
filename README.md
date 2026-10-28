# 《谁在听》 / WHO'S LISTENING

> **少女乐队 × 吸血鬼幸存者**：你只有一束光——照向台下，他们为你燃烧，噪音也循光而来。整场演出你只做一件事：**决定看哪里。**

**状态**：v1.0.0 发布准备中 · **平台**：桌面浏览器（WebGL2） · **素材**：零外部素材

- **成品名**：《谁在听》（英文副题 WHO'S LISTENING）；仓库代号 Girls Band Live（`girls-band-live`）。乐队「留声」，场馆 B2 旧货仓，本场曲目《再亮一会儿》。
- **形态**：桌面浏览器、离线单文件、`file://` 双击可玩；**零外部素材、零运行时网络请求**。
- **技术栈**：React 19 + TypeScript 5.9 + Three.js 0.186 + Vite 8（Vitest 5 单元测试）。
- **发布状态**：**v1.0.0 发布准备中（M7 草稿）**。当前工作区构建为 M6 收尾修复期间的中间产物，最终发布以重新构建并记录 SHA-256 的冻结版为准。
  - 当前构建：`dist/girls-band-live.html` = 根 `index.html` = **1,043,675 B（≈1019.2 KiB，0.995 MiB）**，SHA-256 `A220C425A6A00B5F716F7A4A9151148FFC2611FCFF7F6E3716ABFB64C2DF52D4`（2026-10-28；05:33 首次构建、05:46 重建同哈希）。
  - 最近一次四命令全绿记录：t113 修复后 **1,041,592 B**，SHA-256 `307d4e709c50…`。两者不是同一构建，发布前必须重新冻结并核对。
  - 发布前检查表见 [docs/release-checklist.md](docs/release-checklist.md)，状态与待修项见 [docs/reports/m7-release-draft.md](docs/reports/m7-release-draft.md)。

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

> 也可以用开发服务器（`npm run dev`）试玩，但发行体验以单文件为准：M6 候选构建已验证在 `file://` 下完成启动 → 主菜单 → 演出 → 升级 → 暂停 → 结算 → 重开全流程，控制台 0 报错、网络除文档自身外 0 请求；发布前会对最终构建复验。

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
| 查看构筑 | `Tab`（M6 版本此键会打开暂停面板；M7 计划修正为不打断演出的构筑查看） |

### 一局怎么进行（9:30）

| 时间 | 段落 | 你在做什么 |
| --- | --- | --- |
| 0:00–1:30 | 序曲 | 走位、移光、第一次转化；1:12 最后一排的荧光棒亮起（钩子设计；当前版本尚未实现，t117 计划修复） |
| 1:30–3:40 | 主歌 | 第一次被噪音追；**2:00 第一次人浪** |
| 3:40–5:50 | 副歌 | 雪球；**5:00 第二次人浪**；第一次返听 |
| 5:50–7:40 | 桥段 / 静默 | 6:30 系统抽走声音；撑过 Boss「静默」三阶段 |
| 7:40–9:10 | 终曲 | **8:00 第三次人浪**；**8:50 长按 Space 放下光** |
| 9:10–9:30 | 结算 | 空位、真实数据、评级；按「再演一场」立即重开 |

### 核心规则（一句话版）

- **人气 = 血量 = 弹药**：观众总数同时是你的生命、输出与安可资本；局内 HUD **不显示任何数字**，你只能读画面。
- **掌声 = 经验**：转化一个人 +1，完美点燃 +2，人浪 +10；烧掉的噪音不给经验——这是「烧 vs 唱化」的核心取舍。
- **光的三形态**：散光（宽、慢）、束光（窄、强）、回照（自保，但每 4 拍人气 −1）。
- **四座区 = 四声部**：四个座区分别对应根、三、五、七四个声部；每区 192 席，共 768 席。
- **养人即招灾**：每次人浪让天花板多裂一道缝，裂缝让噪音更多，逼你继续养人。
- **白光**：人气相对本局峰值下降时，屏幕边缘会泛起白光；它不是单纯的滤镜，而是"你正在失去他们"的读数。

### 内容规模（GDD 锁定）

- 1 名可操作主唱 + 3 名队友（吉他 许燎、贝斯 闻笙、鼓 邵砚），4 个不靠立绘和配音的角色瞬间。
- 3 种光形态；4 个座区 / 4 个声部；**768 席**（24×32）。
- 3 种常规噪音（底噪 / 啸叫 / 失真）+ 1 名精英「返听」+ 1 个三阶段 Boss「静默」。
- **24 张卡池 / 单局最多 10 次三选一 / 3 条互斥构筑 / 3 个进化**（合唱流、独奏流、招灾流）。
- 5 段、3 种灯光态、1 首固定曲（128 BPM、4/4、304 小节）、4 档评级（S/A/B/C）、3 种结局形状。
- 12 声部合唱池（4 区 × 3 层）、12 个音效；舞台、模型、材质、音乐全部程序化生成。

### 设置与无障碍

- 三路音量（总 / 音乐 / 音效）、高 / 低画质、**减少动态**、**高对比**、**节拍脉冲**、**低闪**。
- 支持键盘全流程、可见焦点环、`prefers-reduced-motion`、`prefers-contrast`、`forced-colors`；暂停即安全，失焦自动降音/冻结。
- 无文本输入、无账号、无内购、无联网。

### 已知限制（发布前请先读）

以下限制按 2026-10-28 的 M6 报告如实记录；其中一部分会随 M6 收尾修复（t115 / t117）关闭，最终以 [docs/reports/m7-release-draft.md](docs/reports/m7-release-draft.md) 为准。

1. **AI 试玩，不是真人样本**：实机试玩由 AI 通过真实键鼠事件执行（4 次会话、2 局完整 9:30，其中 1 局空场完成），只能证明"能跑、能结算、有反例"，不能替代 10 名新玩家的 **90 秒门（AC-13 / AC-H01）**。该门**尚未人测**。
2. **人耳音频未验**：5 层音乐、12 声部合唱、12 个 SFX 的听感、静默段与"少一轨是否疼"的盲听 A/B **尚未由人耳验证**；目前只有逻辑单测与原型切片的技术测量。
3. **性能未在目标硬件复测**：现有帧率数据来自 RTX 4080（1280×720 / 1920×1080 单次采样），**集显 3 局、满场 180 噪音、3 局内存增长**尚未测。
4. **Firefox 未实机验证**：Chrome / Edge 已测；Firefox 本机未安装，仅做静态审查（未发现已知阻塞风险）。
5. **部分 P0 人测项仍为 blocked**：失败卡/中断局、三构筑各一局、三进化、评级边界、静默可读性、高对比/色觉复述等尚未构造验证。
6. **M6 修复待关闭**：相机钻入鼓台（H3）、序曲 4 秒返听锁定 / 8 秒过热（H1）、1:12 唯一荧光棒钩子（H2）、白光遮挡（H4）、结算读数（断线次数 / 转化口径）、升级节奏、窗口缩放后 canvas 不跟随（COMPAT-1）、白光下 HUD 对比度（COMPAT-2）——这些是**待关闭项**，不是已完成修复。
7. **命名 / 商标 / 许可证 / Pages 未定**：游戏名《谁在听》的发布前查重、项目开源许可证、仓库公开与 GitHub Pages 上线均需用户确认。
8. **仅桌面**：不做移动端 / 触屏 / 手柄；不支持窄屏手机。

---

## 给开发者

### 快速开始

```powershell
npm install          # 安装依赖（Node >= 20.19）
npm run dev          # Vite 开发服务器（默认 http://localhost:5173）
```

### 命令

| 命令 | 作用 | 通过标准 |
| --- | --- | --- |
| `npm run typecheck` | `tsc --noEmit`，覆盖 `src/**`、`tests/**`、`tools/**` | 退出码 0，0 错误 |
| `npm test` | `vitest run`，纯逻辑单元测试 | 24 个测试文件 / 264 用例全过（t113 基线），无 skip/todo |
| `npm run build` | `tsc --noEmit` + `vite build` + `node tools/build-single.mjs` | 产出 `dist/girls-band-live.html` 与根 `index.html`，两者字节一致 |
| `npm run validate` | 校验单文件自包含、必需 DOM、版本元信息、分层与确定性（R1–R14） | 输出 `validate: 14/14 rules passed` |
| `node tools/check-layers.mjs` | 额外分层检查（可选） | `0 violations` |

- 构建产物：`dist/index.html` + `dist/assets/*` 是 Vite 常规中间产物；**发布物是内联后的 `dist/girls-band-live.html`**（同时复制为根 `index.html`，供 Pages 使用）。
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
tests/              Vitest 单元测试与 f3-bot 反驻守 bot
tools/              build-single / validate / check-layers（零依赖 Node 脚本）
docs/               工作室文档（提案、讨论、评审、GDD、技术方案、验收、QA 报告、发布）
dist/               构建产物（发布物为 dist/girls-band-live.html）
prototypes/         音频垂直切片原型（独立 file:// 页面）
index.html          构建生成的单文件入口（发布/Pages 用）
```

### 架构与边界（代码审查会直接判 blocking）

- `src/game/**` 不 import `react` / `three` / DOM API；`src/three/**` 不 import `react`；`src/ui/**` 不 import `three`；`src/types/**` 不 import 任何实现。
- React 只通过外部 store + `useSyncExternalStore` 读快照；HUD ≤10Hz，**禁止在 rAF 内 setState**。
- 固定步长 1/60、单帧最多补 5 步；`src/game/**` 禁止 `Math.random` / `Date.now`（确定性由 seed 驱动）。
- 渲染预算：draw calls ≤60（目标 45）、三角面 ≤120k、后处理 0、真 SpotLight ≤2；低画质自动降 DPR / 粒子 / 噪音上限。
- 存档 key 固定 `gbl.save.v1`；损坏时回退默认并把坏档备份为 `gbl.save.v1.bad`，不阻塞启动。

### 测试与验收

- 68 项验收矩阵见 [docs/acceptance.md](docs/acceptance.md)：20 项工程门 + 22 项 P0 + 5 项 GDD 补充 + 13 项修复项 + 8 项人测。自动化部分由 `tests/**` 与四命令覆盖；人测部分见 QA 报告与发布检查表。
- 最近一次独立验证（t109）：`A01–A27` 13 pass / 14 blocked / 0 fail；`F01–F13` 5 pass / 7 blocked / 1 fail（AC-F08 白光口径，已由 t113 修复并同步文档）。实机试玩（t110）发现 4 个 high，兼容（t111）发现 2 个 high，待 M6 收尾（t115 / t117）关闭。
- 单元测试覆盖（t113）：24 文件 / 264 用例，含 F3 反驻守 bot、768 席布局、UI 冒烟、存档链路、确定性、Boss 相位等。

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
| M6 测试与审查 | 验证 / 实机试玩 / 兼容 / 修复 | [verification-report.md](docs/qa/verification-report.md)、[playtest-report.md](docs/qa/playtest-report.md)、[compat-report.md](docs/qa/compat-report.md)、[repair-report.md](docs/reports/repair-report.md) |
| M7 发布 | README / CHANGELOG / 检查表 / 最终验收 | [m7-release-draft.md](docs/reports/m7-release-draft.md)、[release-checklist.md](docs/release-checklist.md)、[CHANGELOG.md](CHANGELOG.md) |

### 更多文档

- [项目简报](docs/brief.md)：产品定义、设计支柱、硬约束、评审规则
- [工作室手册](docs/agent-handbook.md)：协作约定、代码契约、完成定义
- [制作计划](docs/production-plan.md)：36 人名册、M1–M7、质量门与 Git 流程
- [技术决策](docs/decisions/0001-project-setup.md)、[React + TS + Three 决策](docs/decisions/0002-react-ts-three.md)、[依赖策略](docs/decisions/0003-dependency-policy.md)、[仅桌面](docs/decisions/0004-desktop-only.md)、[最佳游戏优先](docs/decisions/0005-best-game-first.md)
- [QA 报告入口](docs/qa/verification-report.md)、[过程报告入口](docs/reports/m1-pitches.md)
- [音频垂直切片报告](docs/reports/audio-slice.md) 与 [原型](prototypes/audio-slice.html)

### 原创、素材与许可证

- **零外部素材**：角色、舞台、观众、噪音全部由 Three.js 基础几何 + 程序化材质构成；音乐与音效 100% 由 WebAudio 合成；UI 用系统字体栈；无 `<img>` / `<audio>` / `<video>` / glTF / 字体文件 / CDN。
- `tools/validate.mjs` 的 R6–R9 会拒绝任何外部链接、字体与运行时联网调用；`legalComments: 'eof'` 保留 React / Three 的 MIT 声明。
- 运行时依赖：`react`、`react-dom`（MIT）、`three`（MIT）；构建/测试依赖均为 MIT / Apache-2.0。**项目自身许可证尚未选定**，发布前由用户确认（见 [发布检查表](docs/release-checklist.md)）。
- 角色、乐队、曲目、场馆、文案均为本项目原创；不使用现实乐队、歌曲、人物或既有 IP 素材。

---

**一句话**：一局结束时，你会知道——是你把这一屋子人养出来的，也是你把噪音招来的。
