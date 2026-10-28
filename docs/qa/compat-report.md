# M6 桌面兼容 / 无障碍 / 离线报告（t111 / qa-compat）

- **版本**：M6 候选版（2026-10-28）
- **作者**：qa-compat
- **范围**：`dist/girls-band-live.html`（单文件）在 `file://` 下的桌面兼容、键盘/鼠标、暂停/失焦、localStorage、减少动态/高对比、离线、控制台；**只写 `docs/qa/compat-report.md` 与 `docs/qa/shots/compat/**`，未改源码**
- **依据**：任务 t111 检查项、`docs/acceptance.md`（AC-T03/T05/T10、AC-13、AC-14–17 的浏览器侧）、`docs/gdd.md` §12（HUD）、§19（WebGL2）
- **不判定为失败**：移动端 / 触屏 / 窄屏手机（项目仅桌面；窗口 <1024×640 走"窗口太小了"提示）

---

## 0. 一句话结论

**桌面离线可玩性成立**：Chrome 156 在 1920×1080、1366×768、1280×720、2560×1440、1024×768、1920×1080@2x 六档（Edge 156 复测 1920×1080 与 1366×768）均无布局溢出、HUD 无越界、控制台 0 错误、网络仅 1 条 `file://` 文档请求；断网（CDP offline）下仍能完整启动到演出。

**2 项 high 缺陷需 M7 前修**：① 真实窗口缩放后 canvas/WebGL 视口不跟随（需刷新，Chrome/Edge 双复现）；② 高人气白光覆盖四边时四角区名/区点对比度跌破 WCAG AA（3.3:1 / 2.3:1，推算白光峰值 0.85 时约 1.8:1）。

---

## 1. 环境与产物

| 项目 | 实测值 |
| --- | --- |
| 操作系统 | Windows 10 x64，显示缩放 200%（`devicePixelRatio=2`） |
| 主浏览器 | Chrome 156.0.8078.48（独立 profile，`--remote-debugging-port=0`） |
| 交叉浏览器 | Edge 156.0.4314.42（独立 profile；UA 含 `Edg/156`） |
| Firefox | **未安装**（`Program Files` / `Program Files (x86)` / `where firefox` 均无），见 §6 |
| GPU | NVIDIA RTX 4080（D3D11，ANGLE） |
| 产物 | `dist/girls-band-live.html` = 根 `index.html` = **1,041,592 B**，`sha256 307d4e709c50d5c4e807cf171ce2dd8efeade9202ccb7967721dcc728bb85a7f` |
| 产物口径 | 与 t108 报告的 1,041,922 B / `9277a800…` 不同 → t108 之后又重建过；**本报告一切结论以此实测产物为准** |
| 驱动方式 | CDP（Node 24 全局 WebSocket），真实键鼠事件（`Input.dispatchKeyEvent` / `dispatchMouseEvent`），非 DOM 脚本点击；窗口缩放用 `Browser.setWindowBounds` |

---

## 2. 浏览器 × 分辨率矩阵

| 分辨率（CSS 视口） | Chrome 156 | Edge 156 | 溢出 | HUD 越界 | 窗口提示 | 证据 |
| --- | --- | --- | --- | --- | --- | --- |
| 1920×1080 | **PASS** | **PASS** | 0 / 0 | 0 | 无 | `chrome-1920x1080-menu.png`、`hud-regions-8s.png`、`chrome-1920x1080-pause-dialog.png`、`edge-1920x1080-*` |
| 1366×768 | **PASS** | **PASS** | 0 / 0 | 0 | 无 | `chrome-1366x768-{menu,playing}.png`、`edge-1366x768-*` |
| 1280×720（设计下限） | **PASS** | — | 0 / 0 | 0 | 无 | `chrome-1280x720-*.png` |
| 2560×1440 | **PASS** | — | 0 / 0 | 0 | 无 | 布局/Rect 实测（无截图，HUD 按 `min(560px,44vw)` 居中） |
| 1920×1080 @2x（HiDPI） | **PASS** | — | 0 / 0 | 0 | 无 | 布局/Rect 实测；canvas 有效 DPR 上限 1.5 |
| 1024×768 | **PASS**（临界） | — | 0 / 0 | 0 | 无（`max-width:1023` 未触发） | 布局/Rect 实测 |
| 800×600（低于支持） | **PASS**（提示正确） | — | 0 / 0 | — | **全屏提示** | `chrome-800x600-belowmin.png` |
| **真实窗口缩放**（1600↔1880↔1200） | **FAIL** | **FAIL** | 0 / 0 | 0 | 无 | `resize-playing-grow-to-1880.png`、`resize-playing-shrink-to-1200.png`、`edge-resize-playing-*.png` |

