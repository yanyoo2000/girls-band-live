# M5 验证报告：自动化四命令实况（t96 / qa-automation）

- **日期**：2026-10-28 03:35（Asia/Shanghai）
- **执行者**：qa-automation
- **环境**：Windows（win32-x64）、Node v24.13.0、npm 11.6.2、Vitest 5.0.5
- **仓库**：`D:\yan-github-code\Girls Band Live`
- **配套**：`docs/qa/unit-report.md`（19 组模块与 68 项矩阵映射）

---

## 1. 四命令结果

| # | 命令 | 退出码 | 结论 | 备注 |
| --- | --- | --- | --- | --- |
| 1 | `npm run typecheck` | 0 | 通过 | `tsc --noEmit`，无错误输出；覆盖 `src/**`、`tests/**`、`tools/**`、`vite.config.ts` |
| 2 | `npm test` | 0 | 通过 | 23 文件 / 259 用例 / 1.58s / 0 失败 |
| 3 | `npm run build` | 0（连续两次） | 通过 | 两次 sha256 完全一致；`dist/girls-band-live.html` = 根 `index.html` = 1,042,695 B |
| 4 | `npm run validate` | 0 | 通过 | `validate: 14/14 rules passed（1018.3 KiB，sha256 1c17dbae37cd）` |

### 1.1 `npm run typecheck`

```
> girls-band-live@0.1.0 typecheck
> tsc --noEmit

TYPECHECK_EXIT=0
```

### 1.2 `npm test`

```
 Test Files  23 passed (23)
      Tests  259 passed (259)
   Duration  1.58s
```

2026-10-28 03:35 实跑；无 `skip`/`todo`/`only`（`tests/**` grep 0 命中）。
`tests/f3-bot.test.ts` 同批通过 4/4（camp end 7 ≤ 18，sweep end 40 ≥ 36），由 t105 交付、t96 只复跑引用。

### 1.3 `npm run build`（连续两次，AC-T03 / AC-T10）

```
build-single: dist/girls-band-live.html 1018.3 KiB (sha256 1c17dbae37cd)
build-single: 根 index.html 同步写入（1042695 bytes）
BUILD1_EXIT=0
BUILD2_EXIT=0
```

| 次数 | 产物 | 字节 | sha256 |
| --- | --- | --- | --- |
| 第 1 次 | `dist/girls-band-live.html` | 1,042,695 | `1c17dbae37cdd552f8c4c133e0576b319a00f5322d98bfe516092ffccdf186fe` |
| 第 2 次 | `dist/girls-band-live.html` | 1,042,695 | 同上（完全一致） |
| 第 2 次 | 根 `index.html` | 1,042,695 | 同上（字节一致） |

- 两次构建哈希一致 → AC-T10（产物内无时间戳/随机数）通过。
- `dist/index.html` 是 Vite 的 HTML 入口（783 B），不是交付物；交付物是 `girls-band-live.html` 与根 `index.html`。

### 1.4 `npm run validate`

```
validate: 14/14 rules passed（1018.3 KiB，sha256 1c17dbae37cd）
```

只读脚本（`tools/validate.mjs`），不写产物；14 条规则含分层（R12/R13）与单文件约束。

---

## 2. 测试文件清单（23 个）

| 归属 | 文件 | 用例 |
| --- | --- | --- |
| t96 | `tests/rng.test.ts` | 16 |
| t96 | `tests/clock.test.ts` | 13 |
| t96 | `tests/collision.test.ts` | 13 |
| t96 | `tests/pool.test.ts` | 7 |
| t96 | `tests/light.test.ts` | 12 |
| t96 | `tests/ignite.test.ts` | 9 |
| t96 | `tests/audience.test.ts` | 11 |
| t96 | `tests/crowd-wave.test.ts` | 7 |
| t96 | `tests/progression.test.ts` | 14 |
| t96 | `tests/boss.test.ts` | 11 |
| t96 | `tests/save.test.ts` | 15 |
| t96 | `tests/hud.test.ts` | 10 |
| t96 | `tests/determinism.test.ts` | 5 |
| t96 | `tests/entities.test.ts` | 10 |
| t96 | `tests/waves.test.ts` | 14 |
| t96 | `tests/upgrades.test.ts` | 14 |
| t96 | `tests/music.test.ts` | 10 |
| t96 | `tests/copy.test.ts` | 11 |
| t96（补充） | `tests/data.test.ts`（数据完整性） | 18 |
| t96（补充） | `tests/combat.test.ts`（伤害结算） | 11 |
| t103（tech-director） | `tests/seat-layout.test.ts` | 21 |
| dev-ui | `tests/ui-smoke.test.tsx` | 3 |
| t105（dev-engine） | `tests/f3-bot.test.ts` | 4 |

辅助文件：`tests/helpers/store.ts`（无 DOM 的 GameStore 装配，不包含测试用例）。

---

## 3. 产物证据

| 文件 | 字节 | sha256 |
| --- | --- | --- |
| `dist/girls-band-live.html` | 1,042,695 | `1c17dbae37cdd552f8c4c133e0576b319a00f5322d98bfe516092ffccdf186fe` |
| `index.html`（仓库根） | 1,042,695 | 同上（字节一致） |

- 体积 1018.3 KiB ≤ 4 MiB（AC-T05 通过线）。

---

## 4. 与四命令契约的说明

1. **`npm test` 可运行性依赖 `vite.config.ts` 的 `test.root`**：M6 集成为 `root: 'src'` 的 Vite 构建配置后，Vitest 一度从 `src/` 找测试导致 0 文件；t106 已在配置中加入 `test: { root: process.cwd(), include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'], environment: 'node' }`，本报告的命令均在该配置下实跑。
2. **构建校验由 t96 执行**：t106 集成 completed 后，t96 连续跑两次 `npm run build`（写 `dist/` 与根 `index.html`），哈希一致；未修改任何源码。
3. **全局长跑未做**：`determinism.test.ts` 用 600 tick 状态逐位一致 + 源码扫描替代 9:30 全跑（34,200 tick × 2 超出 5s 测试预算）；AC-T13 的完整两局对照留给 M6 实机。
4. **测试文件数**：磁盘上 23 个 `*.test.ts(x)`；若按“含 `tests/helpers/store.ts` 的 tests 目录文件数”会得到 24，但带用例的测试文件为 23。

---

## 5. 结论

- 自动化 4 命令全部实跑通过：`typecheck` 0、`test` 23/259 全绿、`build` 两次同哈希、`validate` 14/14。
- **t96 的 19 组必测模块全部有可执行测试且当前全绿**；`f3-bot`（t105）与 `seat-layout`（t103）按其归属引用、未重复创建。
- 未覆盖/需人测项（音频听感、GPU 性能、三浏览器 `file://`、人测协议）已在 `docs/qa/unit-report.md` §4 逐条列出，不用单测替代。
