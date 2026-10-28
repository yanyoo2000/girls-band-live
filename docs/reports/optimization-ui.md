# v1.0.1 P0/P1 UI：引导 / 形态 / 锁定 / 人气 / 卡面（t143）

- **执行者**：dev-ui
- **日期**：2026-10-28（Asia/Shanghai）
- **输入**：`docs/optimization-plan-v1.0.1.md`、`docs/reports/feedback-bug-audit.md`、t139 新字段、试玩 01/02/03/04/06/09/10 与 t135 无障碍报告
- **交付形态**：源码 + 单文件 `dist/girls-band-live.html`；不改 24 卡 / 3 构筑 / 3 进化 / 9:30 / 768 席 / 10 选 / 5 段 / 4 区 / 阈值，不新增依赖，不引入外部素材。

---

## 1. 结论

v1.0.1 UI 六项与三轮追加（失败败因、序曲三步教学、卡面进化进度、键盘等价光、sr-only 人气、最小窗口、失焦暂停、暂停同源）已全部落代码。

**四命令**：`typecheck` 0 错；`test` 30 文件 / 294 用例全过；`build` ×2 同为 **1,059.5 KiB / sha256 `cea5866dfd9a`**；`validate` **14/14**。

**未闭环项（必须在 t96/QA 真机复核，不写成已通过）**：
- **纯键盘 9:30 未在本自动化浏览器内完整跑完**。Chrome/Edge 自动化页在窗口失去前台时会被 rAF 节流，且三选一会冻结模拟；本机多次出现「时间 1.43 / 53 / 99 秒后不再前进」。已用真实键盘完成启动→序曲→暂停→Tab 构筑→设置→失焦自动暂停→空场暂停→结算的短链条；键盘移光/束光/点燃有单测与实机按键验证，但 **9:30 全程** 建议 qa-playtester 前台跑一局并截图，不要把本报告的短链条截图当作完整局证据。
- 空场结算截图中的数值来自 dev 快进，不是正常 9:30 流程；仅用于验证「3 条败因」布局。

---

## 2. 变更文件

| 文件 | 内容 |
| --- | --- |
| `src/App.tsx` | 引入 `ViewportGate`；结果/暂停/升级组件注入 bridge；屏幕路由保持 |
| `src/ui/bridge.ts` | 失焦自动暂停；Tab 打开构筑并聚焦；空场/终曲可暂停；结果保留最终 run 摘要（lineBreaks/进化）；曝光 `evolutionCardHints`、`lineBreaks`、`evolutionName`；新增字段比较 |
| `src/ui/input-dom.ts` | IJKL / 小键盘 / Shift+方向键移光；Shift 束光；Enter 点燃；虚拟 NDC 与鼠标互斥；失焦清输入 |
| `src/ui/components/Hud.tsx` | 三形态常驻三格 + 护盾/冷却/锁定；返听耳朵+倒计时环+解法；人气趋势/空位剪影/区亮灯比例；空场预警；三步教学；束光烧人红色边缘；断线可见提示；核心操作说明；谱面读数 |
| `src/ui/components/ViewportGate.tsx` | <1024×640 可交互提示：仍然继续 / 回主菜单 / Esc；Tab 焦点陷阱；`data-viewport-gate` 抑制路由快捷键 |
| `src/ui/components/CardPedal.tsx` | 删除 3 个无标签旋钮；文案 2 行截断；进化进度「还需 N 张支援」；aria 补全 |
| `src/ui/overlays/LevelUpOverlay.tsx` | XP 进度；等级/选择次数；注入进化提示 |
| `src/ui/overlays/PauseOverlay.tsx` | 当前构筑列核心/已选卡/进化；`data-pause-build` 焦点落点；`data-pause-settings` 焦点归还 |
| `src/ui/screens/ResultsScreen.tsx` | 失败/空场 3 条可读败因（人气/最空区/覆盖+离场+断线）；lineBreaks 从最终 run 摘要读 |
| `src/styles/ui.css`、`src/styles/base.css` | HUD 小字 ≤?→ ≥11px、对比 text-dim 7.64:1；新组件样式；小窗口紧凑布局替换 CSS 锁死 |
| `src/index.html` | 内联 SVG favicon，消除 404 |
| `tests/ui-smoke.test.tsx` | 5 个测试：全屏导航、HUD 教学/锁定/断线/烧人/无数字、升级/失败/结算、设置防抖、键盘 IJKL/Shift/Enter 映射 |

---

## 3. 六项需求落点

### 3.1 序曲 0–90s 教学（三步不打断）

