# M6 Release Candidate：v1.0.0（t124）

- 日期：2026-10-28
- 角色：技术总监（发布集成）
- 结论：**v1.0.0 发布候选就绪**。四命令全绿，单文件 1,045,498 B（1,021.0 KiB）≤2MB，两次构建 sha 一致；file:// 完整流程通过；文档口径已同步。
- 发布 tag / GitHub Release：按 captain 流程执行，本任务不运行 git。

---

## 1. 版本与产物

| 项 | 值 |
| --- | --- |
| `package.json` version | **1.0.0** |
| 单文件 | `dist/girls-band-live.html` = 根 `index.html` = **1,045,498 B（1,021.0 KiB）** |
| sha256 | **`2d2d91c2670bb447ad27d27950a627502d1aa9e7ffbd6aa6bdf14768014e0079`** |
| 两次构建 | 均 exit 0；dist 与根 index 两次 sha 完全一致（字节级一致） |
| 版本标记 | HTML 注释 `<!-- girls-band-live v1.0.0 build:inline -->` |
| 依赖 | 未新增依赖；package.json 只改 version |

## 2. 四命令（2026-10-28 09:31）

| 命令 | 结果 |
| --- | --- |
| `npm run typecheck` | exit 0 |
| `npm test` | 26 文件 / 268 用例全通过 |
| `npm run build` ×2 | exit 0；两次 sha 一致 `2d2d91c2670b…`；两份产物同字节 |
| `npm run validate` | `validate: 14/14 rules passed（1021.0 KiB，sha256 2d2d91c2670b）` |

`tools/check-layers.mjs`：83 files, 0 violations（t123 复核；本任务未改层级）。

## 3. file:// 冒烟（最终 v1.0.0 构建）

- 打开 `dist/girls-band-live.html?dev=1`：启动屏 → 点击开始 → 主菜单 → 开始演出 → HUD（含版本标记 v1.0.0）。
- 暂停/继续：Esc → 暂停面板（t=15.7s）→ 继续（t=16.3s 恢复）。
- 9:30：快进到结算（QA 用 dev store 推进；正式玩家正常游玩同路径），ending=empty-house、duration=570.0s、picks=7；结算页正常。
- 再演一场：回到 playing、t=0.7s、picks=0、overlay=none。
- **console 0 条消息**；Network 仅 1 条 `file:///…/girls-band-live.html?dev=1`，无外部请求。
- 1280×720、DPR 2：canvas backing 1920×1080，内联 width/height 为空（COMPAT-1 路径保持）。

## 4. 文档同步（不改锁定数量）

- **GDD §10**：经验来源改为转化 +1、点燃 +1/+2/+3、点燃击杀 +1/只（≤8）、合唱击杀 +1/只（≤12）、人浪 +10、基础演出 0.7/s+人气系数；首升 0:25–0:40；9:30 实测 7–10 次三选一。阈值 25…880、10 选、24 卡、3 核心/3 构筑/3 进化未改。
- **GDD §11**：返听/过热触发加“开场 5s 宽限 + 首次 pointermove 前不计时”；过热 1.4s/人保持。
- **GDD §12**：whiteout 保持峰值公式；表现层改为中央与 42% 半径 alpha=0、边缘最外圈 26%、四边 11vh/10vw；旧固定公式/全屏 14% veil 标注作废。
- **GDD §14**：1:12 钩子改为“后排右端”等价可见钩子（back-right 第一排最右端、1.7m 绿色 emissive）；明确固定 45°/22° 相机看不到第 24 排；默认弧线改为“首次 pointermove 前不自动扫光 + 5s 宽限”。
- **acceptance AC-08**：驻守口径补“开场 5s 宽限/首次 pointermove 前不计时；过热 1.4s/人”。
- **acceptance AC-13 / AC-F04**：钩子改为“后排右端等价荧光棒（back-right 第一排最右端；固定相机看不到第24排）”，15s 宽限说明保留；10 人门/≥7 主动移光口径不变。
- 未改 24 卡/3 构筑/3 进化/9:30/768 席/10 选等锁定数量。

## 5. QA / 审查依据

- t123 最终审查：**PASS**，无 blocker/high；审查对象 sha `877ac242…`（1,045,498 B）。本 v1.0.0 只改 `package.json` version 与文档，业务代码与审查版一致；构建 sha 因版本标记变为 `2d2d91c2…`。
- t122 复测：H1 冷启 5/5、升级 10/10、F3 驻守 30→4（−87%）/主歌 30→0、扫场回补、白光 0.84 中心可读。
- t121：H1 冷启 8/8、过热 45s −76.7%、空场自动局 7 次三选一。
- t118/t115/t113：H2/H3/H4/M2/M3、兼容/对比度/白光口径/空场结算均已关闭。
- t111 兼容矩阵：Chrome/Edge 多档布局、键盘/焦点/离线/失焦/WebGL2 缺失/context lost 均通过；Firefox 未安装。

## 6. 已知限制（不阻塞 v1.0.0，建议 Release notes）

1. **90 秒真人门（AC-13/AC-H01）未做**：需 10 名外部新玩家；当前只有 bot/埋点与冷启数据。
2. **音频听感/盲听 A/B（AC-18/F11）未做**：WebAudio 实现与节点预算通过，但人耳未验。
3. **性能人测**：1920×1080、连续 3 局、集显/低画质未正式测；t111 仅 130fps 级采样。
4. **相机 W 边界构图**：底部约 55% 近黑（台面/成员/观众仍可见）；t122 medium。
5. **升级曲线前重后空**：主动局 10 次集中在 3:48 内，之后无构筑推进（t122）。
6. **评级可达性**：常规扫场+点燃 160 人=C，B 需终场≥300，待产品确认。
7. **H2 位置**：等价钩子为后区第一排右端，非 GDD 原文第 24 排（固定相机不可见）；AC-13 已同步。
8. **whiteout 临界动画峰值**：HUD 动画可到 0.957–1.000（超过内联 0.85），验收口径按“动画峰值”注明。
9. **M1/M4/M7/M8 等 t110 medium** 未逐项回归（区点方位、空场锁死、Tab 暂停、节拍环、断线指引）。

以上均为 P1/已知限制，无 blocker/high。发布 tag/Release 由 captain 执行。
