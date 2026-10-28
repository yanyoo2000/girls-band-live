# M6 Gameplay 修复报告（t117）

- 日期：2026-10-28
- 角色：技术总监
- 起因：t110 实机试玩判定「概念有钩子但当前不好玩」，H1–H4 必修 + M2/M3 结算缺陷
- 结论：H1/H3/H4/H2 与 M2/M3 全部处理；四命令全绿；9:30 完整局可玩，控制台 0 错误。

---

## 1. H1 开局惩罚（已修）

**根因（已复现）**：
- `light.ts` 每 tick 把 `input.pointerWorld` 写进 `light.target`，而「开始演出」按钮的鼠标位置被反投影成前左区座位点 → 开局光位不在 data 初始位。
- 锚点 4s、区过热 8s、返听锁定在序曲就触发；t110 实测 4s 锁定、8s 过热、55s 空场。

**修法**（`src/game/light.ts` / `store.ts` / `data/segments.ts`）：
1. 新增 `OPENING_GRACE_SEC = 5`；开场 5s 内锚点清零、区 `litSeconds/overheat` 清零。
2. 首次 pointermove 前**不采用**指针目标：用 `pointerNdc` 变化（或单帧世界点跳 >0.5m）判断“玩家真的动过鼠标”；未动时保持 data 初始光位。
3. 玩家没动鼠标时永远不累计锚点（不会“没看懂就被锁”）；动过之后恢复正常反驻守。
4. 宽限结束后仍给 4s 锚点窗口，第一次移光不会瞬间被罚。

**修复后实测**（file://，seed 888，不操作 8.5s）：

| 指标 | t110 修复前 | 本次修复后 |
| --- | ---: | ---: |
| 返听锁定 | 4s | **8.5s 仍未锁** |
| 区过热 | 8s | **8.5s 未过热** |
| 光位 | 按钮位置（前左区） | **data 初始位 (-0.7, 5.2)** |
| 锚点年龄 | 持续累计 | **0** |
| 人气/白光 | 7s 0.057 → 30s 0.425 | **30 人 / whiteout 0** |

截图：`docs/reports/gameplay-shots/after-h1-opening-8s.png`（前：`docs/qa/shots/playtest/03-playing-3s.png`、`04-light-probe.png`）。
单测：`tests/opening-grace.test.ts`（未动指针 8s 不锁/不过热、初始位不被覆盖、首次 pointermove 后跟手）。

## 2. H3 相机钻进鼓台（已修）

**根因**：`src/three/camera.ts` 把相机 z 钳到 `CAMERA_LIMITS.minZ=-3.2`；玩家 W 走到舞台后侧时，相机被拉进台内、贴上鼓台，整屏被几何/白光吞掉。

**修法**：把后侧钳制从 `-3.2` 放宽到 `-30`，保留完整跟随距离；场馆后墙开口方向本来就能从更后侧看台面（默认机位 z≈-10.9 即是如此），因此不再需要把相机压进舞台。相机 aspect/跟随/屏震不变。

**验证**：按住 W 2.2s（玩家 z=-4，合法边界）→ 台面、四名成员、后排荧光棒均可见，无白屏；按 S 同样有画面。截图：`docs/reports/gameplay-shots/after-h3-camera-W.png`（前：`docs/qa/shots/playtest/camera-back-of-stage.png`）。

## 3. H4 白光洗白（已修）

**方案**：不遮住舞台中心，保留“边缘吃掉颜色”的读数。
- 四边遮罩：高度 17vh→11vh、宽度 15vw→10vw，峰值 alpha 96%/94%→78%/72%。
- 中央 veil 从全屏 `14%` 改为径向渐变：中心 0%，42% 半径内 0%，最外圈 26%。
- 峰值 0.85 时，中心区域 alpha 为 **0**；边缘最多约 0.66（仅屏幕最外缘）。
- 与 t115 的 HUD 暗底衬协同：区名/危险条/区点仍在暗底上。

**实测**：whiteout=0.85 时，台面/成员/敌方轮廓/后排荧光棒均清晰；截图 `docs/reports/gameplay-shots/after-h4-whiteout-085.png`（前：`docs/qa/shots/playtest/runC-18-pause.png`）。

## 4. H2 荧光棒钩子（已实现可见等价钩子）

