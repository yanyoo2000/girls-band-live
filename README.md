# Girls Band Live

> 一支由 35 个 AI 智能体组成的游戏工作室，从 10 份企划提案一路做到可玩成品。

**主题**：少女乐队 × 吸血鬼幸存者（horde survival）
**技术栈**：原生 HTML / CSS / JavaScript，零运行时依赖，离线可玩，构建为单文件
**当前阶段**：M1 企划提案（进度见 [docs/production-plan.md](docs/production-plan.md)）

---

## 这是什么

`Girls Band Live` 是一个实验：让一支完整的虚拟游戏公司——制作人、创意总监、技术总监、美术总监、10 位策划、3 位评审、7 位打分员、6 位工程师、3 位 QA、代码审查与发行——在同一个仓库里完成一款真正可玩的游戏。

游戏本身是 **少女乐队题材的吸血鬼幸存者玩法**：

- 10 分钟一局，自动攻击、怪潮、经验、升级三选一
- 3 名可玩的乐队成员，6 把乐器武器与各自进化
- 8 种“噪音”怪物 + 1 个 Boss，1 张会随音乐变化的 Livehouse 舞台
- 原创角色、原创文案、程序化 WebAudio 音乐与音效，不使用任何现实乐队或既有 IP 素材
- 键盘 / 触屏都能玩，开关“减少动态”，暂停即安全

## 仓库结构

```
docs/            工作室文档：简报、企划、讨论、评审、GDD、技术方案、里程碑报告
src/             开发源码（原生 HTML/CSS/JS）
tests/           Node 内置 test runner 的单元测试
tools/           零依赖构建与校验脚本
dist/            构建产物（单文件离线版）
index.html       发布版入口（构建生成）
```

## 本地运行（开发）

```powershell
# 开发版
start src/index.html

# 发布版（构建后）
start index.html
```

## 构建与验证

```powershell
node tools/build.mjs      # 生成 index.html 与 dist/girls-band-live.html
node tools/validate.mjs   # 校验单文件自包含、必需 DOM、版本信息
node --test tests         # 运行单元测试
```

## 工作室文档

- [项目简报](docs/brief.md)：产品定义、硬约束、评审规则
- [工作室手册](docs/agent-handbook.md)：协作约定、代码契约、完成定义
- [制作计划](docs/production-plan.md)：团队名册、M1–M7 里程碑、GitHub 流程
- [决策记录](docs/decisions/0001-project-setup.md)：仓库、技术栈与发布策略

## 里程碑

M1 企划提案 → M2 交叉讨论 → M3 评审打分 → M4 设计定稿 → M5 开发 → M6 测试与审查 → M7 发布。

每个里程碑都有对应的 GitHub Milestone、Issue、commit、tag 与报告。
