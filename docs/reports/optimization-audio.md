# v1.0.1 P0 音频修复报告：空场 / 合唱 / 静默 / duck

- **任务**：t140（v1.0.1 P0 音频）
- **作者**：dev-audio
- **日期**：2026-10-28
- **输入**：`docs/feedback/playtester-05-audio.md`、`docs/feedback/playtester-03-rhythm.md`、`docs/reports/feedback-bug-audit.md`
- **可改范围**：`src/audio/**`、`tests/**`、本报告；未改 store / main / 玩法数量、未运行 git、未安装依赖
- **限制声明**：我是 AI，没有耳朵。下文所有“可闻/可辨”都是**参数与增益层面的可测断言**，不是听感验收；凡需要人耳的部分均标“未人耳验证”。

---

## 0. 结论

| 问题 | 修复 | 证据 |
| --- | --- | --- |
| P1 空场后永久静音 | `setSilenced(true)` 不再一律切 0：非 Boss 窗口按“空场”保留 **0.22** + 贝斯/主旋律独奏 + 每 2 拍心跳；Boss 窗口切 0；Boss 静默超过 **16s** 未恢复时自动兜底为 0.22 | 新增 8 条引擎测试：空场目标 0.22、Boss 目标 0、Boss 超时兜底、`setSilenced(false)` 恢复 |
| P3 合唱不可闻 | 单声部基础增益 **0.22 → 0.38**；合唱总线前加 **1.4kHz +3dB peaking**；四档 30/61/128/256 人的单声部目标为 **0.130 / 0.186 / 0.269 / 0.380**（−17.7 / −14.6 / −11.4 / −8.4 dBFS） | `choirVoiceGain` 纯函数测试；四档单调 + 相邻差 ≥2dB |
| P2 静默硬切 | 0.03s 硬切改为**量化到下一小节**、**0.5 小节**线性淡出/淡入；恢复时 `nextStepTime` 对齐下一小节；静默期间每 2 拍 54Hz 心跳（−21dB 量级，走 SFX 总线） | `nextBarTime` 量化测试、静默目标测试、心跳代码路径 |
| P4 升级弹窗切碎段落 | `setChoir` 超过 **2.6s** 未更新 → 音乐 duck 到 **0.22** + 700Hz 低通（**不中断调度**），下次 `setChoir` 恢复 | 引擎测试：推进 3.2s 后 `musicGain = 0.7 × 0.22`，再 `setChoir` 回 0.7 |
| P5 失焦/三路音量 | 回归：`applyAudioMix` / `setAudioHostHidden` 不变，新增断言 | 主音量 0.4、音乐 0.2、隐藏 12% 均通过 |

**四命令**：`typecheck` 0 错误；`test` **284/284**（原 268 + 新增 16）；`build` 产出 `dist/girls-band-live.html` **1029.5 KiB / sha256 47071380214e（构建快照；并行队友改动会改变产物哈希）**；`validate` **14/14**（1029.5 KiB / 47071380214e）。`file://` 单文件实测：加载 → 点击开始 → 进入演出 → 升级弹窗，**console 0 条消息**。

---

## 1. 空场静音（P1）

### 1.1 根因

`src/game/store.ts:1324-1327` 在 `present === 0` 时直接 `deps.audio.setSilenced(true)`，但没有同步 `silencePrev`（`store.ts:1212-1218` 只由 Boss 的 `run.silenceRemaining` 驱动）。下一个 tick `silentNow = false`、`silencePrev = false`，**不会调用 `setSilenced(false)`**，于是 `silenceGain` 永久停在 0，直到重开（`store.ts:878` 才恢复）。

### 1.2 修复（audio 层，不改 store）

`src/audio/engine.ts` 的 `setSilenced(true)` 现在先判定静默类型：

```ts
const runTime = now - state.startTime;
state.silenceKind = isBossSilenceWindow(runTime, data) ? 'boss' : 'empty-house';
```

- **Boss 窗口**：`data.balance.boss.phases` 的 `bus` 阶段（390–405s，6:30–6:45）→ 目标 **0**（GDD“系统抽走声音”）。
- **空场**：其他任何时间 → 目标 **0.22**（约 −13dB），音乐继续以“贝斯 + 主旋律”独奏（`scheduleStep` 过滤掉 drums/chords/arp），并每 2 拍心跳。
- **Boss 静默兜底**：若 `silenceKind === 'boss'` 且 **16s** 内没有收到 `setSilenced(false)`（Boss 静默只有 15s），自动改判为空场并淡入 0.22，**不得永久静音**。
- **恢复**：任何 `setSilenced(false)` 取消上述状态，`silenceGain` 在下一小节淡入到 1，调度从下一小节重新对齐。

