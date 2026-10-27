# 决策记录 0002：技术栈切换为 React + TypeScript + Three.js

- 日期：2026-10-27
- 状态：已采纳（取代 0001 中“原生 HTML/CSS/JS”的技术栈部分）
- 决策人：用户 + 制作人（captain）

## 背景

用户最初要求“技术栈简单一点用 HTML”，随后明确改为 **React**，最终确定为 **React + TypeScript + Three.js**。项目尚未进入实现阶段，团队也尚未创建，因此可以无成本切换。核心目标不变：少女乐队 × 吸血鬼幸存者、10 分钟一局、可玩成品、里程碑/commit/发布。

## 决策

1. **前端框架**：React 19，负责所有 DOM UI（主菜单、选人、HUD、升级、暂停、设置、结算、制作名单）。
2. **语言**：TypeScript 5.9，`strict` 模式，`npm run typecheck` 必须 0 错误。
3. **3D 渲染**：Three.js 0.186，WebGL2，俯视 3/4 透视相机；低多边形 + 程序化材质/CanvasTexture，无外部 glTF/贴图/字体。
4. **构建**：Vite 8 + `@vitejs/plugin-react`；Vitest 5 做纯逻辑单元测试；`tools/build-single.mjs` 把构建产物内联为单文件。
5. **交付**：`dist/girls-band-live.html` 与根 `index.html`，≤4MB，`file://` 可玩；Vite 的 `dist/` 多文件产物同时保留。
6. **依赖策略**：核心栈固定为 React/TypeScript/Three.js/Vite/Vitest；其他库按项目需要引入，由技术总监评估必要性、包体、许可证、维护状态、离线可用性与供应链风险，记录在 `docs/tech-spec.md` 与 `docs/decisions/`。不再预设“仅允许这些包”的死名单。
7. **团队调整**：开发组由 6 人增至 7 人，新增 `dev-three`（Three.js 场景与渲染）；总人数 36。
8. **玩法不变**：P0 基线（3 角色、6 武器、6 进化、8 敌人 + Boss、1 舞台、10 分钟、升级三选一、Encore、键鼠 + 触屏）保持不变。

## 理由

- 用户明确指定 React + TS + Three.js；这是不可协商的产品输入。
- 3D 舞台能显著强化“少女乐队 Livehouse”的主题表达，比 2D 更符合用户对“成品”的期待。
- React 负责 UI、Three.js 负责渲染、纯 TS 负责玩法逻辑，三层边界清晰，适合 7 名工程师并行。
- Vite 是 React + TS 的标准构建工具；单文件内联可以用约 60 行零依赖脚本完成，不需要额外插件。

## 后果

- 依赖体积增大：Three.js + React 打进单文件后预计 1.2–2MB，仍在 4MB 预算内。
- 性能压力增大：150 敌人 + 3D 需要 InstancedMesh、对象池、低画质降级；技术方案必须给出预算与降级策略。
- 构建复杂度上升：单文件内联需要处理 Vite 的 module script、CSS、资源；由候选版集成任务负责并验证 `file://`。
- QA 需要 WebGL/GPU 环境：使用本机 Chrome DevTools 实机测试；WebGL 不可用时必须有明确错误提示，不能白屏。
- 测试策略：纯逻辑用 Vitest；React 组件与 Three.js 渲染以浏览器实机 + 截图为主，不引入组件测试库。

## 被否决的替代方案

- 纯 HTML/Canvas 2D（原方案）：无法满足用户最新的 Three.js 要求。
- Next.js / Remix：对单机离线游戏过重，且需要服务端概念，否决。
- 引入物理引擎（Rapier/Cannon）：暂不引入；幸存者玩法用自写圆形/AABB 碰撞足够。若技术方案证明必要，可按依赖政策评估引入。
- 引入状态库（Zustand/Redux）：暂不引入；React 只做低频 UI，外部 store + `useSyncExternalStore` 足够。若复杂度证明必要，可按依赖政策评估引入。
- 使用 glTF 角色模型：违反零外部素材与原创建模约束，且增加加载/授权风险。