`Hud.tsx` 的 `TutorialCoach` 在 `runSeconds < 30` 显示：
1. 散光养人：移动鼠标或 IJKL 移光；松开左键就是散光，被照到的人会留下来。
2. 束光烧人：按住左键或 Shift＝束光，光里的观众会被烧；松开才养人。
3. 点击点燃：点击或 Enter 点燃；落在拍点更亮。看哪里，噪音就从哪里来。

不拦截点击（`pointer-events:none`），30 秒后消失；不建教程墙。束光覆盖观众时 `hud--burning` 红色边缘 +「束光正在烧人 · 松开回散光养人」；HUD 底部有按键提示。

### 3.2 光形态指示

`LightState` 常驻「散光 / 束光 / 回照」三格，当前格高亮；回照时显示「独奏中」+ 护盾条；点燃冷却条；返听锁定时红色锁定条。拿核心后 `BuildStrip` 显示一行核心操作：
- 合唱墙：四区都养起来时，合唱波更响；散光养人。
- 回照：把光收回脚下，护盾亮起；此时不能转化。
- 引线：光停住的区会变成诱饵；那里更招噪音。

### 3.3 返听锁定

`ReturnLock` 在 `hud.returnLocked` 时显示耳朵 + 倒计时环 +「移光 / 断视线 / 烧掉它」；面板在 `hud__top` 内不遮挡舞台。解锁/烧掉时 bridge 推 `挣脱返听。光又归你了。` toast（`return-listener` 的 unlock/burn）。

### 3.4 人气 / 危险可读（仍 0 数字）

- 四区：形状点 + 每区亮灯比例微条；`zoneLightRatios` 只读。
- 人气：趋势箭头（▲/▼/■）+ 16 格空位剪影 + 第二排 8 格剪影；`audienceTrend/emptySeats/secondRowEmpty`。
- 预警：`audienceLow` 时顶部红条「人气快见底了」+ 可执行建议；`critical` 时白光脉动。
- sr-only：`HudLiveStatus` 以 aria-live 播报「人气上升/下降/持平、空场预警、光形态、四区热度、返听、断线」，只在内容变化时更新。
- 局内 DOM 文本扫描仍无数字；数值只以比例/方向/形状表达。

### 3.5 操作一致性

- 演出中 **Tab** 真正打开暂停面板，并把焦点送到 `[data-pause-build]` 的当前构筑；Esc 打开时焦点在「继续演出」。
- **空场**时 `canPause` 为 true：Esc/Tab 打开暂停，标题「空场暂停」，可重新开始/回主菜单/回到空场；不再卡死。
- 断线：右侧图标 + 底部可见「贝斯线断了 · 靠近队友按 E 插线」；`line` 事件 plugged 也提示。
- HUD 提示改为两行：`IJKL 移光 · Shift 束光 · Enter 点燃` / `Esc 暂停 · Tab 构筑 · Space 终曲`，与实现一致。

### 3.6 卡面 / 结算 / 暂停

- 卡面删除 3 个无标签圆旋钮；名称/效果（2 行截断）/代价/构筑色条/进化进度；XP 条 + 等级/第 N 次选择。
- 进化进度：bridge 按当前 offer 与已持有支援计算，卡面显示「还需 N 张支援 / 已满足，选它即进化 / 先选核心」。
- 暂停面板「当前构筑」列核心、全部已选卡、进化名，与 HUD 构筑条同源；设置返回暂停焦点回到「设置」。
- 结算新增「这一场为什么停在这里」3 条：人气（峰值/终场/空位/第二排）、最空区人数、覆盖/离场/断线次数。`RunResult.lineBreaks` 与 bridge 事件计数同源；局内账条与结算均读 store 回写的 `run.stats`。
- `src/index.html` 加内联 SVG favicon，file:// 与 http 均不再 404。

---

## 4. 无障碍追加（t135）

| 项 | 实现 | 验证 |
| --- | --- | --- |
| 键盘等价光 | IJKL / 小键盘 8/4/6/2 移光；Shift 按住束光；Enter 点燃；鼠标仍优先（pointermove 清除键盘持有） | `tests/ui-smoke` 键盘映射断言 `pointerNdc.x>0 / beamHeld / ignitePressed`；短局真实按键 |
| 人气/危险 sr-only | `HudLiveStatus` + 可见非数字仪表；趋势/预警/四区/返听/断线 | SSR DOM 文本无数字；屏幕阅读器树含趋势 |
| HUD 小字 | 所有 HUD 文案 ≥11px；hint 12px；颜色 text-dim `#9AA3B2` on `#0B0D12` = **7.64:1**；危险 5.76:1；琥珀 10.66:1 | 浏览器 `getComputedStyle` 实测：hint 12px、区名/账/段位 11px；对比公式计算 |
| 最小窗口 | `ViewportGate` <1024×640：仍然继续（紧凑布局）/ 回主菜单 / Esc；Tab 焦点陷阱；`data-viewport-gate` 阻止暂停/Tab 穿透；不再 `display:none` 锁死 | 900×560 实测截图；Esc 关闭；继续后菜单单列可滚动 |
| 失焦暂停 | bridge 监听 `visibilitychange`/`window.blur`，仅 playing 且无弹层时 `showPause`；调用 store.pause 冻结模拟/音频 | 覆写 `document.hasFocus=false` + blur 实测弹出暂停；levelup/failure/空场不叠加 |
| 暂停构筑同源 | 核心/已选卡/进化；设置返回焦点归还 | 实测焦点 `[data-pause-settings]`；空场暂停 `[data-pause-build]` |