### 1.3 时间轴

| 时刻 | 事件 | 行为 |
| --- | --- | --- |
| 空场当帧 | `setSilenced(true)` | 判定 empty-house；`silenceAt = 下一小节`；调度继续到 `silenceAt` |
| 下一小节 | 淡出开始 | 0.5 小节线性 1 → 0.22；合唱总线切 0；心跳开始每 2 拍 |
| 之后 | 独奏 | 仅 bass + lead 调度；音量 0.22；SFX 心跳走 `sfxBus`（不受 `silenceGain`） |
| 重开 / Boss 结束 | `setSilenced(false)` | 下一小节 0.5 小节淡入到 1 |

---

## 2. 合唱可闻性（P3）

### 2.1 改动

| 参数 | 旧 | 新 | 说明 |
| --- | ---: | ---: | --- |
| `CHOIR_VOICE_GAIN` | 0.22 | **0.38** | 单声部基础增益（`src/audio/choir.ts`） |
| 合唱存在感 | — | **1.4kHz peaking +3dB（Q1.2）** | 从 lead/arp 的 1–2kHz 让出一块 |
| 逐层加入 | 0–64 / 64–128 / 128–192 | 不变 | 近 / 中 / 远 |
| 总线补偿 | `0.707^(activeLayers-1)` | 不变 | “变厚不变响” |
| 节点 | 42 | **43** | +1 presence；总节点峰值 109（≤120） |

### 2.2 四档参数与 RMS 估算

单声部 RMS 按正弦 `gain × 0.7071`；4 区近似非相干叠加 `× 2`（同档、同 pan 展开）。`musicBus` 默认 0.7（−3.1dBFS 满刻度）。

| 总人气 | 每区人数 | 单声部 gain | 单声部 dBFS | 4 区叠加 dBFS | 相对 musicBus | 厚度（激活层/区） |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 30 | 7.5 | 0.130 | −20.7 | −14.7 | **−11.6 dB** | 1 层 |
| 61 | 15.25 | 0.186 | −17.6 | −11.6 | **−8.5 dB** | 1 层 |
| 128 | 32 | 0.269 ×0.707 = 0.190 | −17.5 | −11.4 | **−8.3 dB** | 2 层 |
| 256 | 64 | 0.380 ×0.5 = 0.190 | −17.5 | −11.4 | **−8.3 dB** | 3 层 |

- **30→61**：响度 +3.1dB，明确可辨。
- **61→128 / 128→256**：响度基本不变（−8.5 → −8.3dB），但激活层数 1→2→3，声像扇形与 detune 增加，靠“变厚”区分（GDD 的设计目标）。
- 旧参数（0.22）同口径：30 档相对 musicBus 约 **−16.4dB**；新参数提升 **+4.8dB**。反馈实测 0.004–0.024 是单区 0–2 人的开局/空场；常规 C 局峰值 30–61（每区 7.5–15）现在落在 −11.6 ~ −8.5dB，不再被音乐完全掩蔽。
- **未人耳验证**：128/256 是否能靠“厚度”分辨，需要 10 人盲听；若不能，单点调 `CHOIR_VOICE_GAIN` 或把补偿改为 −2dB/层。报告不伪报“已可闻”。

---

## 3. 静默段量化与心跳（P2/P5）

| 项 | 旧 | 新 |
| --- | --- | --- |
| 淡出 | 0.03s 硬切 | 下一小节开始，**0.5 小节**线性到目标（Boss 0 / 空场 0.22） |
| 淡入 | 0.03s 硬切 | 下一小节开始，0.5 小节线性到 1 |
| 恢复相位 | `stepIndex = stepAt(now)`（可能半拍） | `nextStepTime = 下一小节 + 0.05`，从**小节头**重新调度 |
| 静默段声音 | 无（`dOsc=0/dBuf=0`） | 每 **2 拍** 54Hz 心跳：osc + gain 0.18（约 −21dB，走 `sfxBus`，不受静默总线） |
| 永久静默风险 | 空场无恢复 | Boss 16s 兜底 + 空场 0.22 |

`SILENCE_FADE_BARS = 0.5`、`HEARTBEAT_BEATS = 2` 均为单点常量；`barSeconds(data)` 从 `beatGrid` 读取（128BPM/4/4 = 1.875s）。

---

