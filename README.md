# Girls Band Live

> 一支由 36 个 AI 智能体组成的游戏工作室，从 10 份企划提案一路做到可玩成品。

**主题**：少女乐队 × 吸血鬼幸存者（horde survival）
**技术栈**：React 19 + TypeScript + Three.js + Vite（零外部素材、零运行时网络请求）
**形态**：3D 俯视舞台、10 分钟一局、离线单文件可玩
**当前阶段**：M1 企划提案（进度见 [docs/production-plan.md](docs/production-plan.md)）

---

## 这是什么

`Girls Band Live` 是一个实验：让一支完整的虚拟游戏公司——制作人、创意总监、技术总监、美术总监、10 位策划、3 位评审、7 位打分员、7 位工程师、3 位 QA、代码审查与发行——在同一个仓库里完成一款真正可玩的 3D 游戏。

游戏本身是 **少女乐队题材的吸血鬼幸存者玩法**：

- 10 分钟一局，自动攻击、3D 怪潮、经验、升级三选一
- 3 名可玩的乐队成员，6 把乐器武器与各自进化
- 8 种“噪音”怪物 + 1 个多阶段 Boss，1 张会随音乐变化的 Livehouse 舞台
- Three.js 程序化低多边形角色、灯光、粒子与舞台，不使用任何外部模型/贴图
- React 管理菜单、HUD、升级、暂停、结算与设置；游戏循环与渲染独立于 React
- 原创角色、原创文案、程序化 WebAudio 音乐与音效，不使用任何现实乐队或既有 IP 素材
- 键盘 / 触屏都能玩，开关“减少动态”，暂停即安全

## 仓库结构

```
docs/            工作室文档：简报、企划、讨论、评审、GDD、技术方案、里程碑报告
src/
  main.tsx       React 入口
  App.tsx        UI 根组件
  game/          纯 TypeScript 玩法逻辑（可单测）
  three/         Three.js 渲染、场景、相机、实例化、特效
  ui/            React 组件：菜单、HUD、升级、暂停、结算
  audio/         WebAudio 音乐与音效
  data/          角色/武器/敌人/波次/台词数据
  types/         共享 TypeScript 类型契约
  styles/        CSS
  assets/        程序化 SVG/Canvas 视觉资产
tests/           Vitest 单元测试
tools/           零依赖构建/校验脚本（单文件内联）
dist/            构建产物（单文件离线版）
index.html       发布版入口（构建生成）
```

## 本地运行（开发）

```powershell
npm install
npm run dev          # Vite 开发服务器
```

## 类型检查、测试与构建

```powershell
npm run typecheck    # tsc --noEmit
npm test             # vitest run
npm run build        # 类型检查 + vite build + 单文件内联
npm run validate     # 校验单文件自包含、必需 DOM、版本信息
```

## 工作室文档

- [项目简报](docs/brief.md)：产品定义、硬约束、评审规则
- [工作室手册](docs/agent-handbook.md)：协作约定、代码契约、完成定义
- [制作计划](docs/production-plan.md)：团队名册、M1–M7 里程碑、GitHub 流程
- [决策记录](docs/decisions/0001-project-setup.md)：仓库、技术栈与发布策略
- [技术栈变更](docs/decisions/0002-react-ts-three.md)：React + TypeScript + Three.js 决策

## 里程碑

M1 企划提案 → M2 交叉讨论 → M3 评审打分 → M4 设计定稿 → M5 开发 → M6 测试与审查 → M7 发布。

每个里程碑都有对应的 GitHub Milestone、Issue、commit、tag 与报告。