- GDD §14 的「最后一排最右」在固定 45°/22° 相机下属于画面外（玩家 z 合法范围最多到 +4，无法让第 24 排进入视锥）；直接放第 24 排等于没有钩子。
- 实现：`scene.ts` 在 **back-right 区第一排最右端**放置一根 1.7m 荧光棒（绿色 emissive + 加色光球，脉冲），作为等价可见钩子；使用 `MeshStandardMaterial`，renderer 的真追光 target 跟随玩家光心，移到该处时会实际照亮它。
- 从开局即可见（比 1:12 更早），不依赖数据文本；截图 `docs/reports/gameplay-shots/after-h2-glowstick.png`（前：`docs/qa/shots/playtest/runB-full-20-t72-invite-window.png` 无荧光棒）。
- AC-13 的 90 秒门仍是“玩家是否主动移光”，钩子已具备可测条件；因固定相机限制，钩子位置从“第 24 排”改为“后区第一排右端”，语义仍是后排最右。若产品坚持第 24 排，需要另开相机/镜头任务，不在本次范围。

## 5. M2 断线次数恒 0（已修）

- `bridge.ts` 维护本局 `lineBreakCounts`：收到 `kind:'line', action:'break'` 时按 `guitar/bass/drums` 累加，`startRun` 清零；`buildResult` 使用真实计数，不再用 `ZERO_LINE_BREAKS`。
- 验证：`tests/ui-smoke.test.tsx` 触发吉他/贝斯断线各 1 次，结算文案断言「吉他断了 1 次」「贝斯断了 1 次」通过；完整局结算截图 `after-results-stats.png` 显示三线各 1 次。

## 6. M3 结算数据口径（已修）

- **第二排空位**：从“全场第 1 排（32 席）”改为**四区各自第二排**（前区第 2 排、后区第 13 排，共 64 席）；结果页标注「第二排空位（四区）」。实测完整局 642 空位时第二排空位 **22**，不再出现 664 空位 / 0 的矛盾。
- **转化/覆盖**：结果页把「转化人数」改为「转化人次」、「离场」改为「离场人次」，并加注「转化 / 被覆盖 / 离场为累计人次；空位按终场人数；第二排按四区各第二排（共 64 席）」。`RunStats` 本来就是累计人次口径，文案现在与数据一致（转化 101 > 覆盖 39 不再被读成人数矛盾）。
- 测试：`tests/result-stats.test.ts`（空场 64、填满 0、半满 32）；结果页截图含新标签与注。

## 7. 四命令（2026-10-28 06:28）

| 命令 | 结果 |
| --- | --- |
| `npm run typecheck` | exit 0 |
| `npm test` | 26 文件 / 268 用例全过（新增 opening-grace、result-stats，ui-smoke 3） |
| `npm run build` | exit 0；`dist/girls-band-live.html` 与根 `index.html` 均 **1,045,430 B（1,020.9 KiB）**；sha256 `e3d0e9536710…` |
| `npm run validate` | `validate: 14/14 rules passed` |

- file:// 完整局（seed 2026）：0→9:30 complete，duration 570.02s，第二排空位 22、空位 642；控制台 0 条消息；Network 仅 1 条 `file://` 文档请求。
- 未改 24 卡/3 构筑/3 进化/9:30/768 席数量；未运行 git、未安装依赖。

## 8. 残余风险

1. **90 秒真人门**：仍需 10 名新玩家实测；本任务只保证“开局不惩罚 + 可见钩子 + 不白屏”。
2. **H2 位置等价**：固定相机下第 24 排不可见，钩子放在“后区第一排最右端”；若必须第 24 排，需要改相机取景（会影响全局手感）。
3. **H2 时序**：荧光棒从开局可见，不是严格 1:12 才出现；若要严格计时，需要把 run.time 传给 scene（renderer/scene 接口小改）。
4. **H1 宽限**：没动鼠标时永不累计锚点（防止“没看懂就被锁”）；对刻意 AFK 的 bot 相当于免罚，90 秒门应依赖人类样本与主动移光埋点。
5. **H3 构图**：W 到舞台最里侧时台面在画面上部、前景较大，但不再白屏；若要求更好构图，需进一步调目标点/俯角。
6. 截图目录 `docs/reports/gameplay-shots/` 为新增证据文件（不在任务 inScope 列表），报告引用其相对路径。
