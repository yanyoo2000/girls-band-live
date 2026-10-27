/**
 * 程序化视觉资产：CanvasTexture + 内联 SVG。
 *
 * 契约（docs/tech-spec.md §5.8）：
 * - `TextureId` 固定 10 个 id，`createProceduralAssets()` 按 id 缓存、可 dispose；
 * - 零外部贴图/字体/模型，所有像素在运行时用 2D canvas 生成。
 *
 * art-direction §9 的描述性清单落位（见 `PAINTERS` 注释）：
 * 四区地纹 → seat-atlas；地面与裂缝 → stage-concrete；舞台网格 → stage-grid；
 * 黑烟/尘埃 → noise-grain；曲目单 → setlist-paper；旧海报 → handbill；
 * 地面光池 → zone-glow；手机灯 → phone-flare；光锥 → cone-falloff；人浪 → wave-streak。
 *
 * 纹理中的区色/暖白与 `src/data/palette.ts` 的 PALETTE_HEX 同值；改色时两处同步。
 *
 * 额外的 13 个 SVG 图形（四区标记 4、图标 3、印章/字标/剪影 3、踏板 3）全部使用
 * `currentColor`，颜色由 `src/styles/theme.css` 的 CSS 变量控制；不含位图与外部字体。
 */

import * as THREE from 'three';

/* ==========================================================================
 * 1. CanvasTexture：契约与缓存
 * ========================================================================== */

/** 10 张程序化 CanvasTexture 的 id（与 tech-spec §5.8 一致）。 */
export type TextureId =
  | 'seat-atlas'
  | 'stage-concrete'
  | 'stage-grid'
  | 'noise-grain'
  | 'setlist-paper'
  | 'handbill'
  | 'zone-glow'
  | 'phone-flare'
  | 'cone-falloff'
  | 'wave-streak';

/** 纹理 id 的稳定顺序（测试与资产盘点的唯一来源）。 */
export const TEXTURE_IDS: readonly TextureId[] = [
  'seat-atlas',
  'stage-concrete',
  'stage-grid',
  'noise-grain',
  'setlist-paper',
  'handbill',
  'zone-glow',
  'phone-flare',
  'cone-falloff',
  'wave-streak',
];

/** 纹理生成器：按 id 缓存，重复调用返回同一张；零外部素材。 */
export interface ProceduralAssets {
  texture(id: TextureId): THREE.CanvasTexture;
  dispose(): void;
}

interface TexturePainter {
  readonly width: number;
  readonly height: number;
  readonly paint: (ctx: CanvasRenderingContext2D, width: number, height: number) => void;
}

/**
 * 创建一个程序化纹理缓存。
 * 必须在浏览器环境（有 `document`）中调用；`dispose()` 后缓存清空，可再次创建。
 */
export function createProceduralAssets(): ProceduralAssets {
  const cache = new Map<TextureId, THREE.CanvasTexture>();

  return {
    texture(id: TextureId): THREE.CanvasTexture {
      const hit = cache.get(id);
      if (hit !== undefined) return hit;
      const created = createCanvasTexture(id);
      cache.set(id, created);
      return created;
    },
    dispose(): void {
      for (const texture of cache.values()) texture.dispose();
      cache.clear();
    },
  };
}

function createCanvasTexture(id: TextureId): THREE.CanvasTexture {
  const painter = PAINTERS[id];
  const canvas = document.createElement('canvas');
  canvas.width = painter.width;
  canvas.height = painter.height;
  const ctx = canvas.getContext('2d');
  if (ctx === null) throw new Error(`无法创建 2D canvas，纹理 "${id}" 生成失败`);
  ctx.imageSmoothingEnabled = true;
  painter.paint(ctx, canvas.width, canvas.height);

  const texture = new THREE.CanvasTexture(canvas);
  texture.name = id;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 1;
  texture.needsUpdate = true;
  return texture;
}

/* ==========================================================================
 * 2. 绘图工具（确定性、无 Math.random）
 * ========================================================================== */

/** 32 位确定性 PRNG：同一 seed 在同一浏览器与 Node 中给出同一序列。 */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

interface SpeckleOptions {
  readonly count: number;
  readonly color: string;
  readonly alphaMin: number;
  readonly alphaMax: number;
  readonly sizeMax: number;
  readonly avoidCenter?: boolean;
}