补充：375×667 等手机视口不在评测范围（项目仅桌面）；<1024 宽或 <640 高时 `.viewport-warning` 全屏接管、主屏 `display:none`（设计如此，不判失败）。

---

## 3. 检查项结果

### 3.1 布局不溢出

- 六档分辨率下 `documentElement.scrollWidth/scrollHeight` 与视口完全相等（溢出 0/0）；可见交互元素与 `.hud *` 无越界（越界计数 0）。
- 1366×768 下 danger 条仍为 486px 固定上限、四角区点 58×32；1920×1080 下 HUD 顶部条 `min(560px,44vw)` 居中。
- **仅"真实窗口缩放"一项失败**，见 HIGH-1。

### 3.2 键盘全流程与焦点可见

| 步骤 | 实测 |
| --- | --- |
| 启动屏 | 初始焦点在"点击开始"按钮（`autoFocus`）；**Enter 直接进入后台**，无需鼠标 |
| 主菜单 Tab 顺序 | H1（程序聚焦）→ 开始演出 → 今晚的曲目单 → 排练室 → 设置 → 制作名单 → 音量滑块 → 全屏/窗口 → BODY |
| 焦点可见 | 上述每个交互元素 `outline: solid 2px rgb(255,255,255)`（offset 2px）；skip-link 同样可见（`top:8px`，无 transform 隐藏） |
| 进入子屏 | Tab 到"今晚的曲目单" → Enter → `screen=setlist`，live region 播报"今晚的曲目单"；Esc 返回菜单 |
| 设置 | Tab 5 步到"减少动态"，**Space** 切换 → `data-reduced-motion=true`；再 1 步到"高对比"，Space → `data-high-contrast=true` |
| 演出内暂停 | **Tab 直接打开暂停**（`overlay=pause`），焦点落在"继续演出" |
| 对话框焦点陷阱 | 暂停面板连按 6 次 Tab：继续演出 → 重新开始 → 设置 → 回主菜单 → 继续演出 → 重新开始，**始终在 `[role=dialog]` 内**，且 outline 均可见 |
| 焦点归还 | 点击 HUD 暂停按钮（aria-label「暂停（Esc）」）→ Esc 关闭 → `document.activeElement` 回到 `.hud__pause` ✅ |
| 文本输入 | 无文本输入框；滑块可用方向键（原生 range） |

### 3.3 鼠标光与点燃

dev 模式（`?dev=1&seed=7`）读 `__gbl.store.getRun()`：

- 鼠标移到左上 (480,240)：`light.target` (4.899, 5.766)；移到右下 (1440,900)：`light.target` (-0.078, -0.304)，`light.mode: spread → self`，`lightCoverage 1 → 0` —— 光跟随指针、离开人群即降为自照。
- 左键按下：`light.igniteCooldown = 0.59`（点燃生效），松开后衰减 0.29。
- WASD/方向键：W 600ms → `player.z 1.6 → -0.61`（facing -1.571）；D 400ms → `x 0 → 1.473`；ArrowDown 300ms → `z → 0.523`。
- HUD 覆盖层 `pointer-events:none`（`.hud`），点击 HUD 按钮不会误点燃；canvas `pointer-events:none`，指针由 `#root` 接收（t108 修复生效）。

### 3.4 暂停 / 失焦 / 恢复

- Esc 暂停、Esc 恢复均正常；暂停面板文案含"停在 0:22"（`runSeconds` 冻结）。
- **失焦**：新建前台标签（`Target.createTarget`）→ 游戏页 `visibilityState=hidden`、`hasFocus=false`；1.8s + 1.5s 内 `data-run-seconds` 停在 3（**主循环冻结**）；切回（`Target.activateTarget`）→ `visible`，时间继续 3 → 5 ✅。
- 音频失焦降音由 `setAudioHostHidden` 处理（代码路径；听感未测，见 §6）。

### 3.5 localStorage 存档与刷新保留