## 4. 升级三选一 duck（P4）

- **触发**：`setChoir` 每 4 拍由 store 调用（`store.ts:1370-1375`）。`engine` 记录 `lastChoirAt`；tick 中若 `now - lastChoirAt > 2.6s` 且已有合唱混音 → `setDucked(true)`。
- **效果**：`musicBus` 0.7 → **0.154（0.22×）**；`musicBus` 后新增低通 `duckFilter` 18000 → **700Hz**。**不停止调度**，段落不重建。
- **恢复**：下一次 `setChoir` 调用即在 0.15s 内恢复；`resume()` 也重置 `lastChoirAt` 并取消 duck（避免暂停恢复误判）。
- **为什么是 2.6s**：setChoir 周期 1.875s，留 0.7s 抖动余量；若正常局卡顿超过 2.6s 会短暂 duck，恢复后自动消失。
- **未人耳验证**：duck 的“像排练继续”是否好听，需要人耳；参数单点可调（`DUCK_GAIN` / `DUCK_FREQ` / `DUCK_AFTER`）。

---

## 5. 失焦与三路音量回归

| 测试 | 断言 |
| --- | --- |
| `applyAudioMix({master:0.4, music:0.2, sfx:1})` | `musicBus = 0.2`、`masterGain = 0.4` |
| `setAudioHostHidden(true)` | `masterGain = 0.4 × 0.12 = 0.048`；恢复 0.4 |
| `dispose()` | `nodeCount()` 归零 |

`master = 0` 仍是用户静音（SettingsV1 无独立 muted 字段）；持久化仍在 save 层，audio 只接收注入值。

---

## 6. 测试与四命令

新增：

| 文件 | 覆盖 |
| --- | --- |
| `tests/audio-choir.test.ts` | 四档单调、相邻 ≥2dB、逐层加入、0/负值钳位 |
| `tests/audio-silence.test.ts` | Boss 窗口 390–405、空场目标 0.22、`nextBarTime` 量化、duck 判定 |
| `tests/audio-engine.test.ts` | 空场不切 0、Boss 切 0、Boss 16s 兜底、恢复、三路音量、失焦 12%、duck 运行时、dispose 归零 |
| `tests/helpers/fake-audio.ts` | 最小 WebAudio 替身（Node 无 AudioContext） |

| 命令 | 结果 |
| --- | --- |
| `npm run typecheck` | 0 错误 |
| `npm test` | **284/284**（29 文件） |
| `npm run build` | `dist/girls-band-live.html` 1029.5 KiB，sha256 `47071380214e`（快照） |
| `npm run validate` | 14/14 |
| `file://` 单文件 | 加载 → 点击开始 → 开始演出 → 升级弹窗，console **0 条** |

---

## 7. 偏差、风险与未验证

| 项 | 说明 |
| --- | --- |
| 空场/Boss 区分 | 用 `data.balance.boss.phases` 的时间窗口（390–405s）判定，不改 store。若以后 Boss 时间表调整，需同步 `isBossSilenceWindow`。空场恰好发生在 6:30–6:45 时会先按 Boss 切 0，16s 后兜底 0.22。 |
| 空场“独奏” | 只保留 bass + lead（+心跳），不是完整 5 层；这是对“只剩你还在弹”的解释，未人耳验证。 |
| 合唱四档 | 30→61 靠响度；61→128→256 靠厚度（响度不变）。**未人耳盲听**；若 128/256 不可辨，单点调 `CHOIR_VOICE_GAIN` / 补偿。 |
| duck | 用 `setChoir` 心跳做启发式；正常局卡顿 >2.6s 会短暂 duck。未接 `levelup` 事件（tech-spec 未给 audio 该钩子，且 store/main 不在可改范围）。 |
| 心跳 | 54Hz、0.18、每 2 拍；**未人耳验证**是否“像心跳”而不是“像底鼓”。 |
| RMS | 表 2 是**参数化估算**（正弦 RMS + 非相干叠加），不是离线渲染或人耳测量。 |
| 节点 | 合唱 43（≤44）；总峰值 109（≤120）；+2 来自 presence 与 duckFilter。 |

**建议下一步**：用 `docs/feedback/playtester-05-audio.md` 的方法注入 WebAudio 探针，复测常规 C 局（峰值 30–61）的合唱增益是否落在 −12 ~ −9dB；再跑一次 6:30–6:45 的静默段，确认 0.5 小节淡出、心跳、下一小节恢复；最后做人耳 A/B（30/61/128/256）。