function drawSpeckles(
  ctx: CanvasRenderingContext2D,
  rnd: () => number,
  width: number,
  height: number,
  options: SpeckleOptions,
): void {
  ctx.save();
  for (let i = 0; i < options.count; i += 1) {
    const x = rnd() * width;
    const y = rnd() * height;
    if (options.avoidCenter === true) {
      const dx = x / width - 0.5;
      const dy = y / height - 0.5;
      if (dx * dx + dy * dy < 0.02) continue;
    }
    const alpha = options.alphaMin + rnd() * (options.alphaMax - options.alphaMin);
    const size = 1 + rnd() * options.sizeMax;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = options.color;
    ctx.fillRect(x, y, size, size);
  }
  ctx.restore();
}


/* ==========================================================================
 * 3. 10 张纹理的绘制
 * ========================================================================== */

const PAINTERS: Readonly<Record<TextureId, TexturePainter>> = {
  /* 四区地纹图谱（4 × 256²）：● 前左根音 / ▲ 前右三度 / ■ 后左五度 / ◆ 后右七度。 */
  'seat-atlas': {
    width: 512,
    height: 512,
    paint: (ctx) => {
      const cell = 256;
      const marks: readonly { readonly color: string; readonly shape: 'bar' | 'triangle' | 'square' | 'diamond' }[] = [
        { color: '#bfd6e8', shape: 'bar' },
        { color: '#ff3d7f', shape: 'triangle' },
        { color: '#35e0d0', shape: 'square' },
        { color: '#ffb03a', shape: 'diamond' },
      ];

      marks.forEach((mark, index) => {
        const originX = (index % 2) * cell;
        const originY = Math.floor(index / 2) * cell;
        const rnd = mulberry32(0x51ea7 + index);
        ctx.save();
        ctx.translate(originX, originY);

        const background = ctx.createLinearGradient(0, 0, 0, cell);
        background.addColorStop(0, '#151922');
        background.addColorStop(1, '#0d1016');
        ctx.fillStyle = background;
        ctx.fillRect(0, 0, cell, cell);

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.055)';
        ctx.lineWidth = 1;
        for (let line = 32; line < cell; line += 32) {
          ctx.beginPath();
          ctx.moveTo(line, 0);
          ctx.lineTo(line, cell);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(0, line);
          ctx.lineTo(cell, line);
          ctx.stroke();
        }

        ctx.globalAlpha = 0.92;
        ctx.strokeStyle = mark.color;
        ctx.fillStyle = mark.color;
        ctx.lineWidth = 12;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        if (mark.shape === 'bar') {
          ctx.beginPath();
          ctx.moveTo(58, 128);
          ctx.lineTo(198, 128);
          ctx.stroke();
        } else if (mark.shape === 'triangle') {
          ctx.beginPath();
          ctx.moveTo(128, 62);
          ctx.lineTo(196, 178);
          ctx.lineTo(60, 178);
          ctx.closePath();
          ctx.stroke();
        } else if (mark.shape === 'square') {
          ctx.strokeRect(64, 64, 128, 128);
        } else {
          ctx.beginPath();
          ctx.moveTo(128, 52);
          ctx.lineTo(204, 128);
          ctx.lineTo(128, 204);
          ctx.lineTo(52, 128);
          ctx.closePath();
          ctx.stroke();
        }
        ctx.globalAlpha = 1;

        drawSpeckles(ctx, rnd, cell, cell, {
          count: 180,
          color: '#000000',
          alphaMin: 0.05,
          alphaMax: 0.22,
          sizeMax: 2,
        });
        ctx.restore();
      });
    },
  },

  /* 场地混凝土 + 裂缝漏光（替代 art-direction 的「裂缝漏光」描述）。 */
  'stage-concrete': {
    width: 256,
    height: 256,
    paint: (ctx, width, height) => {
      const rnd = mulberry32(0xc0ac7e);
      const base = ctx.createRadialGradient(width * 0.42, height * 0.36, 8, width * 0.5, height * 0.5, width * 0.75);
      base.addColorStop(0, '#303137');
      base.addColorStop(0.55, '#232429');
      base.addColorStop(1, '#15161a');
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, width, height);

      drawSpeckles(ctx, rnd, width, height, {
        count: 900,
        color: '#0a0b0e',
        alphaMin: 0.06,
        alphaMax: 0.3,
        sizeMax: 2.4,
      });
      drawSpeckles(ctx, rnd, width, height, {
        count: 260,
        color: '#d8d2c4',
        alphaMin: 0.03,
        alphaMax: 0.12,
        sizeMax: 1.6,
      });

      // 三道裂缝：暖白光从缝里漏出来，供 scene 做「裂缝 +1」的发光贴花。
      for (let crack = 0; crack < 3; crack += 1) {
        const startX = width * (0.18 + crack * 0.27) + rnd() * 10;
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 241, 214, 0.78)';
        ctx.lineWidth = 1.6;
        ctx.shadowColor = 'rgba(255, 241, 214, 0.85)';
        ctx.shadowBlur = 9;
        ctx.beginPath();
        ctx.moveTo(startX, 0);
        let x = startX;
        for (let y = 0; y <= height; y += 18) {
          x += (rnd() - 0.5) * 14;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.restore();
      }

      // 磨损的圆形胶带痕与暗渍。
      ctx.save();
      ctx.globalAlpha = 0.16;
      ctx.strokeStyle = '#0a0b0e';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(width * 0.72, height * 0.68, 26, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 0.1;
      ctx.fillStyle = '#000000';
      ctx.beginPath();
      ctx.ellipse(width * 0.24, height * 0.78, 34, 16, 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    },
  },

  /* 舞台网格：给走位与「光落在哪」提供低对比的参照。 */
  'stage-grid': {
    width: 256,
    height: 256,
    paint: (ctx, width, height) => {
      ctx.fillStyle = '#101319';
      ctx.fillRect(0, 0, width, height);

      ctx.strokeStyle = 'rgba(46, 53, 64, 0.9)';
      ctx.lineWidth = 1;
      for (let line = 0; line <= width; line += 32) {
        ctx.beginPath();
        ctx.moveTo(line + 0.5, 0);
        ctx.lineTo(line + 0.5, height);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, line + 0.5);
        ctx.lineTo(width, line + 0.5);
        ctx.stroke();
      }

      ctx.strokeStyle = 'rgba(191, 214, 232, 0.12)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(width / 2, 0);
      ctx.lineTo(width / 2, height);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, height / 2);
      ctx.lineTo(width, height / 2);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(255, 241, 214, 0.28)';
      ctx.lineWidth = 2;
      ctx.strokeRect(1, 1, width - 2, height - 2);

      const rnd = mulberry32(0x9173);
      drawSpeckles(ctx, rnd, width, height, {
        count: 220,
        color: '#000000',
        alphaMin: 0.05,
        alphaMax: 0.2,
        sizeMax: 2,
      });
    },
  },

  /* 噪点颗粒：黑烟、烧穿、裂缝尘、边缘渗出的共享 alpha 纹理。 */
  'noise-grain': {
    width: 128,
    height: 128,
    paint: (ctx, width, height) => {
      ctx.clearRect(0, 0, width, height);
      const rnd = mulberry32(0x6e0173);
      for (let i = 0; i < 900; i += 1) {
        const x = rnd() * width;
        const y = rnd() * height;
        const alpha = 0.08 + rnd() * 0.62;
        const size = 1 + rnd() * 2.4;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = '#07080a';
        ctx.fillRect(x, y, size, size);
      }
      // 少量边缘碎屑，避免看起来像均匀噪点。
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = '#07080a';
      ctx.lineWidth = 1;
      for (let i = 0; i < 24; i += 1) {
        const x = rnd() * width;
        const y = rnd() * height;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + (rnd() - 0.5) * 10, y + (rnd() - 0.5) * 10);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    },
  },

  /* 后台曲目单：四行手写笔迹、胶带、咖啡环；不出现任何真实歌名。 */
  'setlist-paper': {
    width: 512,
    height: 256,
    paint: (ctx, width, height) => {
      ctx.fillStyle = '#efe8d8';
      ctx.fillRect(0, 0, width, height);

      const rnd = mulberry32(0x5e7115);
      drawSpeckles(ctx, rnd, width, height, {
        count: 520,
        color: '#8a7c62',
        alphaMin: 0.025,
        alphaMax: 0.09,
        sizeMax: 1.6,
      });

      // 左侧装订线与页边。
      ctx.strokeStyle = 'rgba(138, 124, 98, 0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(74, 0);
      ctx.lineTo(74, height);
      ctx.stroke();

      // 四条手写线（每行两笔，像真的写了两遍）。
      const lineRnd = mulberry32(0x4c1e5);
      ctx.strokeStyle = 'rgba(42, 38, 32, 0.82)';
      ctx.lineWidth = 2.4;
      ctx.lineCap = 'round';
      for (let line = 0; line < 4; line += 1) {
        const y = 64 + line * 40;
        for (let pass = 0; pass < 2; pass += 1) {
          ctx.beginPath();
          ctx.moveTo(96 + pass * 2, y);
          let x = 96;
          let py = y;
          while (x < 448) {
            const step = 22 + lineRnd() * 26;
            const nx = Math.min(448, x + step);
            const ny = y + (lineRnd() - 0.5) * 9;
            ctx.quadraticCurveTo((x + nx) / 2, py + (lineRnd() - 0.5) * 12, nx, ny);
            x = nx;
            py = ny;
          }
          ctx.stroke();
        }
        ctx.fillStyle = 'rgba(42, 38, 32, 0.7)';
        ctx.beginPath();
        ctx.arc(88, y - 2, 3.2, 0, Math.PI * 2);
        ctx.fill();
      }

      // 胶带：两条半透明斜条，压住纸角。
      ctx.save();
      ctx.globalAlpha = 0.42;
      ctx.fillStyle = '#f7f2e6';
      ctx.translate(46, 24);
      ctx.rotate(-0.5);
      ctx.fillRect(-34, -9, 68, 18);
      ctx.restore();
      ctx.save();
      ctx.globalAlpha = 0.36;
      ctx.fillStyle = '#f7f2e6';
      ctx.translate(width - 52, height - 26);
      ctx.rotate(0.42);
      ctx.fillRect(-36, -9, 72, 18);
      ctx.restore();

      // 咖啡环与折痕。
      ctx.save();
      ctx.globalAlpha = 0.18;
      ctx.strokeStyle = '#7a5a3a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(width - 96, 72, 30, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 0.12;
      ctx.beginPath();
      ctx.moveTo(120, height - 18);
      ctx.lineTo(width - 24, height - 40);
      ctx.stroke();
      ctx.restore();
    },
  },

  /* 旧海报：只做几何印刷图案，不写任何真实乐队/曲名。 */
  handbill: {
    width: 512,
    height: 256,
    paint: (ctx, width, height) => {
      const rnd = mulberry32(0x4a11b11);
      const paper = ctx.createLinearGradient(0, 0, width, height);
      paper.addColorStop(0, '#d9cdb4');
      paper.addColorStop(0.55, '#c9bb9f');
      paper.addColorStop(1, '#b6a687');
      ctx.fillStyle = paper;
      ctx.fillRect(0, 0, width, height);

      // 撕边：沿四角切掉不规则块。
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      for (let x = 0; x <= width; x += 18) ctx.lineTo(x, rnd() * 8);
      ctx.lineTo(width, 0);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(0, height);
      for (let x = 0; x <= width; x += 22) ctx.lineTo(x, height - rnd() * 12);
      ctx.lineTo(width, height);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // 印刷主图形：一个大同心圆（音箱）+ 斜向条带 + 半调网点。
      ctx.save();
      ctx.translate(width * 0.27, height * 0.48);
      ctx.strokeStyle = 'rgba(26, 24, 22, 0.82)';
      ctx.lineWidth = 5;
      for (const radius of [20, 40, 62]) {
        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(26, 24, 22, 0.8)';
      ctx.beginPath();
      ctx.arc(0, 0, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.translate(width * 0.62, 0);
      ctx.rotate(-0.18);
      for (let band = 0; band < 3; band += 1) {
        ctx.fillStyle = band === 1 ? 'rgba(255, 241, 214, 0.55)' : 'rgba(26, 24, 22, 0.72)';
        ctx.fillRect(0, 58 + band * 34, width * 0.52, 10);
      }
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = 0.45;
      ctx.fillStyle = '#1a1816';
      for (let gy = 0; gy < 7; gy += 1) {
        for (let gx = 0; gx < 12; gx += 1) {
          ctx.beginPath();
          ctx.arc(width - 150 + gx * 10, height - 74 + gy * 8, 1.6, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();

      // 订书钉与折痕。
      ctx.fillStyle = 'rgba(60, 58, 54, 0.9)';
      for (const staple of [
        [18, 18],
        [width - 24, 20],
      ] as const) {
        ctx.fillRect(staple[0], staple[1], 10, 3);
      }
      ctx.strokeStyle = 'rgba(60, 52, 40, 0.22)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, height * 0.32);
      ctx.lineTo(width, height * 0.34);
      ctx.stroke();
    },
  },

  /* 地面光池：径向柔光，材质用加法混合并按区色染色。 */
  'zone-glow': {
    width: 256,
    height: 256,
    paint: (ctx, width, height) => {
      ctx.clearRect(0, 0, width, height);
      const radius = width * 0.5;
      const glow = ctx.createRadialGradient(width / 2, height / 2, 2, width / 2, height / 2, radius);
      glow.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
      glow.addColorStop(0.32, 'rgba(255, 255, 255, 0.55)');
      glow.addColorStop(0.66, 'rgba(255, 255, 255, 0.16)');
      glow.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(width / 2, height / 2, radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(width / 2, height / 2, radius * 0.78, 0, Math.PI * 2);
      ctx.stroke();
    },
  },

  /* 手机灯：小尺寸四角星 + 暖白核心，768 个实例共用一张。 */
  'phone-flare': {
    width: 32,
    height: 32,
    paint: (ctx, width, height) => {
      ctx.clearRect(0, 0, width, height);
      const glow = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, width / 2);
      glow.addColorStop(0, 'rgba(255, 255, 255, 1)');
      glow.addColorStop(0.28, 'rgba(255, 241, 214, 0.82)');
      glow.addColorStop(0.66, 'rgba(255, 241, 214, 0.2)');
      glow.addColorStop(1, 'rgba(255, 241, 214, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, width, height);

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(width / 2, 4);
      ctx.lineTo(width / 2, height - 4);
      ctx.moveTo(4, height / 2);
      ctx.lineTo(width - 4, height / 2);
      ctx.stroke();
    },
  },

  /* 光锥边缘：上亮下淡、左右柔化；材质只在地面以上 2.2m 使用，α≤0.12。 */
  'cone-falloff': {
    width: 128,
    height: 128,
    paint: (ctx, width, height) => {
      const image = ctx.createImageData(width, height);
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const nx = ((x + 0.5) / width) * 2 - 1;
          const ny = (y + 0.5) / height;
          const edge = 1 - smoothstep(0.42, 1, Math.abs(nx));
          const vertical = 0.18 + 0.82 * (1 - ny) * (1 - ny);
          const alpha = Math.round(255 * edge * vertical);
          const offset = (y * width + x) * 4;
          image.data[offset] = 255;
          image.data[offset + 1] = 255;
          image.data[offset + 2] = 255;
          image.data[offset + 3] = alpha;
        }
      }
      ctx.putImageData(image, 0, 0);
    },
  },

  /* 人浪绸带 / 合唱波：横向拉丝，两端透明，中间亮。 */
  'wave-streak': {
    width: 256,
    height: 64,
    paint: (ctx, width, height) => {
      ctx.clearRect(0, 0, width, height);
      const rnd = mulberry32(0x7a11e);
      for (let streak = 0; streak < 3; streak += 1) {
        const centerY = height * (0.28 + streak * 0.22);
        const thickness = 5 + streak * 3;
        const gradient = ctx.createLinearGradient(0, 0, width, 0);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 0)');
        gradient.addColorStop(0.18, 'rgba(255, 255, 255, 0.35)');
        gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.95)');
        gradient.addColorStop(0.82, 'rgba(255, 255, 255, 0.35)');
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = gradient;
        ctx.globalAlpha = 0.75 - streak * 0.16;
        ctx.beginPath();
        ctx.moveTo(0, centerY);
        ctx.quadraticCurveTo(width * 0.5, centerY - thickness * 2.4, width, centerY);
        ctx.quadraticCurveTo(width * 0.5, centerY + thickness * 2.4, 0, centerY);
        ctx.closePath();
        ctx.fill();
      }

      ctx.globalAlpha = 0.5;
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < 26; i += 1) {
        ctx.beginPath();
        ctx.arc(rnd() * width, rnd() * height, 0.8 + rnd() * 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    },
  },
};

/* ==========================================================================
 * 4. 内联 SVG：13 个图形生成器
 * ========================================================================== */

/** 13 个 SVG 图形的 id。 */
export type SvgId =
  | 'zone-mark-root'
  | 'zone-mark-third'
  | 'zone-mark-fifth'
  | 'zone-mark-seventh'
  | 'icon-ear'
  | 'icon-plug'
  | 'icon-silent'
  | 'rank-stamp'
  | 'wordmark'
  | 'menu-silhouettes'
  | 'pedal-chorus'
  | 'pedal-solo'
  | 'pedal-bait';

/** 13 个 SVG id 的稳定顺序。 */
export const SVG_IDS: readonly SvgId[] = [
  'zone-mark-root',
  'zone-mark-third',
  'zone-mark-fifth',
  'zone-mark-seventh',
  'icon-ear',
  'icon-plug',
  'icon-silent',
  'rank-stamp',
  'wordmark',
  'menu-silhouettes',
  'pedal-chorus',
  'pedal-solo',
  'pedal-bait',
];

/** SVG 生成参数：label 会做 XML 转义；未提供时使用各自的默认文案。 */
export interface SvgOptions {
  readonly label?: string;
}

/** 单个 SVG 生成器。 */
export type SvgGenerator = (options?: SvgOptions) => string;

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case "'":
        return '&apos;';
      default:
        return character;
    }
  });
}

