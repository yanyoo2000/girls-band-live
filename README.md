# 《谁在听》 / WHO'S LISTENING

> **少女乐队 × 吸血鬼幸存者**：你只有一束光——照向台下，他们为你燃烧，噪音也循光而来。整场演出你只做一件事：**决定看哪里。**

**状态**：v1.0.1（t147 审查 PASS；Release/Pages 更新由制作人执行） · **平台**：桌面浏览器（WebGL2） · **素材**：零外部素材

- **成品名**：《谁在听》（英文副题 WHO'S LISTENING）；仓库代号 Girls Band Live（`girls-band-live`）。乐队「留声」，场馆 B2 旧货仓，本场曲目《再亮一会儿》。
- **形态**：桌面浏览器、离线单文件、`file://` 双击可玩；**零外部素材、零运行时网络请求**。
- **在线试玩**：https://yanyoo2000.github.io/girls-band-live/ （GitHub Pages + WebGL2；当前页面版本见页面内构建注释，v1.0.1 发布后为同一地址）
- **技术栈**：React 19 + TypeScript 5.9 + Three.js 0.186 + Vite 8（Vitest 5 单元测试）。
- **发布状态**：**v1.0.1 发布候选已通过最终审查（t147 PASS）**；GitHub Release 与 Pages 更新由制作人执行。v1.0.1 是 v1.0.0 的可读性/接线修复版，不改变 24 卡 / 3 构筑 / 3 进化 / 9:30 / 768 席 / 10 选等锁定数量。
  - 最终构建：`dist/girls-band-live.html` = 根 `index.html` = **1,084,885 B（1,059.5 KiB，1.034 MiB）**，SHA-256 `25422F523607DACF613CC660CDF629292FFFB5888F4CD4F9A36583A907099E51`（2026-10-28）。
  - 四命令：`typecheck` exit 0；`test` **30 文件 / 294 用例**；`build` 两次构建同 SHA；`validate` **14/14**。
  - 发布说明见 [release-notes-v1.0.1](docs/release-notes-v1.0.1.md)，最终产物/验证/已知限制见 [v1.0.1-release](docs/reports/v1.0.1-release.md)，检查表见 [docs/release-checklist.md](docs/release-checklist.md)。

---

## 给玩家

### 这是什么

《谁在听》把 Livehouse 变成一张注意力地图。你扮演主唱**江栖**：台下的 768 个座位既是你的观众，也是你的血条与弹药。你的光只有三个去向——**照亮观众**、**烧穿噪音**、**照回自己**；三者互斥，没有"免费的看"。

观众不是被杀死后掉落的经验，而是**被你的目光养出来的人**。你照亮谁，谁就为你唱；你越亮，循光而来的噪音也越多。一局 9 分 30 秒，结束时你要么把整座场馆点亮，要么一个人把剩余段落弹完。

### 如何打开单文件（推荐）

1. 取得单文件 **`dist/girls-band-live.html`**（发布后即 GitHub Release `v1.0.1` 的附件）。
2. 双击它，或拖进 **Chrome / Edge / Firefox**；也可以在 PowerShell 里执行：
   ```powershell
   start .\dist\girls-band-live.html
   ```
3. 需要 **WebGL2** 与硬件加速；窗口至少 1024×640，推荐 **1280×720 及以上**（更小会显示"窗口太小了"提示，可点"仍然继续"）。
4. **不需要联网、不需要安装、不写注册表**。游戏只在本机 `localStorage` 的 `gbl.save.v1` 里保存设置与最佳记录；删掉这条记录即可重置。

> 最终 v1.0.1 构建已在 Edge（`file://`，无 `?dev` 参数）验证：启动 → 主菜单 → 序曲三步教学 → 演出 → 升级 → 暂停/Tab 构筑 → 安可窗口 → 空场 → 结算 → 再演一场；全程 **console 0 条**、**Network 仅 1 条 `file://` 文档请求**。完整 9:30 局（含纯键盘 0 指针局）已跑通；预览版也可以用 `npm run dev`，但发行体验以单文件为准。

### 操作

