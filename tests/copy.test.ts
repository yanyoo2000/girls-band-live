/**
 * tech-spec §11 #19：文案库。
 *
 * 必测：失败卡三条原因模板、空场文案、评级标签、结算后台短句 4 条。
 */
import { describe, expect, it } from 'vitest';
import {
  COPY,
  COPY_LINES,
  COPY_LINES_BY_TRIGGER,
  FAILURE_REASON_ORDER,
  FAILURE_REASONS,
  GRADE_LABELS,
} from '../src/data/copy';
import type { CopyContext, CopyTrigger } from '../src/types/data';
import type { FailureReasonCode, Grade } from '../src/types/game';

const TRIGGERS: readonly CopyTrigger[] = [
  'run-start',
  'first-convert',
  'first-crowd-wave',
  'return-lock',
  'line-break',
  'silence',
  'finale-drop',
  'empty-house',
  'failure',
  'results-backstage',
];

const GRADES: readonly Grade[] = ['S', 'A', 'B', 'C'];

function makeContext(): CopyContext {
  return {
    ending: 'complete',
    grade: 'A',
    converted: 187,
    burned: 42,
    covered: 96,
    cracks: 2,
    breakout: { 'front-left': 80, 'front-right': 60, 'back-left': 30, 'back-right': 17 },
    emptySeats: 581,
    secondRowEmpty: 12,
    lineBreaks: { guitar: 1, bass: 0, drums: 2 },
    returnLocks: 3,
  };
}

describe('COPY_LINES / 触发点覆盖', () => {
  it('应覆盖全部 10 个触发点且每行 trigger 与分组一致', () => {
    expect(Object.keys(COPY_LINES_BY_TRIGGER).sort()).toEqual([...TRIGGERS].sort());
    for (const trigger of TRIGGERS) {
      const lines = COPY_LINES_BY_TRIGGER[trigger];
      expect(lines.length).toBeGreaterThan(0);
      for (const line of lines) {
        expect(line.trigger).toBe(trigger);
        expect(line.id.length).toBeGreaterThan(0);
      }
    }
  });

  it('应让 COPY.lines 与展开后的分组内容一致', () => {
    const flat = TRIGGERS.flatMap((trigger) => COPY_LINES_BY_TRIGGER[trigger]);
    expect(COPY.lines).toEqual(COPY_LINES);
    expect(COPY_LINES).toEqual(flat);
  });

  it('应让局内触发的句子不含阿拉伯数字（局内 0 数字口径）', () => {
    const inRun = COPY_LINES.filter((line) => line.trigger !== 'results-backstage');
    for (const line of inRun) {
      expect(line.render(makeContext())).not.toMatch(/\d/);
    }
  });

  it('应让每句渲染结果非空且不超过 40 字（后台纸片一行）', () => {
    for (const line of COPY_LINES) {
      const text = line.render(makeContext());
      expect(text.length).toBeGreaterThan(0);
      expect(text.length).toBeLessThanOrEqual(40);
    }
  });
});

describe('结算后台短句', () => {
  it('应提供 4 条成员短句 + 1 条旁白（按 ending 分支）', () => {
    const backstage = COPY_LINES_BY_TRIGGER['results-backstage'];
    const speakers = backstage.map((line) => line.speaker);
    for (const member of ['jiangqi', 'xuliao', 'wensheng', 'shaoyan'] as const) {
      expect(speakers).toContain(member);
    }
    expect(speakers).toContain('narrator');

    const ctx = makeContext();
    const narrator = backstage.filter((line) => line.speaker === 'narrator');
    expect(narrator).toHaveLength(1);
    const completeText = narrator[0]?.render(ctx) ?? '';
    const emptyText = narrator[0]?.render({ ...ctx, ending: 'empty-house' }) ?? '';
    expect(completeText).not.toBe(emptyText);
    expect(emptyText).toContain('椅子');
  });

  it('应让成员短句带上本局真实数字', () => {
    const ctx = makeContext();
    const jiangqi = COPY_LINES_BY_TRIGGER['results-backstage'].find(
      (line) => line.speaker === 'jiangqi',
    );
    expect(jiangqi).toBeDefined();
    const text = jiangqi?.render(ctx) ?? '';
    expect(text).toContain(String(ctx.converted));
    expect(text).toContain(String(ctx.secondRowEmpty));
  });

  it('应让空场文案与失败文案不同', () => {
    const ctx = makeContext();
    const empty = COPY_LINES_BY_TRIGGER['empty-house'][0]?.render(ctx) ?? '';
    const failure = COPY_LINES_BY_TRIGGER.failure[0]?.render(ctx) ?? '';
    expect(empty).not.toBe('');
    expect(failure).not.toBe('');
    expect(empty).not.toBe(failure);
  });
});

describe('FAILURE_REASONS', () => {
  it('应覆盖 5 种原因且顺序表完整', () => {
    const codes = Object.keys(FAILURE_REASONS).sort();
    expect(codes).toEqual([...FAILURE_REASON_ORDER].sort());
    expect(FAILURE_REASON_ORDER).toHaveLength(5);
  });

  it('应把数值代进模板且每条可读', () => {
    const cases: readonly [FailureReasonCode, number][] = [
      ['return-listener-lock', 4],
      ['zone-cooled', 23],
      ['audience-left', 64],
      ['no-ignite', 12],
      ['overheated-zone', 9],
    ];
    for (const [code, value] of cases) {
      const text = FAILURE_REASONS[code](value);
      expect(text).toContain(String(value));
      expect(text.length).toBeGreaterThan(6);
    }
  });
});

describe('GRADE_LABELS', () => {
  it('应覆盖 S/A/B/C 四档且每档非空', () => {
    expect(Object.keys(GRADE_LABELS).sort()).toEqual([...GRADES].sort());
    for (const grade of GRADES) {
      expect(GRADE_LABELS[grade].length).toBeGreaterThan(4);
    }
  });

  it('应让 COPY.grades 与 GRADE_LABELS 同源', () => {
    expect(COPY.grades).toEqual(GRADE_LABELS);
  });
});