function wrapSvg(viewBox: string, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" role="img" aria-hidden="true">${body}</svg>`;
}

function zoneMark(path: string, label: string): string {
  return wrapSvg(
    '0 0 64 64',
    `<title>${escapeXml(label)}</title><path d="${path}" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>`,
  );
}

function pedalPanel(variant: 'chorus' | 'solo' | 'bait', label: string): string {
  const accents: Readonly<Record<typeof variant, string>> = {
    chorus:
      '<g fill="currentColor"><circle cx="34" cy="104" r="3"/><circle cx="44" cy="104" r="3"/><circle cx="54" cy="104" r="3"/><circle cx="64" cy="104" r="3"/></g>',
    solo: '<path d="M30 110 L66 98" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>',
    bait: '<path d="M30 100 L42 108 L54 100 L66 108" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>',
  };
  const knobs = [28, 48, 68]
    .map(
      (cx) =>
        `<g><circle cx="${cx}" cy="38" r="9" fill="none" stroke="currentColor" stroke-width="3"/><path d="M${cx} 38 L${cx} 31" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></g>`,
    )
    .join('');
  const screws = [
    [12, 12],
    [84, 12],
    [12, 116],
    [84, 116],
  ]
    .map(([cx, cy]) => `<circle cx="${cx}" cy="${cy}" r="2" fill="currentColor"/>`)
    .join('');
  return wrapSvg(
    '0 0 96 128',
    `<title>${escapeXml(label)}</title>` +
      `<rect x="5" y="5" width="86" height="118" rx="7" fill="none" stroke="currentColor" stroke-width="3"/>` +
      knobs +
      `<rect x="18" y="66" width="60" height="22" rx="3" fill="none" stroke="currentColor" stroke-width="2" opacity="0.6"/>` +
      `<text x="48" y="82" text-anchor="middle" font-family="'PingFang SC','Microsoft YaHei','Noto Sans SC',system-ui,sans-serif" font-size="11" fill="currentColor">${escapeXml(label)}</text>` +
      accents[variant] +
      screws,
  );
}