| 操作 | 键鼠 |
| --- | --- |
| 移动主唱 | `W A S D` / 方向键 |
| 移动光 | 鼠标指针 / `I J K L` / 小键盘方向键 / `Shift`+方向键（光有 0.15s 惯性，要提前想） |
| 束光（按住） | 鼠标左键按住 / 按住 `Shift`；松手回到散光 |
| 点燃（脉冲） | 鼠标左键按下 / `Enter`（0.3s 脉冲，冷却 2 拍） |
| 回照（自保） | 把光移回主唱脚下 2m 内；形态格显示「回照 · 护盾」与冷却/独奏状态 |
| 插线（队友线断后） | 靠近队友按 `E`；HUD 会显示断线与插线提示 |
| 终曲「放下光」 | 长按 `Space` |
| 暂停 / 继续 | `Esc`（失焦/切后台会自动暂停；空场后也可暂停） |
| 查看构筑 | `Tab`（打开暂停面板并聚焦「当前构筑」；与 v1.0.0 不同，Tab 现在真的打开构筑） |
| 选卡 | 鼠标点击 / 数字键 `1` `2` `3` / `Enter` |

### 一局怎么进行（9:30）

| 时间 | 段落 | 你在做什么 |
| --- | --- | --- |
| 0:00–1:30 | 序曲 | **0–30s 三步不打断教学**：散光养人 → 束光烧人 → 点击点燃；开场 5 秒宽限、首次移动鼠标前不进入返听/过热；1:12 后排右端荧光棒亮起（等价钩子，见已知限制 8） |
| 1:30–3:40 | 主歌 | 第一次被噪音追；**2:00 第一次人浪** |
| 3:40–5:50 | 副歌 | 雪球；**5:00 第二次人浪**；第一次返听 |
| 5:50–7:40 | 桥段 / 静默 | 6:30 系统抽走声音；撑过 Boss「静默」三阶段 |
| 7:40–9:10 | 终曲 | **8:00 第三次人浪**；**8:50 长按 Space 放下光** |
| 9:10–9:30 | 结算 | 空位、真实数据、评级；按「再演一场」立即重开 |

### 核心规则（一句话版）

- **人气 = 血量 = 弹药**：观众总数同时是你的生命、输出与安可资本；局内 HUD **不显示任何数字**，改用四区亮灯比例、趋势箭头、空位/第二排剪影、「人气快见底」预警来读。
- **安可窗口**：人气归零且还有安可时，先弹出「人气告急」窗口（安可 / 继续独奏），不再直接空场；安可会把人气拉回峰值的一部分、四区热度各加一级。
- **掌声 = 经验**：转化 +1；点燃按拍点 +1/+2/+3；点燃击杀或合唱击杀 +1/只；人浪 +10；另有按人气系数给的基础演出经验。烧掉的噪音本身不给经验——这是「烧 vs 唱化」的核心取舍。
- **光的三形态**：散光（宽、慢）、束光（窄、强）、回照（自保，但每 4 拍人气 −1）；HUD 三格常驻，显示当前形态/护盾/冷却/独奏。
- **四座区 = 四声部**：四个座区分别对应根、三、五、七四个声部；每区 192 席，共 768 席。
- **养人即招灾**：每次人浪让天花板多裂一道缝，裂缝让噪音更多，逼你继续养人。
- **返听可解**：被返听锁定后，移光累计 ≥8m 或 7 秒兜底会自动挣脱；HUD 有耳朵标记与倒计时环。
- **白光**：人气相对本局峰值下降时，屏幕边缘会泛起白光；中央与 42% 半径内不遮挡舞台，边缘渐晕。

### 内容规模（GDD 锁定）

- 1 名可操作主唱 + 3 名队友（吉他 许燎、贝斯 闻笙、鼓 邵砚），4 个不靠立绘和配音的角色瞬间。
- 3 种光形态；4 个座区 / 4 个声部；**768 席**（24×32）。
- 3 种常规噪音（底噪 / 啸叫 / 失真）+ 1 名精英「返听」+ 1 个三阶段 Boss「静默」。
- **24 张卡池 / 单局最多 10 次三选一 / 3 条互斥构筑 / 3 个进化**（合唱流、独奏流、招灾流）；实测主动局 7–10 次三选一，进化可成型。卡牌 offer 含随机（单局不一定抽到某张特定卡，见已知限制）。
- 5 段、3 种灯光态、1 首固定曲（128 BPM、4/4、304 小节）、4 档评级（S/A/B/C）、3 种结局形状。
- 12 声部合唱池（4 区 × 3 层）、12 个音效；舞台、模型、材质、音乐全部程序化生成。

### 设置与无障碍

