/**
 * tech-spec §11 #14：确定性。
 *
 * 必测：同 seed 两局 `RunResult` 全等；扫描 `src/game/**` 无 `Math.random` / `Date.now`。
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NEUTRAL_INPUT, createHarness } from './helpers/store';

const GAME_DIR = join(process.cwd(), 'src', 'game');

describe('同 seed 复现', () => {
  it('应让同 seed、同输入的观众/噪音/光状态逐位一致', () => {
    const a = createHarness();
    const b = createHarness();
    a.start(20261028);
    b.start(20261028);
    a.tick(600);
    b.tick(600);

    const runA = a.store.getRun();
    const runB = b.store.getRun();
    expect(runA).not.toBeNull();
    expect(runB).not.toBeNull();
    if (runA === null || runB === null) throw new Error('开局失败');

    expect(Array.from(runA.audience.state)).toEqual(Array.from(runB.audience.state));
    expect(Array.from(runA.audience.heat)).toEqual(Array.from(runB.audience.heat));
    expect(runA.noises.map((noise) => [noise.id, noise.kind, noise.position.x, noise.position.z])).toEqual(
      runB.noises.map((noise) => [noise.id, noise.kind, noise.position.x, noise.position.z]),
    );
    expect(runA.light.position).toEqual(runB.light.position);
    expect(runA.time).toBe(runB.time);
    expect(a.store.getHud()).toEqual(b.store.getHud());
    a.dispose();
    b.dispose();
  });

  it('应让不同 seed 产生不同的观众初始分布或噪音序列', () => {
    const a = createHarness();
    const b = createHarness();
    a.start(1);
    b.start(2);
    a.tick(600);
    b.tick(600);
    const runA = a.store.getRun();
    const runB = b.store.getRun();
    if (runA === null || runB === null) throw new Error('开局失败');
    const sameAudience =
      runA.audience.state.length === runB.audience.state.length &&
      runA.audience.state.every((value, index) => value === runB.audience.state[index]);
    const sameNoise =
      runA.noises.length === runB.noises.length &&
      runA.noises.every((noise, index) => noise.position.x === runB.noises[index]?.position.x);
    expect(sameAudience && sameNoise).toBe(false);
    a.dispose();
    b.dispose();
  });

  it('应让同 seed、不同输入产生不同结果（输入确实进入模拟）', () => {
    const a = createHarness();
    const b = createHarness();
    a.start(5);
    b.start(5);
    a.tick(600);
    b.tick(600, { ...NEUTRAL_INPUT, pointerWorld: { x: 3, z: 3 }, move: { x: 1, z: 0 } });
    const runA = a.store.getRun();
    const runB = b.store.getRun();
    if (runA === null || runB === null) throw new Error('开局失败');
    expect(runA.player.position).not.toEqual(runB.player.position);
    a.dispose();
    b.dispose();
  });
});

describe('源码扫描（单机确定性门禁）', () => {
  /** 去掉注释再扫描：文档里可以写「不使用 Math.random」这类说明。 */
  function stripComments(text: string): string {
    return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  }

  it('应让 src/game/** 的代码（非注释）不出现 Math.random / Date.now', () => {
    const files = readdirSync(GAME_DIR).filter((name) => name.endsWith('.ts'));
    expect(files.length).toBeGreaterThan(5);
    const offenders: string[] = [];
    for (const file of files) {
      const code = stripComments(readFileSync(join(GAME_DIR, file), 'utf8'));
      if (/\bMath\.random\b/.test(code)) offenders.push(`${file}: Math.random`);
      if (/\bDate\.now\b/.test(code)) offenders.push(`${file}: Date.now`);
    }
    expect(offenders).toEqual([]);
  });

  it('应让 src/game/** 不 import react / three（分层门禁）', () => {
    const files = readdirSync(GAME_DIR).filter((name) => name.endsWith('.ts'));
    const offenders: string[] = [];
    for (const file of files) {
      const text = readFileSync(join(GAME_DIR, file), 'utf8');
      if (/from\s+['"]react['"]|from\s+['"]react-dom['"]|from\s+['"]three['"]/.test(text)) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });
});