- `gbl.save.v1` 结构：`{version, settings{master,music,sfx,quality,reducedMotion,highContrast,beatPulse,lowFlash}, records, unlocks}`。
- **Chrome 与 Edge 在 `file://` 下均可用**：改设置 → 写入 → `Page.reload` → `data-reduced-motion/high-contrast` 与 `.is-*` class 保留，JSON 内容一致。
- 损坏回退/备份（`gbl.save.v1.bad`）属于纯函数侧，由 t96 单测覆盖，本报告未重复。

### 3.6 减少动态

| 场景 | 实测 |
| --- | --- |
| 系统 `prefers-reduced-motion: reduce`（本机默认开启） | `--gbl-duration-fast/base/card/slow = 0ms`、`--gbl-motion-enabled: 0`、`--gbl-shake-enabled: 0`、按钮 `transition-duration: 0s`、`getAnimations()` 为空 |
| 强制 `no-preference` 对照 | `--gbl-duration-base: .18s`、motion/shake = 1 —— 证明"0ms"来自系统偏好而非代码写死 |
| 设置项"减少动态" | Space 切换 → `data-reduced-motion=true` + `.is-reduced-motion`（3D 侧 `renderer.setReducedMotion`：关闭闪屏、光锥脉动、屏幕震动） |

> 注：该测试机 Windows 关闭了"动画效果"，所以默认就处于减少动效状态；这不是缺陷，而是系统偏好被正确尊重。为验证正常动效另做了 `no-preference` 对照截图。

### 3.7 高对比

| 场景 | 实测 |
| --- | --- |
| 系统 `forced-colors: active` | `--gbl-glow-soft/strong/white: none`；`.app::before/::after` `display:none`；按钮变为系统色（白字、1px 白框、黑底）；菜单布局不溢出（`chrome-1920x1080-menu-forced-colors.png`） |
| 系统 `prefers-contrast: more` | `.ui-btn` / `.card-pedal` / `.settings-section` / `.menu-member` 边框 1px → **2px**（`chrome-1920x1080-menu-prefers-contrast.png`） |
| 设置项"高对比" | `data-high-contrast=true` + `.is-high-contrast`（2px 描边、背景更暗、四区加形状） |

> forced-colors 下 WebGL 舞台仍是原色（canvas 像素不受 CSS 强制颜色影响），属浏览器既定行为；UI 层已正确切换系统色。

### 3.8 闪烁（>3Hz）

- CSS 动画全集（演出中）：仅 `.zone-dot__shape` 的 `zone-wait`，周期 **900ms = 1.11Hz**。
- 临界态 `.hud--critical .whiteout` 为 `whiteout-pulse 2.2s`（**0.45Hz**）；`data-low-flash` 时 3.2s（**0.31Hz**）。
- 运行时采样（3s，391–394 帧，逐帧读 `opacity/background/transform`）：`.zone-dot__shape`、`.whiteout`、`.beat-ring`、`.segments__pip.is-current`、`.danger__lit`、`.hud__pause` 的 opacity 方向反转 **0 次/秒**、背景/变换变化 0 次/秒。
- 结论：**无 >3Hz 闪烁**；节拍相关表现由 128BPM（2.13Hz）驱动，低于阈值。

### 3.9 HUD 白光 / 四区点在低亮度下的可读性（像素实测）

取 1920×1080 截图做像素分析（区域外扩 12px 取背景中位数，区域内 97 分位取前景，WCAG 相对亮度）：

| 区域 | 白光 0（开局 8s） | 白光 0.312（90s） | 说明 |
| --- | --- | --- | --- |
| 区名「前左」（10px，`#9AA3B2`） | **7.55:1** | **3.32:1** ⚠️ | 低于小文本 AA 4.5:1 |
| 区名「前右」 | **7.72:1** | **3.37:1** ⚠️ | 同上 |
| 区形状·圆（左上前左） | 3.92:1 | 4.47:1 | 圆在白光下反而更亮（形状 `currentcolor` + 白光叠加） |
| 区形状·三角（前右） | **2.75:1** ⚠️ | **2.31:1** ⚠️ | 低于非文本 3:1 |
| 段名「序曲」（当前段） | 17.76:1 | 6.24:1 | 段块自带 `rgba(5,6,8,.58)` 底衬 |
| 危险条标签「目光」 | 7.60:1 | 4.68:1 | 临界达标 |
| 白光顶部带 | 1.43:1（无白光） | 5.07:1 | 白光自身可辨 |

