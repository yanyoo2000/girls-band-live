/**
 * WebGL2 能力探测（tech-spec §6.4 第 1 步 / GDD §19）。
 *
 * 只创建临时 canvas 探测一次，失败不抛异常，返回中文原因供启动页展示。
 */

export interface WebGL2Support {
  readonly ok: boolean;
  readonly reason: string | null;
}

/** 探测 WebGL2 是否可用（不保留 canvas / 上下文）。 */
export function detectWebGL2(): WebGL2Support {
  if (typeof document === 'undefined') {
    return { ok: false, reason: '当前环境没有浏览器 DOM，无法创建 WebGL2 上下文。' };
  }
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (gl === null) {
      return {
        ok: false,
        reason: '当前浏览器或显卡未提供 WebGL2。请使用最新版 Chrome / Edge / Firefox，并确认已开启硬件加速。',
      };
    }
    const lose = gl.getExtension('WEBGL_lose_context');
    lose?.loseContext();
    return { ok: true, reason: null };
  } catch (error) {
    return {
      ok: false,
      reason: `WebGL2 初始化失败：${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
