# 制作计划 / Production Plan

- **工作室**：Girls Band Live Studio（35 人）
- **项目**：少女乐队 × 吸血鬼幸存者，原生 HTML
- **制作人（captain）**：负责编排、Git 提交、里程碑、发布与对外沟通
- **仓库**：`yanyoo2000/girls-band-live`（开发期私有；公开发布需用户确认）

---

## 1. 组织名册（35 人）

### 1.1 管理层（4）

| 成员 | 角色 | 主要职责 |
| --- | --- | --- |
| `producer` | 制作人 | 里程碑报告、创意计票与定案、范围控制、最终验收 |
| `creative-director` | 创意总监 | 交叉讨论主持、三案融合、GDD 主笔 |
| `tech-director` | 技术总监 | 技术方案与接口契约、候选版集成、发布集成 |
| `art-director` | 美术总监 | 美术方向、主题样式与 SVG 资产、视觉一致性 |

### 1.2 策划组（10）

| 成员 | 创作方向 |
| --- | --- |
| `planner-narrative` | 叙事与角色关系：把成员矛盾变成局内机制 |
| `planner-roguelike` | Roguelike 数值：构筑、进化树、风险收益、波次曲线 |
| `planner-atmosphere` | 氛围与视听：灯光、观众情绪、音乐驱动的舞台 |
| `planner-fusion` | 玩法融合：节奏/音游/塔防，但保留自动攻击 |
| `planner-community` | 二次元社区：角色魅力、名场面、传播性，规避同人雷区 |
| `planner-arcade` | 复古街机：连击、分数、短局高密度爽感 |
| `planner-minimal` | 极简与资源：单机制深度、低成本高辨识度 |
| `planner-liveops` | 长线运营：巡演/曲目/粉丝值，但 MVP 必须收敛 |
| `planner-experimental` | 反套路实验：颠覆幸存者公式的机制 |
| `planner-newbie` | 新手友好：可读性、学习曲线、移动端 |

### 1.3 评审与打分（10）

| 成员 | 角色 |
| --- | --- |
| `critic-fun` | 玩法乐趣评审 |
| `critic-feasibility` | 工程可行性评审 |
| `critic-player` | 玩家价值 / 主题表达评审 |
| `judge-hardcore` | 硬核幸存者玩家 |
| `judge-musicfan` | 音游 / 乐队粉丝 |
| `judge-casual` | 休闲手游玩 |
| `judge-indie` | 独立游戏开发者 |
| `judge-visual` | 视觉设计师 |
| `judge-speedrun` | 速通 / 高难玩家 |
| `judge-newbie` | 完全新手 |

### 1.4 开发组（6）

| 成员 | 负责模块 |
| --- | --- |
| `dev-engine` | 主循环、时间、RNG、输入、碰撞、实体、空间网格、相机、事件总线 |
| `dev-combat` | 伤害、投射物、敌人、波次、Boss、武器运行时 |
| `dev-progression` | 经验/等级、升级卡池、武器进化、被动、存档 |
| `dev-content` | 角色/武器/敌人/波次/台词/配色数据与平衡表 |
| `dev-ui` | 主菜单、选人、HUD、升级、暂停、结算、设置、响应式、触屏 |
| `dev-audio` | WebAudio 四层音乐、音效、静音/音量、失焦处理 |

### 1.5 质量与发行（5）

| 成员 | 角色 |
| --- | --- |
| `qa-automation` | 单元测试、构建校验、验收矩阵自动化 |
| `qa-playtester` | Chrome 实机试玩、缺陷与手感反馈 |
| `qa-compat` | 兼容性、移动端、无障碍、离线验证 |
| `code-reviewer` | 独立代码审查（质量门） |
| `release-manager` | README/CHANGELOG、发布清单、成品打包 |

---

## 2. 生产管线

```
M1 企划提案（10 份并行）
      ↓
M2 交叉讨论（10 份互评）→ 创意总监融合出 3 个方案
      ↓
M3 3 位评审审核 → 7 位打分员独立打分 → 制作人计票定案
      ↓
M4 设计定稿（GDD → 技术方案 → 验收矩阵 / 美术方向）
      ↓
M5 开发（6 模块 + 美术资产并行；QA 写测试）→ 开发门禁
      ↓
M6 候选版集成 → 自动化验证 + 实机试玩 + 兼容性 → 代码审查 → 发布集成
      ↓
M7 发行包装 → 最终验收 → v1.0.0
```

每一阶段结束都有：制作报告 → Git commit → tag → push → 关闭对应 GitHub Milestone/Issue。

---

## 3. 里程碑与交付物