- 证据：`hud-regions-8s.png`（白光 0）与 `chrome-1920x1080-90s-run.png`（白光 0.312），以及 3 倍放大裁切 `readability-zone-tl-whiteout0.png` / `readability-zone-tl-whiteout0312.png`、`readability-hud-top-*.png`、`readability-build-bl-*.png`。
- **结论**：低人气（暗场）时 HUD 对比度充足；人气升高、白光覆盖四边后，四角的区名与形状对比度显著下降（详见 HIGH-2）。由于 WCAG 对比度与屏幕绝对亮度无关，"暗室低亮度"下这一差距只会更明显（10px 小字）。
- 数据集：局内 HUD 可见文本含数字元素 **0 个**（进度用段点 + 弧、时间不显示数字，符合 GDD §12）；aria 侧 `aria-valuenow/valuetext` 正常提供。

### 3.10 WebGL2 不可用提示

- 用 `Page.addScriptToEvaluateOnNewDocument` 覆写 `HTMLCanvasElement.prototype.getContext`（webgl/webgl2 返回 null）后重载：`#root` 被替换为居中提示卡 —— **「无法开演」/「当前浏览器或显卡未提供 WebGL2。请使用最新版 Chrome / Edge / Firefox，并确认已开启硬件加速。」**；控制台 **0 条**消息；`#game-canvas` 保留但无上下文。
- 证据：`chrome-1920x1080-webgl2-unavailable.png`。文案与 `platform/webgl-support.ts` 一致，可直接指引用户。

### 3.11 WebGL 上下文丢失 / 恢复

- `WEBGL_lose_context.loseContext()` → 全屏提示 `role=alert` `aria-live=assertive`：「图形上下文已丢失：正在等待 GPU 恢复。若长时间未恢复，请刷新页面（F5）重新开演。」（`chrome-1920x1080-webgl-context-lost.png`）。
- `restoreContext()` → **260ms 内提示消失**，`webglcontextlost`/`webglcontextrestored` 事件均触发；恢复后 Esc 可正常暂停（面板显示"停在 0:22"），舞台重绘（`chrome-1920x1080-webgl-context-restored.png`）。
- 期间控制台出现 2 条 `THREE.WebGLRenderer: Context Lost./Context Restored.`（`console.log`，非错误，仅人工触发时出现）。

### 3.12 离线 / 无外链 / 无网络请求

- **真实断网**：`Network.emulateNetworkConditions{offline:true}` 后重新导航 → 完整走完 启动 → 主菜单 → 演出（`data-screen=playing`、`data-run-seconds=2`、HUD 存在、live region="演出"）；`requestWillBeSent` 仅 1 条 `file:///…/girls-band-live.html`，`loadingFailed` **0 条**，控制台 **0 条**（`chrome-offline-1920x1080-playing.png`）。
- 静态检查：产物 HTML **无** `<script src>` / `<link href>` / `<img src>` / `@import` 外部资源；正文出现的 `http(s)://` 仅为 React 错误文案、SVG/MathML 命名空间 URI 与 three 注释链接（不发起请求）。
- 全流程（Chrome/Edge）`Network` 累计只有文档本身，无字体/图片/音频/脚本外链。

### 3.13 控制台

- Chrome 全矩阵 + 键盘/鼠标/暂停/失焦/刷新/设置/离线：**0 条** console 消息、0 exception、0 `Log.entryAdded`。
- Edge 全流程：**0 条**。
- 只有手动触发 WebGL 上下文丢失/恢复时出现 2 条 three 的 info 级 log。

### 3.14 90 秒实测与帧率（附带证据）

用 dev 模式（`?dev=1&seed=7`）连续 92.2s、84 次采样：

- 段落：`overture` 在 **90.0s** 切到 `verse`（与 `data.segments` 0–90 一致，实时 90s）。
- HUD 状态：白光 0 → **0.312**（单调上升，未洗白）、四区热度 0 → 3（前左/前右）、`noisePressure` 0 → 0.017、`lightCoverage` 随移光 0–1 波动；屏幕始终 `playing`，无中断、无遮挡弹层。
- 帧率（1920×1080 视口、DPR 1、RTX 4080）：**130.3 fps** 均值、p50 7.6ms、p95 8.2ms、max 8.8ms（6s 窗口 783 帧）。
- 证据：`chrome-1920x1080-90s-run.png`。

---

## 4. 发现

