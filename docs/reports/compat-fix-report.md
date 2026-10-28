# M6 兼容修复报告：窗口缩放与白光下 HUD 对比度（t115）

- 日期：2026-10-28
- 角色：技术总监
- 结论：COMPAT-1 / COMPAT-2 两个 high 均修复；顺带关闭 t111 的 4 个 medium（skip link、暂停 inert、boot Tab 陷阱、heat-0 区点对比度、HUD 小字）。
- 四命令全绿；单文件 1,017.2 KiB（1,043,675 B）；`file://` 正常；两次构建 sha 一致。

---

## 1. COMPAT-1：窗口缩放不跟随（已修）

### 根因
- `src/main.tsx` 的 resize 读 `canvas.clientWidth/clientHeight`；
- `src/three/renderer.ts` 的 `applySize()` 用 `renderer.setSize(w,h,true)` 把内联 px 写回 canvas；
- 窗口缩小后 `canvas.clientWidth` 仍是上一次的内联大值 → 读数自锁；窗口放大也同样拿旧值。CSS 的 `width:100%` 被内联样式覆盖，backing store/WebGL viewport/相机 aspect 全部停在旧尺寸。

### 修法
1. **尺寸源**：`main.tsx` 只读 `document.documentElement.clientWidth/Height`（回退 `window.innerWidth/Height`），不再读 canvas。
2. **backing store + CSS 分工**：`renderer.applySize()` 先清掉 canvas 内联 width/height，再 `renderer.setSize(w,h,false)`；CSS 继续负责 `#game-canvas { width:100%; height:100% }`。
3. **事件覆盖**：`resize` / `orientationchange` / `fullscreenchange` / `visualViewport.resize` / `ResizeObserver(documentElement)` / `matchMedia('(resolution: Xdppx)')` DPR 变化；事件同步应用，不依赖 rAF（后台窗口 rAF 被节流时也不会假死）。
4. **每帧兜底**：loop 的 `onStats` 每帧比较一次视口与 DPR，发现漂移补一次 `applyViewport()`（覆盖宿主不派发 resize 的情况）。
5. `renderer.resize` 内同时更新 `fallbackCamera.aspect` 与 `bound.camera.resize()`，相机 aspect 跟随。

### Chrome 实测（file://?dev=1，实时拖拽/模拟窗口，无刷新）

| 目标窗口 | innerWidth×innerHeight | canvas CSS | backing store | WebGL viewport | DPR |
| --- | --- | --- | --- | --- | --- |
| 1280×720 | 1280×720 | 1280×720 | 1920×1080 | 1920×1080 | 2（有效 1.5） |
| 1920×1080 | 1914×958（OS 边框） | 1914×958 | 2871×1437 | 2871×1437 | 2（有效 1.5） |
| 1366×768 | 1366×768 | 1366×768 | 2049×1152 | 2049×1152 | 2（有效 1.5） |
| 1880×1000 | 1880×958 | 1880×958 | 2820×1437 | 2820×1437 | 2（有效 1.5） |
| 1200×700 | 1200×700 | 1200×700 | 1800×1050 | 1800×1050 | 2（有效 1.5） |

- 每次 resize 后 `css === inner`、`viewport === backing`；无黑边/裁切；画面无拉伸（1280 与 1920 截图对比）。
- 控制台 0 条错误。

### Edge 实测（headful Edge 156，CDP `Browser.setWindowBounds` 真实窗口尺寸）

| 外侧窗口 | innerWidth×innerHeight | canvas CSS | backing store | WebGL viewport |
| --- | --- | --- | --- | --- |
| 1280×720 | 1259×630 | 1259×630 | 1888×945 | 1888×945 |
| 1920×1080 | 1899×990 | 1899×990 | 2848×1485 | 2848×1485 |
| 1366×768 | 1345×678 | 1345×678 | 2017×1017 | 2017×1017 |
| 1600×900 | 1579×810 | 1579×810 | 2368×1215 | 2368×1215 |
| 1880×1000 | 1859×910 | 1859×910 | 2788×1365 | 2788×1365 |
| 1200×700 | 1179×610 | 1179×610 | 1768×915 | 1768×915 |
| 1280×720 | 1259×630 | 1259×630 | 1888×945 | 1888×945 |

- Edge 的 `css === inner`、`viewport === backing`（DPR 2，有效 1.5）；连续放大→缩小→再放大无需刷新；`Runtime.exceptionThrown` / `Log.error` 均为 0。
- 说明：自动化 Edge 窗口若被系统判定为 hidden/occluded，Chromium 会冻结视口布局（`document.hidden=true` 时连 resize 都不派发）。测试时用 `--disable-features=CalculateNativeWinOcclusion` 让窗口保持 visible；真实用户前台窗口不受影响。这是测试环境限制，不是游戏逻辑。

---

## 2. COMPAT-2：白光峰值下四角/危险条对比度（已修）