---

## 5. 验证

### 5.1 四命令

| 命令 | 结果 |
| --- | --- |
| `npm run typecheck` | exit 0 |
| `npm test` | 30 文件 / **294 用例** 全过 |
| `npm run build` ×2 | 1,059.5 KiB；sha256 `cea5866dfd9a`（两次一致） |
| `npm run validate` | 14/14 |

### 5.2 UI 冒烟 / 键盘映射

`npx vitest run tests/ui-smoke.test.tsx` → 5 tests passed：
- HUD 三形态/教学三步/锁定/断线/烧人/人气仪表，且 playing 文本无数字；
- 全屏导航 7 屏；
- levelup/failure/results 事件链；results 3 条原因、断线 2 次；
- 设置防抖；
- IJKL → NDC、Shift → beam、Enter → ignite。

### 5.3 浏览器（file://，1280×720）

截图见 `docs/reports/optimization-ui-shots/`：
- `01-tutorial-after.png`：序曲教学/新 HUD（before：`docs/feedback/shots/playtester-04-art/03-开场演出.png`）
- `03-levelup-after.png`：去旋钮卡面 + 进化进度 + XP（before：`04-art/04-升级三选一.png`）
- `04-results-after.png`：完成结算（before：`04-art/10-散场之后结算.png`）
- `09-results-empty-reasons.png`：失败/空场 3 条败因布局（dev 快进）
- `05-pause-after.png`：Tab 构筑焦点
- `08-empty-house-pause.png`：空场 Esc/暂停
- `06-small-window-gate.png` / `07-small-window-menu.png`：<1024×640 可继续（before：`playtester-08-a11y/08-too-small.jpg`）

### 5.4 未完成 / 环境限制

- 9:30 纯键盘完整局：未完成（见 §1）。自动化窗口切前台/失去焦点时 rAF 被节流，局内时间会冻结；三选一也会冻结。已报告的短链条不冒充完整局。
- 空场结算截图是 dev 快进合成，不冒充真人 9:30。
- 未做 NVDA/VoiceOver 实机朗读；只按 a11y 树/aria 与 SSR 文本检查。
- 未做 150%/200% 浏览器缩放的逐像素复核；只做 900×560 viewport 等价验证。

---

## 6. 与 tech-spec / GDD 的偏差

1. `ViewportGate` 是组件级 modal（不是 types 新屏幕）；不改 `ScreenId`，避免类型契约扩散。
2. 空场暂停时 game 不接受 `pause`（store 只对 playing 相位 freeze），UI 只提供重开/回菜单/回到空场的出口；不伪造 freeze。
3. 键盘等价光采用 IJKL + Shift+方向键，而不是占用 WASD/方向键；Space 仍只给终曲长按。
4. HUD 在 GDD 六元素之外增加：构筑条、断线提示、教学、人气剪影、核心操作（均为加法，仍 0 数字）；GDD 的六元素全部保留。
5. 失败卡自动进结算仍为 5 秒（tech-spec 3 秒，验收 ≤6 秒；Esc 可跳）。

---

## 7. 风险 / 建议

1. **rAF 前台依赖**：自动化/后台窗口下 9:30 不推进，试玩必须前台。属浏览器行为，不是逻辑错误；建议 QA 前台跑。
2. **空场暂停**：game 层暂不支持 freeze 空场；UI 先给出口，若 QA 要求真正冻结，需 tech-director 扩 store 相位。
3. **进化提示**：只在有 `run.offer` 时计算；若 store 在空场仍弹三选一，UI 仍会显示（t139 的 `levelUpEnabled` 已加，建议 store 在空场不 emit 或 UI 过滤）。
4. **键盘瞄准精度**：NDC 步进 1.05/s，玩家可覆盖四区，但不如鼠标精细；建议真机试玩确认。