| ID | 严重度 | 摘要 |
| --- | --- | --- |
| COMPAT-1 | **high** | 真实窗口缩放后 canvas/WebGL 视口不跟随，必须刷新 |
| COMPAT-2 | **high** | 高人气白光覆盖四边时，四角区名/区点对比度跌破 WCAG AA |
| A11Y-1 | medium | skip link 不在首次 Tab 路径；Enter 后焦点落 BODY |
| A11Y-2 | medium | 暂停对话框打开时背景 `main` 未 `inert`/`aria-hidden` |
| A11Y-3 | low | 启动屏单按钮，Tab 会把焦点移出文档（BODY） |
| A11Y-4 | low | `zone-dot__shape` 热度 0 时对比度 2.75:1（非文本门槛 3:1） |
| A11Y-5 | low | HUD 大量 9–10px 小字（区名/段名/构筑标签）在 1080p 下偏小 |
| ENV-1 | 观察 | 本机系统开启"减少动画"，CSS 动效默认 0ms（非缺陷） |

### COMPAT-1（high）窗口缩放后渲染视口不跟随

- **现象**：在 1600×1000 窗口启动后，把窗口拉大到 1880×1000，视口变为 1867×927，但 canvas 仍为 **1587×907**、buffer 2380×1360；舞台只占左上角，右侧/下方为纯黑，HUD（DOM）铺满视口 → 与舞台错位。缩到 1200×760 时 canvas 仍是 1587×907，画面被裁切。
- **双浏览器复现**：Chrome 156 与 Edge 156 一致（Edge 初始 1579×910，缩到 1179×670 / 放大到 1759×910 后 canvas 仍 1579×910）。
- **手动 `window.dispatchEvent(new Event('resize'))` 也不能修复**；把 `canvas.style.width/height` 改为 `100%` 后再触发 resize，canvas 立即跟随视口 → 根因锁定。
- **根因**：`src/main.tsx` 的 `resize()` 取 `canvas.clientWidth` 作尺寸；而 `three/renderer.ts` 的 `renderer.setSize(w, h, true)`（`updateStyle=true`）会把 canvas 内联成固定 px。下一次 resize 读到的是**已被写死的旧值**，形成自锁。刷新时 `canvas.clientWidth` 仍是样式表的 `100%`，故正常。
- **影响**：最大化/还原、拖拽窗口、分屏、任务栏变化、外接显示器切换后画面错位或裁切，属桌面常见操作。
- **修复建议**（1–2 行）：`resize()` 改用 `document.documentElement.clientWidth/clientHeight`（或 `window.innerWidth/innerHeight`）；同时把 `renderer.setSize(w, h, false)`（或保持 CSS `#game-canvas{width:100%;height:100%}` 不写内联样式）。改完复测：窗口 1600↔1880↔1200 下 canvas 的 CSS 尺寸、buffer 与视口一致。
- **证据**：`resize-playing-grow-to-1880.png`、`resize-playing-shrink-to-1200.png`、`resize-playing-before-1600x1000.png`（正常对照）、`edge-resize-playing-grow-1780.png`、`edge-resize-playing-shrink-1200.png`。

### COMPAT-2（high）高人气白光侵蚀 HUD 对比度

- **现象**：白光（`.whiteout`，四边 15vw/17vh 白色渐变）位于 HUD 内容之下（`z-index:1` vs `.hud__content:2`），人气升高时四角区名/区点被"洗"在亮背景上。白光 0.312 时区名对比度 3.32:1、三角形状 2.31:1；按同一线性关系推算白光峰值 0.85 时区名约 **1.8:1**（几乎不可读）。
- **影响**：玩家最需要读四区热度/区名的高人气阶段反而最看不清；暗室（低亮度环境）下 10px 小字更难辨。
- **修复建议**：给 `.zone-dot`（及四角 HUD）加暗色底衬（如 `rgba(5,6,8,.62)` 圆角块）或 `text-shadow: 0 1px 2px #000`；或在 whiteout 之上、HUD 之下加一层四角局部暗化渐变；白光 >0.2 时切 HUD 深色底（可复用 `.hud--critical` 的思路）。复测目标：白光 0.85 时区名 ≥4.5:1。
- **证据**：§3.9 对比度表、`readability-zone-tl-whiteout0312.png`、`chrome-1920x1080-90s-run.png`。

### A11Y-1（medium）skip link 不在首次 Tab 路径