### 方案：暗底衬 + 文本提亮 + 区点最低不透明度
- `.whiteout` 仍在 HUD 内容之下（z1 vs z2），保留“白光从边缘吃掉颜色”的读数；**不把标签移出遮罩**。
- 当 `hud.whiteout > 0.2` 时给 `.zone-dot` 与 `.danger` 加 `rgb(5 6 8 / 88%)` 暗底衬、1px 高光描边、投影；区名/危险标签用 `#edeff2` + 文字阴影。
- 区名/危险标签/段位点字号 10→11px，提高小字可读性。
- 区点形状最低不透明度 0.28→0.8（heat-0），heat1/2/3 相应 0.86/0.92/0.97；亮度差交给 glow/ring，避免“热度 0 看不见”。

### 对比度实测（WCAG 相对亮度公式；像素从截图中值采样）
截图证据：`docs/reports/compat-shots/`（before/after 1280/1920 与 0.312 状态）。

| 状态 | 区名 vs 背景 | 危险标签 vs 背景 | 区点（heat-0）vs 背景 |
| --- | ---: | ---: | ---: |
| 修复前 1280（whiteout 0.85） | **1.34:1** | **2.72:1** | **1.01:1** |
| 修复前 1920（whiteout 0.85） | **1.48:1** | **1.70:1** | **1.02:1** |
| 修复后 1280（whiteout 0.85） | **14.80:1** | **16.53:1** | **7.72:1** |
| 修复后 1920（whiteout 0.85） | **14.64:1** | **16.14:1** | **7.30:1** |
| 修复后 1280（whiteout 0.312） | **16.40:1** | **17.09:1** | **5.06:1** |

- 文本全部 ≥4.5:1（远高于 AA）；区点图形 ≥3:1（0.312 时 5.06、峰值 7.3–7.7）。
- 截图文件：
  - `docs/reports/compat-shots/before-whiteout-1280.png`
  - `docs/reports/compat-shots/before-whiteout-1920.png`
  - `docs/reports/compat-shots/after-whiteout-1280-final.png`
  - `docs/reports/compat-shots/after-whiteout-1920-final.png`
  - `docs/reports/compat-shots/after-whiteout-0312-1280.png`

---

## 3. 顺手关闭的中危（t111）

| 问题 | 修法 | 证据 |
| --- | --- | --- |
| skip link 经 H1 需 9 次 Tab、Enter 后焦点落 BODY | `main#ui-stage` 加 `tabIndex=-1`；skip link onClick 阻止默认并 `focus()`；`.app__screen:focus` 不画整屏 outline | 点击 skip link 后 `document.activeElement.id === 'ui-stage'` |
| 暂停 dialog 背景仍可聚焦 | overlay 打开时 `main` 加 `inert` + `aria-hidden="true"`；Dialog 已有焦点陷阱 | Esc 后 `mainInert=true`、`aria-hidden=true`、焦点在「继续演出」；Tab 在 dialog 内移动 |
| boot 屏 Tab 跑出文档 | BootScreen `onKeyDown` 把 Tab 锁在启动按钮 | boot 上 Tab 后 activeElement 仍为「进入后台/点击开始」 |
| zone-shape heat-0 2.75:1 | 基础 opacity 0.8 + 暗底衬（同上），实测 5.06–7.7:1 | 见对比度表 |
| HUD 9–10px 小字 | 区名/危险标签/段位点 11px，区名 600 字重 | 计算样式 `font-size:11px` |

`tests/ui-smoke.test.tsx` 新增断言：playing 时 `hud--whiteout`、`id="ui-stage" tabindex="-1"`、无 overlay 时不 inert；levelup 时 `inert=""` + `aria-hidden="true"`。

---

## 4. 四命令（2026-10-28 05:46）

| 命令 | 结果 |
| --- | --- |
| `npm run typecheck` | exit 0 |
| `npm test` | 24 文件 / 264 用例全过（含 ui-smoke 3、f3-bot 4、seat-layout 21） |
| `npm run build` ×2 | exit 0；两次 sha256 一致 `a220c425a6a00b5f…df52d4`；dist 与根 `index.html` 均 1,043,675 B（1,017.2 KiB） |
| `npm run validate` | `validate: 14/14 rules passed`（1,017.2 KiB，sha256 `a220c425a6a0`） |

- `file://?dev=1`：启动→主菜单→开始演出→暂停（inert 生效）/继续；控制台 0 条消息；Network 仅 1 条 `file://` 文档请求。
- 未改 F3/座位/记录规则；未新增依赖；未运行 git。

## 5. 残余风险

1. **DPR 上限 1.5**：2× 屏仍按 1.5× 渲染（既有性能策略），不是本次回归；如需全 DPR 需单独放宽并复测性能。
2. **多显示器拖拽/系统缩放变化**：已监听 `matchMedia(resolution)` + 每帧兜底，但本次仅自动验证了窗口尺寸与 headless DPR 变化，真实多屏拖拽仍建议 QA 做一次人工确认。
3. **Edge 自动化可见性**：自动化窗口被判定 hidden 时 Chromium 冻结视口；真实窗口无此问题。测试参数已记录，避免 QA 复现时误判。
4. **截图目录**：`docs/reports/compat-shots/` 是本次新增的证据文件（不在任务 inScope 列表），报告引用其相对路径；若仓库要求“只允许改指定文件”，可在归档时删除图片，保留本报告数值。