- 三路音量（总 / 音乐 / 音效）、高 / 低画质、**减少动态**、**高对比**、**节拍脉冲**、**低闪**。
- 支持键盘全流程（纯键盘 0 指针可完成 9:30）、可见焦点环、`prefers-reduced-motion`、`prefers-contrast`、`forced-colors`；**失焦/切后台自动暂停**；暂停即安全；暂停对话框背景 `inert`/`aria-hidden`。
- 小窗口（<1024×640）显示 ViewportGate，可「仍然继续 / 回主菜单」；HUD 文字 ≥11px，关键文本对比度实测 7.64 / 10.66 / 5.76。
- 无文本输入、无账号、无内购、无联网。

### 已知限制（v1.0.1 发布前请先读）

以下为 v1.0.1 发布时仍存在的限制（来源：[v1.0.1-release §5](docs/reports/v1.0.1-release.md)、[v1.0.1-rc §7](docs/reports/v1.0.1-rc.md)、10 人反馈与 t145/t146 复测），**不阻塞发布**。

1. **90 秒真人门未做**：AC-13 / AC-H01 需要 10 名外部新玩家，≥7 人在 90 秒内主动移光；当前只有 AI 试玩、冷启采样与 bot 埋点，**不能替代真人样本**。
2. **音频听感 / 盲听 A/B 未人测**：5 层音乐、12 声部合唱、12 个 SFX 的听感、静默段与"少一轨是否疼"尚未由人耳验证；v1.0.1 只修了参数/结构（空场 0.22 + 心跳、静默 16s 兜底、合唱 0.38、升级 duck）。
3. **性能未正式验收**：现有 1280–1920 渲染指标与 130fps 级采样（高端 GPU）；集显 3 局、1920×1080 完整、连续 3 局内存未正式测；Firefox 未实机。
4. **成长感偏薄 / 评级可达性**：主动局常到 9 选（第 10 次可能不来）；常规扫场+点燃约 160–170 人 = C，B 需终场 ≥300；峰值 >300 与 S/A 可达性仍 defer（评级刻度是刻意奖励养人/唱化，P1 待数据）。
5. **卡 offer 随机**：第二排 / 合唱墙 / 引线等特定卡在单局可能抽不到；两张 QA 复测局都没 offer，无法在实机逐张确认（单测 `modifier-wiring` 8/8 已覆盖消费方）；P1 考虑调权重或加进化进度提示。
6. **断线方位 / 点燃视觉**：断线后只有文字与「靠近队友按 E」，没有方位箭头；点燃是否命中拍点主要靠音效，瞄准点没有短闪（P1，未阻塞）。
7. **2.5s 唱化未调**：12HP 底噪在 24dmg/s 下仍约 0.5s 死亡；为避免破坏 F3/点燃手感，v1.0.1 未改 HP/伤害。
8. **W 边界构图**：v1.0.1 提亮后光池/观众可见，但走到舞台后侧时画面底部仍偏暗（未在 v1.0.1 专门调整）。
9. **H2 等价钩子位置**：1:12 荧光棒位于后区第一排最右端（back-right，1.7m），不是 GDD 原文第 24 排（固定相机看不到第 24 排）。
10. **whiteout 临界动画峰值**：HUD 内联静态上限 0.85，临界态动画峰值可达 0.957–1.000（表现层脉动）；`dwellRewardRatio` 负值 = 停住期人气净下降，属预期证据。
11. **其他未覆盖**：失败卡/中断局、三构筑各一局、三进化、S/A 评级边界、静默可读性、高对比/色觉复述未专门构造；仅桌面，不做移动端/触屏/手柄。
12. **命名 / 商标 / 许可证**：发布前需用户确认；GitHub Pages 在线版与 Release 附件以制作人发布为准。

---

## 给开发者

### 快速开始

```powershell
npm install          # 安装依赖（Node >= 20.19）
npm run dev          # Vite 开发服务器（默认 http://localhost:5173）
```

### 命令

| 命令 | 作用 | v1.0.1 实测 |
| --- | --- | --- |
| `npm run typecheck` | `tsc --noEmit`，覆盖 `src/**`、`tests/**`、`tools/**` | exit 0，0 错误 |
| `npm test` | `vitest run`，纯逻辑单元测试 | **30 个测试文件 / 294 用例**全过，无 skip/todo |
| `npm run build` | `tsc --noEmit` + `vite build` + `node tools/build-single.mjs` | exit 0；产出 `dist/girls-band-live.html` 与根 `index.html`，两者字节一致；两次构建同 SHA |
| `npm run validate` | 校验单文件自包含、必需 DOM、版本元信息、分层与确定性（R1–R14） | `validate: 14/14 rules passed（1059.5 KiB，sha256 25422f523607）` |
| `node tools/check-layers.mjs` | 额外分层检查（可选） | `84 files, 0 violations` |