- **现象**：进入主菜单后焦点被自动放到 H1（`tabIndex=-1`），此时按 Tab 从 H1 之后继续，**需要 9 次 Tab 才回到 skip-link**（实测 `steps:9`）。skip-link 本身可见（`top:8px`、白描边），Enter 后 `location.hash=#ui-stage`，但 `activeElement` 变 `BODY`（`#ui-stage` 无 `tabindex`），需再按一次 Tab 才落到"开始演出"。
- **影响**：键盘/读屏用户享受不到"跳到主要内容"的便利（虽然只有 5 个入口，影响有限）。
- **修复建议**：`#ui-stage` 加 `tabindex="-1"` 并在跳转后 `.focus()`；或将菜单初始焦点放到 main/skip-link 而不是 H1。
- **证据**：`flowsa.json`/`rects.json` 的 `skip1/2/3` 记录；`chrome-1920x1080-menu.png`。

### A11Y-2（medium）对话框未屏蔽背景

- **现象**：暂停/设置等 `[role=dialog]` 打开时，`main` 没有 `aria-hidden`/`inert`（焦点陷阱仅在键盘侧生效）。
- **影响**：读屏用户仍可"读到"被遮住的演出内容与 HUD 文本（live region 也在更新）。
- **修复建议**：Dialog 打开时对 `.app__screen` 与 HUD 容器加 `inert`（React 19 支持 `inert` 属性），或在 `Dialog` 组件内统一处理；live region 在 overlay 打开时只播报 overlay 标题（现已如此，保留）。

### A11Y-3（low）启动屏 Tab 焦点丢失

- 启动屏只有一个"点击开始"按钮，Tab 一次后 `activeElement` 变 `BODY`（再 Tab 会进地址栏）。建议 boot 屏也套一层焦点陷阱或直接提示"按 Enter 开始"。

### A11Y-4（low）热度 0 的形状对比度

- `zone-dot__shape` 基础 `opacity: .28`（`is-waiting` 动画到 0.5），粉/青/橙在近黑背景实测 2.75:1（三角）。建议最低不透明度提到能过 3:1（约 0.6），或统一加 1px 描边。

### A11Y-5（low）小字号

- 区名/段名/构筑 eyebrow 为 9–10px，在 1366×768 与 1080p 下偏小（对比度达标）。建议最小 11–12px 或随视口 `clamp()`。

### ENV-1（观察，非缺陷）

- 该机 Windows"动画效果"关闭 → `prefers-reduced-motion: reduce` 恒真，CSS 时长全 0。游戏设置里的"减少动态"是独立开关（控制 3D 层）。两者叠加正常；`no-preference` 对照截图见 `chrome-1920x1080-menu-normal-motion.png`。

---

## 5. 离线证据汇总

1. **断网启动**：`Network.emulateNetworkConditions{offline:true}` → `file://` 文档照常加载，进入演出并运行（§3.12）。
2. **零外链**：产物无外部 `script/link/img/@import`；`http(s)` 字符串仅命名空间/错误文案/注释。
3. **零网络请求**：Chrome/Edge 全流程 `Network` 仅 1 条 `file://` 文档请求（含 `?dev=1&seed=7` 的 dev 页面也只有自身）。
4. **存档本地化**：`gbl.save.v1` 在 `file://` 下读写正常，刷新保留（Chrome/Edge）。
5. **无失败请求**：`Network.loadingFailed` 0 条。

---

## 6. 未覆盖 / 限制

| 项 | 原因 | 建议 |
| --- | --- | --- |
| **Firefox 实测** | 本机未安装 Firefox（三处常见路径与 `where` 均无） | 若要补：安装 Firefox ESR 后按 §7 步骤复跑；静态审查未见 Firefox 风险（CSS 仅用 `scrollbar-width`/`clip-path`/`backdrop-filter`，无 `:has()`/`@container`/`color-mix()`；WebGL2/AudioContext/ResizeObserver 均支持） |
| Safari / WebKit | 项目声明桌面 Chrome/Edge/Firefox，未要求 | — |
| 移动端 / 触屏 / 竖屏 | 项目仅桌面（任务明确不列失败） | 窄窗口已有"窗口太小了"提示 |
| 读屏软件实测（NVDA/讲述人） | 环境无读屏 | 已做 ARIA 结构与焦点顺序检查；建议 M7 人测 |
| 真实暗室/低亮度显示器观感 | 无法物理改变环境亮度 | 已用 WCAG 对比度量化（§3.9）替代 |
| 9:30 全程（Boss/终曲/结算）双浏览器 | 时间预算；t108 已做 Chrome file:// 全程冒烟 | M7 回归时补 Edge 全程 |
| 音频延迟/听感/盲听 | 属音频专项（AC-18/F11），非本任务 | — |
| 非美式键盘布局 | 输入用 `KeyboardEvent.code`（物理键位），理论稳健 | 有条件时用法语 AZERTY 实机点一次 |
| 高 DPI 真机 | 用 DPR=2 emulation 测布局；canvas 有效 DPR 上限 1.5 | 4K 屏人眼复核 |
| 触控板/鼠标侧键 | 不在契约 | — |