| 里程碑 | 任务 | 交付物 | commit / tag |
| --- | --- | --- | --- |
| **M1 企划提案** | 10 份独立 pitch；制作人完整性报告 | `docs/pitches/*.md`、`docs/reports/m1-pitches.md` | `feat(creative): M1 ten pitches` / `m1-pitches` |
| **M2 交叉讨论** | 10 份互评；3 个融合方案 | `docs/discussion/*.md`、`docs/concepts/*.md`、`docs/reports/m2-discussion.md` | `docs(creative): M2 cross-review and hybrids` / `m2-discussion` |
| **M3 评审打分** | 3 份评审；7 份打分；计票定案 | `docs/reviews/*`、`docs/scores/*`、`docs/decision/selected-concept.md`、`docs/reports/m3-selection.md` | `docs(review): M3 reviews, scores and selection` / `m3-decision` |
| **M4 设计定稿** | GDD、技术方案、验收矩阵、美术方向 | `docs/gdd.md`、`docs/tech-spec.md`、`docs/acceptance.md`、`docs/art-direction.md`、`docs/reports/m4-design.md` | `docs(design): M4 GDD and tech spec` / `m4-design` |
| **M5 开发** | 7 个实现任务；单元测试；开发门禁 | `src/js/*`、`src/css/*`、`src/assets/*`、`tests/*`、`docs/reports/m5-dev.md` | `feat(game): M5 core systems` / `m5-dev` |
| **M6 测试与审查** | 候选版、自动化验证、试玩、兼容、代码审查、发布集成 | `src/index.html`、`tools/*`、`index.html`、`dist/*`、`docs/qa/*`、`docs/reports/m6-rc.md` | `feat(integration): M6 release candidate` / `m6-rc` |
| **M7 发布** | 发行包装、最终验收、GitHub Release | `README.md`、`CHANGELOG.md`、`docs/reports/final-acceptance.md`、`docs/release-checklist.md`、`dist/girls-band-live.html` | `chore(release): M7 v1.0.0` / `v1.0.0` |

### 3.1 任务 DAG（关键边）

```
10 pitch → gate-m1 → 10 response → synthesis → gate-m2
        → 3 critic → 7 judge → selection → req-gdd → req-tech
        → (impl-engine … impl-art) + art-direction → gate-m4
        → 7 impl → qa-tests → gate-m5 → candidate
        → verify + playtest + compat → code-review → integration
        → gate-m6 → release-package → final-acceptance
```

- 同一层的任务并行；`gate-*` 与 `selection` 是制作人门禁，负责汇总与提交点。
- 质量任务（requirements/implementation/verification/review/integration）带显式验收条件与验证命令。
- 评论（review）未通过时，按 findings 修复后再审；不得降低标准或跳门。

---

## 4. Git 与 GitHub 流程

### 4.1 仓库

- 远程：`github.com/yanyoo2000/girls-band-live`（开发期 **private**）。
- 默认分支：`main`；提交身份：`yanyoo2000 <1784135426@qq.com>`。
- 只有制作人执行 `git add/commit/tag/push`；成员只写文件。
- 每个里程碑至少 1 个 commit + 1 个 annotated tag + push。
- 提交信息使用 Conventional Commits，正文列出参与成员与任务 id。

### 4.2 里程碑与 Issue

- 7 个 GitHub Milestone 与 7 个 Issue，与 M1–M7 一一对应。
- 每个 Issue 的 body 是该阶段的交付清单。
- 阶段完成时：制作报告 → commit → push → 在 Issue 评论 commit sha 与验证摘要 → 关闭 Issue → 关闭 Milestone。

### 4.3 发布

- M7 生成 `dist/girls-band-live.html`，作为 GitHub Release `v1.0.0` 的附件。
- 私有仓库阶段只完成 commit/push/tag/release。
- **GitHub Pages 上线需要用户明确确认**：确认后将仓库切公开、开启 Pages（源 `main` / 根目录），验证 URL 可玩；未确认则交付本地单文件与 Release 附件。

---

## 5. 质量门

| 门 | 负责人 | 通过条件 |
| --- | --- | --- |
| G1 创意完整性 | producer | 10 份 pitch 齐全、结构完整、无 TBD |
| G2 融合方案 | producer | 3 个差异明确的 hybrid + 评审 rubric 已对齐 |
| G3 定案 | producer | 7 份独立打分 + 3 份评审 + 中位数计票 + 定案记录 |
| G4 设计 | producer | GDD/技术方案/验收矩阵/美术方向互相一致，无未决接口 |
| G5 开发 | producer | 7 个实现完成、语法检查通过、测试报告存在 |
| G6 候选版 | producer | 构建/校验/测试通过、实机试玩与兼容报告完成、review pass |
| G7 发布 | producer | 最终验收矩阵全过、README/CHANGELOG 完整、可离线打开 |

---

## 6. 风险登记

| 风险 | 影响 | 缓解 |
| --- | --- | --- |
| 35 个智能体并行导致文件冲突 | 构建失败/返工 | 严格 inScope；一人一文件；只读共享文档；制作人统一提交 |
| 接口漂移 | 模块无法集成 | 技术方案锁定命名空间/函数/数据结构/DOM；候选版由技术总监统一修复 |
| 范围膨胀 | 无法按时完成 | P0 基线 + 非目标清单；评审按范围控制打分；制作人砍需求 |
| 创意趋同 | 三案无差异 | 强制 A=稳妥/B=主题优先/C=乐趣优先；策划背景差异化 |
| 打分同质化 | 结果失真 | 7 人独立、禁止互看；中位数汇总；可行性否决 |
| 浏览器测试不可用 | 无法实机验证 | Chrome DevTools MCP；失败时用 Node 单测 + 静态校验 + 制作人补测 |
| 离线单文件失败 | 交付不可用 | 构建后 `validate.mjs` 扫描外部引用；QA 用 `file://` 实测 |
| 版权/原创风险 | 无法公开发布 | brief 明令原创；评审设红线；发行前人工复核 |
| 成员产出质量不足 | 门禁反复失败 | 报告制 + 独立 review + 制作人重派；必要时 captain 接管单点 |

---

## 7. 时间与节奏

- 无固定日历截止；以里程碑门禁为节奏。
- 同一阶段尽量并行；门禁任务串行。
- 每个门禁完成即提交，避免工作区长期堆积未提交文件。
- 所有阶段完成后统一发布 `v1.0.0`。