/**
 * 13 个 SVG 生成器（Record 的键即全部 id，少一个会编译报错）。
 * 所有图形只使用 currentColor，主题由 theme.css 控制，不内嵌颜色与字体文件。
 */
export const SVG_GENERATORS: Readonly<Record<SvgId, SvgGenerator>> = {
  'zone-mark-root': () => zoneMark('M14 32 H50', '根音区'),
  'zone-mark-third': () => zoneMark('M20 46 L32 18 L44 46 Z', '三度区'),
  'zone-mark-fifth': () => zoneMark('M20 20 H44 V44 H20 Z', '五度区'),
  'zone-mark-seventh': () => zoneMark('M32 14 L50 32 L32 50 L14 32 Z', '七度区'),

  'icon-ear': () =>
    wrapSvg(
      '0 0 64 64',
      '<title>返听锁定</title>' +
        '<path d="M40 14c-12-6-24 2-24 14 0 9 7 12 7 19 0 5 5 8 10 6" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>' +
        '<path d="M40 23c-6-3-12 0-12 7 0 5 4 7 4 11" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" opacity="0.7"/>' +
        '<circle cx="47" cy="47" r="3" fill="currentColor"/>',
    ),

  'icon-plug': () =>
    wrapSvg(
      '0 0 64 64',
      '<title>断线</title>' +
        '<rect x="20" y="26" width="18" height="16" rx="3" fill="none" stroke="currentColor" stroke-width="4"/>' +
        '<path d="M38 30h8M38 38h8" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>' +
        '<path d="M20 34H10M10 34c-4 0-4 8 0 8h10" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>',
    ),

  'icon-silent': () =>
    wrapSvg(
      '0 0 64 64',
      '<title>静默</title>' +
        '<circle cx="32" cy="32" r="18" fill="none" stroke="currentColor" stroke-width="4"/>' +
        '<path d="M18 18 L46 46" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>',
    ),

  'rank-stamp': (options) => {
    const raw = options?.label?.trim().toUpperCase() ?? 'S';
    const grade = raw === 'A' || raw === 'B' || raw === 'C' ? raw : 'S';
    return wrapSvg(
      '0 0 64 64',
      `<title>评级 ${escapeXml(grade)}</title>` +
        '<circle cx="32" cy="32" r="26" fill="none" stroke="currentColor" stroke-width="3"/>' +
        '<circle cx="32" cy="32" r="21" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.6"/>' +
        `<text x="32" y="41" text-anchor="middle" font-family="'PingFang SC','Microsoft YaHei','Noto Sans SC',system-ui,sans-serif" font-size="26" font-weight="600" fill="currentColor">${escapeXml(grade)}</text>`,
    );
  },

  wordmark: () =>
    wrapSvg(
      '0 0 320 64',
      '<title>谁在听</title>' +
        '<rect x="0" y="12" width="3" height="40" fill="currentColor"/>' +
        `<text x="14" y="42" font-family="'PingFang SC','Microsoft YaHei','Noto Sans SC',system-ui,sans-serif" font-size="34" font-weight="600" letter-spacing="2" fill="currentColor">谁在听</text>` +
        `<text x="16" y="58" font-family="'PingFang SC','Microsoft YaHei','Noto Sans SC',system-ui,sans-serif" font-size="8" letter-spacing="3" fill="currentColor" opacity="0.65">WHO IS LISTENING</text>`,
    ),

  'menu-silhouettes': () => {
    const people: readonly string[] = [
      // 主唱：细长 + 外扩头发 + 麦克风。
      '<g transform="translate(20 0)"><circle cx="0" cy="16" r="6" fill="currentColor"/><path d="M-11 54 C-11 34 -6 26 0 26 C6 26 11 34 11 54 Z" fill="currentColor"/><path d="M-6 28 L-12 22 M6 28 L12 22" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/><path d="M10 34 L17 30" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></g>',
      // 吉他：窄肩前倾 + 斜三角琴。
      '<g transform="translate(66 0)"><circle cx="0" cy="16" r="6" fill="currentColor"/><path d="M-9 54 C-9 35 -5 27 0 27 C5 27 9 35 9 54 Z" fill="currentColor"/><path d="M-2 34 L14 42 L10 50 L-4 43 Z" fill="currentColor" opacity="0.75"/><path d="M12 41 L20 35" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></g>',
      // 贝斯：宽肩站直 + 长横线。
      '<g transform="translate(112 0)"><circle cx="0" cy="16" r="6" fill="currentColor"/><path d="M-12 54 C-12 34 -7 26 0 26 C7 26 12 34 12 54 Z" fill="currentColor"/><path d="M-14 40 L18 34" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></g>',
      // 鼓：最宽 + 坐姿 + 两根鼓棒。
      '<g transform="translate(158 0)"><circle cx="0" cy="18" r="6" fill="currentColor"/><path d="M-16 54 C-16 38 -9 30 0 30 C9 30 16 38 16 54 Z" fill="currentColor"/><path d="M-12 34 L-4 24 M12 34 L4 24" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></g>',
    ];
    return wrapSvg('0 0 180 64', '<title>四名成员剪影</title>' + people.join(''));
  },

  'pedal-chorus': (options) => pedalPanel('chorus', options?.label ?? '合唱墙'),
  'pedal-solo': (options) => pedalPanel('solo', options?.label ?? '回照'),
  'pedal-bait': (options) => pedalPanel('bait', options?.label ?? '引线'),
};

/** 取一个 SVG 字符串；未知 id 在类型层被拒绝，运行期不需要兜底。 */
export function svgMarkup(id: SvgId, options?: SvgOptions): string {
  return SVG_GENERATORS[id](options);
}