- 构建产物：`dist/index.html` + `dist/assets/*` 是 Vite 常规中间产物；**发布物是内联后的 `dist/girls-band-live.html`**（同时复制为根 `index.html`，供 Pages 使用）。
- 版本标记：单文件内为 `<!-- girls-band-live v1.0.1 build:inline -->`；`package.json` version = `1.0.1`。
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
tests/              30 个 Vitest 文件（含 f3-bot、座位布局、UI 冒烟、modifier-wiring、audio-*）
tools/              build-single / validate / check-layers（零依赖 Node 脚本）
docs/               工作室文档（提案、讨论、评审、GDD、技术方案、验收、QA/反馈报告、发布）
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

- 68 项验收矩阵见 [docs/acceptance.md](docs/acceptance.md)；v1.0.1 在 acceptance §8 / GDD §26 / tech-spec §6.1/§19 同步了可见性、读数、键盘、失焦、最小窗口、空场流程与音频口径。
- **发布状态**：t147 最终审查 **PASS**（0 blocker/high）；t145 独立验证 16 pass / 0 partial / 3 blocked（人耳音频、跨硬件性能、Firefox）；t146 补齐纯键盘 9:30（0 指针、完成终曲/C、峰值 170）。
- 单元测试覆盖（v1.0.1）：30 文件 / 294 用例，含 F3 反驻守、768 席布局、UI 冒烟、modifier-wiring 8/8、audio-engine/silence/choir、开场宽限、结算口径等。
- 反馈来源：10 位外部试玩反馈汇总见 [feedback-roundup](docs/reports/feedback-roundup.md)，v1.0.1 优化决策见 [optimization-plan-v1.0.1](docs/optimization-plan-v1.0.1.md)；评分从 fun 5.0 / clarity 3.7 提升到 QA 复测 fun 6 / clarity 6。

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
| M7 发布 | v1.0.0 / v1.0.1 发行包装与发布记录 | [m7-release.md](docs/reports/m7-release.md)、[v1.0.1-release.md](docs/reports/v1.0.1-release.md)、[release-notes-v1.0.1.md](docs/release-notes-v1.0.1.md)、[CHANGELOG.md](CHANGELOG.md) |

### 更多文档

- [项目简报](docs/brief.md)：产品定义、设计支柱、硬约束、评审规则
- [工作室手册](docs/agent-handbook.md)：协作约定、代码契约、完成定义
- [制作计划](docs/production-plan.md)：36 人名册、M1–M7、质量门与 Git 流程
- [技术决策](docs/decisions/0001-project-setup.md)、[React + TS + Three 决策](docs/decisions/0002-react-ts-three.md)、[依赖策略](docs/decisions/0003-dependency-policy.md)、[仅桌面](docs/decisions/0004-desktop-only.md)、[最佳游戏优先](docs/decisions/0005-best-game-first.md)
- [10 人试玩反馈汇总](docs/reports/feedback-roundup.md)、[v1.0.1 优化计划](docs/optimization-plan-v1.0.1.md)、[v1.0.1 验证](docs/qa/verification-report-v101.md)、[v1.0.1 实机复测](docs/qa/playtest-report-v101.md)
- [M6 门禁](docs/reports/m6-gate.md)、[M6 发布候选](docs/reports/m6-rc.md)、[M7 发布记录](docs/reports/m7-release.md)
- [音频垂直切片报告](docs/reports/audio-slice.md) 与 [原型](prototypes/audio-slice.html)

### 原创、素材与许可证

- **零外部素材**：角色、舞台、观众、噪音全部由 Three.js 基础几何 + 程序化材质构成；音乐与音效 100% 由 WebAudio 合成；UI 用系统字体栈；无 `<img>` / `<audio>` / `<video>` / glTF / 字体文件 / CDN。
- `tools/validate.mjs` 的 R6–R9 会拒绝任何外部链接、字体与运行时联网调用；`legalComments: 'eof'` 保留 React / Three 的 MIT 声明。
- 运行时依赖：`react`、`react-dom`（MIT）、`three`（MIT）；构建/测试依赖均为 MIT / Apache-2.0。**项目自身许可证尚未选定**，发布前由用户确认（见 [发布检查表](docs/release-checklist.md)）。
- 角色、乐队、曲目、场馆、文案均为本项目原创；不使用现实乐队、歌曲、人物或既有 IP 素材。

---

**一句话**：一局结束时，你会知道——是你把这一屋子人养出来的，也是你把噪音招来的。