---

## 7. 复现方式（本轮所用的方法）

1. **浏览器启动**：`chrome.exe --remote-debugging-port=0 --remote-allow-origins=* --user-data-dir=<临时 profile> --disable-backgrounding-occluded-windows --disable-renderer-backgrounding --disable-background-timer-throttling --mute-audio --window-size=1600,1000 about:blank`（Edge 同参数换 `msedge.exe`）。窗口必须可见，否则 Chrome 会把页面判为 hidden、rAF 停摆（本轮曾因此得到 `runSeconds` 不前进的假象）。
2. **连接**：读 `<profile>/DevToolsActivePort` 取端口 → `GET /json/list` → WebSocket → CDP。
3. **导航**：`Page.navigate` 到 `file:///D:/…/dist/girls-band-live.html`，等 `.app[data-screen="boot"]`。
4. **尺寸**：`Emulation.setDeviceMetricsOverride{width,height,deviceScaleFactor,…}` 做分辨率矩阵；`Browser.setWindowBounds` 做真实窗口缩放（HIGH-1 复现路径）。
5. **交互**：`Input.dispatchKeyEvent`（rawKeyDown/char/keyUp）与 `Input.dispatchMouseEvent`；焦点/属性/几何一律 `Runtime.evaluate` 读真实 DOM。
6. **媒体仿真**：`Emulation.setEmulatedMedia{features:[{name:'prefers-reduced-motion'…},{name:'forced-colors'…},{name:'prefers-contrast'…}]}`。
7. **离线**：`Network.emulateNetworkConditions{offline:true,…}` + `requestWillBeSent`/`loadingFailed` 计数。
8. **WebGL2 缺失**：`Page.addScriptToEvaluateOnNewDocument` 覆写 `HTMLCanvasElement.prototype.getContext`；上下文丢失用 `WEBGL_lose_context`。
9. **像素可读性**：`Page.captureScreenshot` → Pillow 取区域 97 分位前景 / 外扩 12px 背景中位数 → WCAG 对比度。

> 驱动脚本为临时工具（不在仓库内），仓库只保留本报告与截图，符合"只写报告与 shots"的边界。

---

## 8. 截图索引（`docs/qa/shots/compat/`）

**矩阵**：`chrome-1920x1080-{menu,pause-dialog,setlist}.png`、`hud-regions-8s.png`（1920×1080 演出画面）、`chrome-1366x768-{menu,playing}.png`、`chrome-1280x720-{menu,playing}.png`、`chrome-800x600-belowmin.png`、`chrome-window-resize-960x720-warning.png`、`edge-1920x1080-{menu,playing,pause}.png`、`edge-1366x768-{menu,playing}.png`

**窗口缩放缺陷（HIGH-1）**：`resize-playing-{before-1600x1000,grow-to-1880,shrink-to-1200,after-relooad-1880}.png`、`edge-resize-playing-{grow-1780,shrink-1200}.png`

**设置 / 存档 / 媒体仿真**：`chrome-1920x1080-settings-highcontrast-reduced.png`、`chrome-1920x1080-after-reload.png`、`chrome-1920x1080-after-refocus.png`、`edge-1920x1080-settings-persist.png`、`chrome-1920x1080-menu-{normal-motion,reduced-motion-media,forced-colors,prefers-contrast}.png`

**HUD 可读性**：`chrome-1920x1080-90s-run.png`、`hud-regions-8s.png`、`readability-{zone-tl,hud-top,build-bl}-whiteout{0,0312}.png`

**异常路径**：`chrome-1920x1080-webgl2-unavailable.png`、`chrome-1920x1080-webgl-context-{lost,restored}.png`、`chrome-offline-1920x1080-playing.png`、`chrome-1920x1080-playing-anim-audit.png`、`chrome-dev-1920x1080-playing-input.png`
