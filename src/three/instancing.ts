/**
 * 实例化渲染层：768 席观众 + 手机灯、噪音（3 常规 + 精英 + Boss）、粒子（dev-three 所有）。
 *
 * 契约：`docs/tech-spec.md` §5.4（`AudienceInstances` / `NoiseInstances` / `ParticleInstances`）
 * 与 §9.2 的上传策略：
 * - 观众 `instanceMatrix` 只在座位布局/出席状态变化时上传，`instanceColor` 按脏区局部上传；
 * - 三种常规噪音各 1 个 InstancedMesh（art-direction §6 L7 的 draw call 预算），精英与 Boss 各 1；
 * - 粒子 1 个 InstancedMesh（四边形），低画质由调用方压 `count`（tech-spec §9.1 低 120）。
 *
 * 座位坐标来自 `src/data/seats.ts` 的 `seatPositionAt`（唯一真源），与 `models.buildSeats`
 * 调用同一函数；本模块不得保留第二份 gap / spacing / origin 常量。
 *
 * 消费边界：只读 `AudienceFrame` / `NoiseFrame` / `ParticleFrame` 与 `DataRegistry`，
 * 不 import React，不改 game 状态；所有几何体/材质在本模块 `dispose()` 释放。
 */

import * as THREE from 'three';
import { buildAudienceGeometry, buildNoiseGeometries } from './models';
import { seatPositionAt } from '../data/seats';
import type { AudienceFrame, DirtyRange, NoiseFrame, NoiseKind, ParticleFrame, ZoneId } from '../types/game';
import type { DataRegistry, PaletteDef, PaletteToken, SeatGridDef } from '../types/data';
import type { DisplaySettings } from '../types/save';

export interface AudienceInstances {
  readonly mesh: THREE.InstancedMesh;
  readonly phones: THREE.InstancedMesh;
  apply(frame: AudienceFrame, settings: DisplaySettings): void;
  dispose(): void;
}

export interface NoiseInstances {
  /** 主网格：三种常规噪音合并前的底噪实例（规格要求的主 mesh）。 */
  readonly mesh: THREE.InstancedMesh;
  /** 五种噪音的挂载组（scene 只 add 这一层；含 `mesh`、啸叫/失真/返听/静默各 1 网格）。 */
  readonly group: THREE.Group;
  apply(frame: NoiseFrame, settings: DisplaySettings): void;
  dispose(): void;
}

export interface ParticleInstances {
  readonly mesh: THREE.InstancedMesh;
  apply(frame: ParticleFrame): void;
  dispose(): void;
}

/* ==========================================================================
 * 常量
 * ========================================================================== */

/** 四区顺序固定（game.ts `ZoneId` 的声明顺序；`AudienceFrame.zone` 用同一顺序）。 */
const ZONE_ORDER: readonly ZoneId[] = ['front-left', 'front-right', 'back-left', 'back-right'];

/** 五种噪音顺序固定（game.ts `NoiseKind` 的声明顺序；`NoiseFrame.kind` 用同一顺序）。 */
const NOISE_ORDER: readonly NoiseKind[] = ['floor-noise', 'scream', 'distortion', 'return-listener', 'silence'];

/** 椅面高度：models 的座椅 Box 高 0.5 并上移 0.25（底面贴地）；纯视觉偏移，不是座位坐标。 */
const CHAIR_SURFACE_Y = 0.5;

/** 手机灯面片在坐姿头部前上方（米）。 */
const PHONE_OFFSET_X = 0.13;
const PHONE_OFFSET_Y = 0.62;

/** 低画质可见上限（GDD §16.3 / art-direction §10）。 */
const LOW_QUALITY_AUDIENCE = 384;
const LOW_QUALITY_NOISE = 90;

/** 精英与 Boss 池容量（GDD §8.2「同时 2 只」、§8.3 单个 Boss）。 */
const ELITE_CAPACITY = 2;
const BOSS_CAPACITY = 1;

/** 三色兜底（art-direction §3）。 */
const GREY_FALLBACK = '#6e7480';
const BLACK_FALLBACK = '#07080a';
const PHONE_FALLBACK = '#fff1d6';
const ZONE_FALLBACKS: readonly string[] = ['#bfd6e8', '#ff3d7f', '#35e0d0', '#ffb03a'];

/* ==========================================================================
 * 观众 + 手机灯
 * ========================================================================== */

/** 当前激活的观众实例（renderer 惰性绑定）。 */
let activeAudience: AudienceInstances | null = null;
/** 当前激活的噪音实例（renderer 惰性绑定）。 */
let activeNoise: NoiseInstances | null = null;
/** 当前激活的粒子实例（renderer 惰性绑定）。 */
let activeParticles: ParticleInstances | null = null;

/**
 * 创建观众与手机灯实例。`data` 提供座位网格、四区颜色与三色色板。
 * 返回的两个网格都不自动挂到场景，由 renderer 在绑定时 add。
 */
export function createAudienceInstances(data: DataRegistry): AudienceInstances {
  const layout = computeSeatLayout(data.seats);
  const capacity = layout.count;

  const greyColor = tokenColor(data.palette, data.palette.audienceStates.grey, GREY_FALLBACK);
  const blackColor = tokenColor(data.palette, data.palette.audienceStates.black, BLACK_FALLBACK);
  const phoneColor = new THREE.Color(PHONE_FALLBACK);
  const zoneColors = resolveZoneColors(data);

  const geometry = buildAudienceGeometry();
  const material = createAudienceMaterial();
  const mesh = new THREE.InstancedMesh(geometry, material, capacity);
  mesh.name = 'gbl-audience';
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;

  const colorAttribute = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
  colorAttribute.setUsage(THREE.DynamicDrawUsage);
  mesh.instanceColor = colorAttribute;

  const phoneGeometry = new THREE.PlaneGeometry(0.09, 0.07);
  const phoneMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
    fog: false,
  });
  const phones = new THREE.InstancedMesh(phoneGeometry, phoneMaterial, capacity);
  phones.name = 'gbl-audience-phones';
  phones.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  phones.frustumCulled = false;

  const phoneColorAttribute = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
  phoneColorAttribute.setUsage(THREE.DynamicDrawUsage);
  phones.instanceColor = phoneColorAttribute;

  // 静态矩阵：座位坐标 + 椅面高度；手机灯贴在头侧。
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const position = new THREE.Vector3();
  const scaleVector = new THREE.Vector3(1, 1, 1);
  for (let index = 0; index < capacity; index += 1) {
    const x = layout.x[index] ?? 0;
    const y = (layout.y[index] ?? 0) + CHAIR_SURFACE_Y;
    const z = layout.z[index] ?? 0;
    position.set(x + PHONE_OFFSET_X, y + PHONE_OFFSET_Y, z);
    matrix.compose(position, quaternion, scaleVector);
    phones.setMatrixAt(index, matrix);
  }
  phones.instanceMatrix.needsUpdate = true;

  const scratchColor = new THREE.Color();
  const hidden = new Uint8Array(capacity);
  const standing = new Uint8Array(capacity);
  let matricesInitialized = false;
  let lastRevision = -1;

  function writeMatrix(index: number): void {
    const isHidden = hidden[index] === 1;
    const isStanding = standing[index] === 1;
    position.set(layout.x[index] ?? 0, (layout.y[index] ?? 0) + CHAIR_SURFACE_Y, layout.z[index] ?? 0);
    // v1.0.1 P0-1：坐姿 1.08、站姿 1.38——比 v1.0.0 高一档，40px 下能压住椅背。
    const base = isStanding ? 1.38 : 1.08;
    const flat = isHidden ? 0 : base;
    scaleVector.set(flat, isHidden ? 0 : base, flat);
    matrix.compose(position, quaternion, scaleVector);
    mesh.setMatrixAt(index, matrix);
  }

  function writeSeatColor(frame: AudienceFrame, index: number): void {
    const code = frame.state[index] ?? 0;
    if (code === 1) {
      const heat = frame.heat[index] ?? 0;
      // v1.0.1 P0-1：未表态的灰比 v1.0.0 提亮约 40%，与更暗的椅背形成「人 vs 椅子」的明暗差。
      scratchColor.copy(greyColor).multiplyScalar(1.0 + 0.05 * heat);
    } else if (code === 2) {
      const heat = frame.heat[index] ?? 0;
      const tint = clamp(frame.tint[index] ?? 1, 0, 1);
      const zone = frame.zone[index] ?? 0;
      const zoneColor = zoneColors[zone] ?? greyColor;
      scratchColor.copy(greyColor).lerp(zoneColor, tint);
      scratchColor.multiplyScalar(clamp(0.72 + 0.12 * heat, 0.72, 1.24));
    } else {
      // 空座 / 已离场 / 被噪音覆盖：纯黑剪影。椅背已提亮到 #2b3341，
      // 因此「被覆盖的人」是一个能被看见的黑形（P0-3），手机灯同时熄灭。
      scratchColor.copy(blackColor);
    }
    colorAttribute.setXYZ(index, scratchColor.r, scratchColor.g, scratchColor.b);
  }

  function writePhoneColor(frame: AudienceFrame, index: number): void {
    const state = frame.state[index] ?? 0;
    const phoneOn = frame.phone[index] ?? 0;
    if (state !== 2 || phoneOn === 0) {
      phoneColorAttribute.setXYZ(index, 0, 0, 0);
      return;
    }
    const heat = frame.heat[index] ?? 0;
    const brightness = clamp(0.5 + 0.16 * heat, 0.35, 1.35);
    phoneColorAttribute.setXYZ(
      index,
      phoneColor.r * brightness,
      phoneColor.g * brightness,
      phoneColor.b * brightness,
    );
  }

  function applyAll(frame: AudienceFrame): void {
    for (let index = 0; index < capacity; index += 1) {
      const code = frame.state[index] ?? 0;
      hidden[index] = code === 0 || code === 4 ? 1 : 0;
      // 热度 ≥2 = 举棒/合唱：站姿比坐姿高 28%（art-direction §4「三态用姿态」）。
      standing[index] = code === 2 && (frame.heat[index] ?? 0) >= 2 ? 1 : 0;
      writeMatrix(index);
      writeSeatColor(frame, index);
      writePhoneColor(frame, index);
    }
    mesh.instanceMatrix.needsUpdate = true;
    colorAttribute.clearUpdateRanges();
    phoneColorAttribute.clearUpdateRanges();
    colorAttribute.needsUpdate = true;
    phoneColorAttribute.needsUpdate = true;
  }

  const audience: AudienceInstances = {
    mesh,
    phones,

    apply(frame: AudienceFrame, settings: DisplaySettings): void {
      const size = clamp(Math.floor(frame.size), 0, capacity);
      const visibleCount = settings.quality === 'low' ? Math.min(LOW_QUALITY_AUDIENCE, size) : size;
      mesh.count = visibleCount;
      phones.count = visibleCount;
      mesh.visible = visibleCount > 0;
      phones.visible = visibleCount > 0;

      if (!matricesInitialized || frame.revision !== lastRevision) {
        applyAll(frame);
        matricesInitialized = true;
        lastRevision = frame.revision;
        return;
      }

      if (frame.dirty.length === 0) return;

      let matrixChanged = false;
      for (const range of frame.dirty) {
        const bounds = clampRange(range, capacity);
        if (bounds.count === 0) continue;
        for (let index = bounds.start; index < bounds.start + bounds.count; index += 1) {
          const code = frame.state[index] ?? 0;
          const shouldHide = code === 0 || code === 4;
          const shouldStand = code === 2 && (frame.heat[index] ?? 0) >= 2;
          if ((hidden[index] === 1) !== shouldHide || (standing[index] === 1) !== shouldStand) {
            hidden[index] = shouldHide ? 1 : 0;
            standing[index] = shouldStand ? 1 : 0;
            writeMatrix(index);
            matrixChanged = true;
          }
          writeSeatColor(frame, index);
          writePhoneColor(frame, index);
        }
        colorAttribute.addUpdateRange(bounds.start * 3, bounds.count * 3);
        phoneColorAttribute.addUpdateRange(bounds.start * 3, bounds.count * 3);
      }

      if (matrixChanged) mesh.instanceMatrix.needsUpdate = true;
      colorAttribute.needsUpdate = true;
      phoneColorAttribute.needsUpdate = true;
    },

    dispose(): void {
      mesh.removeFromParent();
      phones.removeFromParent();
      geometry.dispose();
      material.dispose();
      phoneGeometry.dispose();
      phoneMaterial.dispose();
      if (activeAudience === audience) activeAudience = null;
    },
  };

  activeAudience = audience;
  return audience;
}

/**
 * 当前激活的观众实例（renderer 读取；`main.tsx` 不直接使用）。
 * 存在原因：tech-spec §5.4 的 `createRenderer(canvas)` 没有实例参数，§6.4 要求启动时创建一次。
 */
export function getActiveAudienceInstances(): AudienceInstances | null {
  return activeAudience;
}

/* ==========================================================================
 * 噪音
 * ========================================================================== */

/**
 * 每种噪音的视觉参数（v1.0.1 P0-3）：
 * - `rim`：加法描边壳颜色（暗场里先看见边，再看见黑体）；
 * - `mark`：贴地光环颜色（噪音在哪一排、离你多远）。
 */
const NOISE_RIM_COLORS: Readonly<Record<NoiseKind, number>> = {
  'floor-noise': 0x6f8ba8,
  scream: 0xd8ecff,
  distortion: 0xffb03a,
  'return-listener': 0xffd08a,
  silence: 0x8f9fd8,
};

const NOISE_MARK_COLORS: Readonly<Record<NoiseKind, number>> = {
  'floor-noise': 0x5f86a8,
  scream: 0x9fd4ff,
  distortion: 0xffc766,
  'return-listener': 0xffe0a0,
  silence: 0x8fa2e0,
};

/**
 * 创建噪音实例：3 常规 + 精英 + Boss。
 * 每种 kind = 1 个实体网格（纯黑）+ 1 个加法描边壳（BackSide 放大 6%）；
 * 另加 1 个贴地光环 InstancedMesh 作为「在哪」的定位层。draw call 峰值 5+5+1。
 */
export function createNoiseInstances(capacity: number): NoiseInstances {
  const commonCapacity = Math.max(1, Math.floor(capacity));
  const geometries = buildNoiseGeometries();
  const material = new THREE.MeshBasicMaterial({ color: 0x07080a, toneMapped: false });
  const rimMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.6,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
    toneMapped: false,
    fog: false,
  });
  const markGeometry = new THREE.RingGeometry(0.45, 0.62, 20, 1);
  markGeometry.rotateX(-Math.PI / 2);
  const markMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.8,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    fog: false,
  });

  const group = new THREE.Group();
  group.name = 'gbl-noise';

  const meshByKind = {
    'floor-noise': createBody('floor-noise', commonCapacity),
    scream: createBody('scream', commonCapacity),
    distortion: createBody('distortion', commonCapacity),
    'return-listener': createBody('return-listener', ELITE_CAPACITY),
    silence: createBody('silence', BOSS_CAPACITY),
  } as const satisfies Readonly<Record<NoiseKind, THREE.InstancedMesh>>;

  const rimByKind = {
    'floor-noise': createRim('floor-noise', commonCapacity),
    scream: createRim('scream', commonCapacity),
    distortion: createRim('distortion', commonCapacity),
    'return-listener': createRim('return-listener', ELITE_CAPACITY),
    silence: createRim('silence', BOSS_CAPACITY),
  } as const satisfies Readonly<Record<NoiseKind, THREE.InstancedMesh>>;

  const marks = new THREE.InstancedMesh(markGeometry, markMaterial, commonCapacity + ELITE_CAPACITY + BOSS_CAPACITY);
  marks.name = 'gbl-noise-marks';
  marks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  marks.frustumCulled = false;
  marks.count = 0;
  marks.visible = false;

  for (const kind of NOISE_ORDER) {
    group.add(meshByKind[kind]);
    group.add(rimByKind[kind]);
  }
  group.add(marks);

  const counts = new Uint16Array(NOISE_ORDER.length);
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const position = new THREE.Vector3();
  const scaleVector = new THREE.Vector3();
  const scratchColor = new THREE.Color();
  let markCount = 0;

  function createBody(kind: NoiseKind, count: number): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(geometries[kind], material, count);
    mesh.name = `gbl-noise-${kind}`;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.count = 0;
    mesh.visible = false;
    return mesh;
  }

  function createRim(kind: NoiseKind, count: number): THREE.InstancedMesh {
    const rim = new THREE.InstancedMesh(geometries[kind], rimMaterial, count);
    rim.name = `gbl-noise-rim-${kind}`;
    rim.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    rim.frustumCulled = false;
    rim.count = 0;
    rim.visible = false;
    const colors = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);
    colors.setUsage(THREE.DynamicDrawUsage);
    rim.instanceColor = colors;
    return rim;
  }

  const noise: NoiseInstances = {
    mesh: meshByKind['floor-noise'],
    group,

    apply(frame: NoiseFrame, settings: DisplaySettings): void {
      counts.fill(0);
      markCount = 0;
      const limit = settings.quality === 'low' ? Math.min(commonCapacity, LOW_QUALITY_NOISE) : commonCapacity;
      const total = clamp(Math.floor(frame.count), 0, commonCapacity);
      const stride = 2;
      const positions = frame.position;

      for (let index = 0; index < total; index += 1) {
        const kindCode = frame.kind[index] ?? 0;
        const kind = NOISE_ORDER[kindCode];
        if (kind === undefined) continue;
        const slot = counts[kindCode] ?? 0;
        const capacityForKind =
          kind === 'return-listener' ? ELITE_CAPACITY : kind === 'silence' ? BOSS_CAPACITY : limit;
        if (slot >= capacityForKind) continue;

        const x = positions[index * stride] ?? 0;
        const z = positions[index * stride + 1] ?? 0;
        const rotation = frame.rotation[index] ?? 0;
        const scale = clamp(frame.scale[index] ?? 1, 0, 4);

        position.set(x, 0, z);
        euler.set(0, rotation, 0, 'XYZ');
        quaternion.setFromEuler(euler);
        scaleVector.set(scale, scale, scale);
        matrix.compose(position, quaternion, scaleVector);
        meshByKind[kind].setMatrixAt(slot, matrix);

        // 描边壳：同几何放大 6% + BackSide，暗场里先读到轮廓。
        scaleVector.set(scale * 1.06, scale * 1.06, scale * 1.06);
        matrix.compose(position, quaternion, scaleVector);
        rimByKind[kind].setMatrixAt(slot, matrix);
        scratchColor.setHex(NOISE_RIM_COLORS[kind]);
        rimByKind[kind].setColorAt(slot, scratchColor);

        // 悬空光环：噪音本体贴地、在暗场里只有几像素；标记抬到 2.3m 才读得到「在哪」。
        position.set(x, 2.3 + scale * 0.25, z);
        scaleVector.set(scale, 1, scale);
        matrix.compose(position, quaternion, scaleVector);
        marks.setMatrixAt(markCount, matrix);
        scratchColor.setHex(NOISE_MARK_COLORS[kind]);
        marks.setColorAt(markCount, scratchColor);
        markCount += 1;

        counts[kindCode] = slot + 1;
      }

      for (let code = 0; code < NOISE_ORDER.length; code += 1) {
        const kind = NOISE_ORDER[code];
        if (kind === undefined) continue;
        const count = counts[code] ?? 0;
        const body = meshByKind[kind];
        body.count = count;
        body.visible = count > 0;
        if (count > 0) body.instanceMatrix.needsUpdate = true;
        const rim = rimByKind[kind];
        rim.count = count;
        rim.visible = count > 0;
        if (count > 0) {
          rim.instanceMatrix.needsUpdate = true;
          if (rim.instanceColor !== null) rim.instanceColor.needsUpdate = true;
        }
      }

      marks.count = markCount;
      marks.visible = markCount > 0;
      if (markCount > 0) {
        marks.instanceMatrix.needsUpdate = true;
        if (marks.instanceColor !== null) marks.instanceColor.needsUpdate = true;
      }
    },

    dispose(): void {
      group.removeFromParent();
      for (const kind of NOISE_ORDER) {
        meshByKind[kind].removeFromParent();
        meshByKind[kind].dispose();
        rimByKind[kind].removeFromParent();
        rimByKind[kind].dispose();
      }
      marks.removeFromParent();
      marks.dispose();
      for (const kind of NOISE_ORDER) geometries[kind].dispose();
      material.dispose();
      rimMaterial.dispose();
      markGeometry.dispose();
      markMaterial.dispose();
      group.clear();
      if (activeNoise === noise) activeNoise = null;
    },
  };

  activeNoise = noise;
  return noise;
}

/**
 * 当前激活的噪音实例（renderer 读取；`main.tsx` 不直接使用）。
 * 存在原因同 `getActiveAudienceInstances`。
 */
export function getActiveNoiseInstances(): NoiseInstances | null {
  return activeNoise;
}

/* ==========================================================================
 * 粒子
 * ========================================================================== */

/** 创建粒子实例（一个四边形 InstancedMesh；颜色即亮度，加法混合）。 */
export function createParticleInstances(capacity: number): ParticleInstances {
  const limit = Math.max(1, Math.floor(capacity));
  const geometry = new THREE.PlaneGeometry(1, 1);
  const material = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
    fog: false,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, limit);
  mesh.name = 'gbl-particles';
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.count = 0;
  mesh.visible = false;

  const colorAttribute = new THREE.InstancedBufferAttribute(new Float32Array(limit * 3), 3);
  colorAttribute.setUsage(THREE.DynamicDrawUsage);
  mesh.instanceColor = colorAttribute;

  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const position = new THREE.Vector3();
  const scaleVector = new THREE.Vector3();

  const particles: ParticleInstances = {
    mesh,

    apply(frame: ParticleFrame): void {
      const declared = Math.max(0, Math.floor(frame.count));
      const count = Math.min(declared, limit);
      // 约定 position 为 xyz；若上游给的是 xz（与 NoiseFrame 同构）则自动降级，避免整层错位。
      const stride = declared > 0 && frame.position.length === declared * 2 ? 2 : 3;
      const colorStride = declared > 0 && frame.color.length >= declared * 3 ? 3 : 1;

      for (let index = 0; index < count; index += 1) {
        const base = index * stride;
        const x = frame.position[base] ?? 0;
        const y = stride === 3 ? (frame.position[base + 1] ?? 0) : 0.12;
        const z = frame.position[base + stride - 1] ?? 0;
        const life = clamp(frame.life[index] ?? 1, 0, 1);
        const size = clamp(frame.size[index] ?? 0.1, 0.01, 2);

        position.set(x, y, z);
        scaleVector.set(size, size, size);
        matrix.compose(position, quaternion, scaleVector);
        mesh.setMatrixAt(index, matrix);

        if (colorStride === 3) {
          const colorBase = index * 3;
          const r = (frame.color[colorBase] ?? 0) / 255;
          const g = (frame.color[colorBase + 1] ?? 0) / 255;
          const b = (frame.color[colorBase + 2] ?? 0) / 255;
          colorAttribute.setXYZ(index, r * life, g * life, b * life);
        } else {
          const brightness = (frame.color[index] ?? 255) / 255;
          const value = brightness * life;
          colorAttribute.setXYZ(index, value, value, value);
        }
      }

      mesh.count = count;
      mesh.visible = count > 0;
      if (count > 0) {
        mesh.instanceMatrix.needsUpdate = true;
        colorAttribute.needsUpdate = true;
      }
    },

    dispose(): void {
      mesh.removeFromParent();
      geometry.dispose();
      material.dispose();
      if (activeParticles === particles) activeParticles = null;
    },
  };

  activeParticles = particles;
  return particles;
}

/**
 * 当前激活的粒子实例（renderer 读取；`main.tsx` 不直接使用）。
 * 存在原因同 `getActiveAudienceInstances`。
 */
export function getActiveParticleInstances(): ParticleInstances | null {
  return activeParticles;
}

/* ==========================================================================
 * 内部工具
 * ========================================================================== */

interface SeatLayout {
  readonly count: number;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly z: Float32Array;
}

/** 与 `models.buildSeats` 完全一致：两处都调用 data 的 `seatPositionAt`（唯一真源）。 */
function computeSeatLayout(seats: SeatGridDef): SeatLayout {
  const rows = Math.max(1, Math.floor(seats.rows));
  const cols = Math.max(1, Math.floor(seats.cols));
  const count = rows * cols;
  const x = new Float32Array(count);
  const y = new Float32Array(count);
  const z = new Float32Array(count);

  let index = 0;
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const position = seatPositionAt(seats, row, col);
      x[index] = position.x;
      y[index] = position.y;
      z[index] = position.z;
      index += 1;
    }
  }
  return { count, x, y, z };
}

/**
 * 观众材质：无光照（自发光实例）+ 两个 uniform 通道。
 * - `uWhiteout`（tech-spec §14.3 F8）：白光遮罩，只混 ≤30% 白，完整遮罩由 React DOM 负责；
 * - `uLightPos/uLightRadius/uLightBoost/uLightColor`（v1.0.1 P0-2）：世界里的光池，
 *   被光罩住的实例整体提亮/加暖——这是「光落在人身上」的唯一可读来源，
 *   因为 `AudienceFrame` 不携带逐座是否被照亮，只有 converged/heat 状态。
 */
function createAudienceMaterial(): THREE.MeshBasicMaterial {
  const material = new THREE.MeshBasicMaterial({ toneMapped: false });
  const whiteout = { value: 0 };
  const lightPool = {
    position: { value: new THREE.Vector2(0, 8) },
    radius: { value: 4.2 },
    boost: { value: 0.55 },
    color: { value: new THREE.Color('#fff1d6') },
  };
  material.userData['whiteout'] = whiteout;
  material.userData['lightPool'] = lightPool;
  material.customProgramCacheKey = (): string => 'gbl-audience-v101';
  material.onBeforeCompile = (shader): void => {
    shader.uniforms['uWhiteout'] = whiteout;
    shader.uniforms['uLightPos'] = lightPool.position;
    shader.uniforms['uLightRadius'] = lightPool.radius;
    shader.uniforms['uLightBoost'] = lightPool.boost;
    shader.uniforms['uLightColor'] = lightPool.color;

    shader.vertexShader = shader.vertexShader
      .replace(
        'void main() {',
        'uniform vec2 uLightPos;\nuniform float uLightRadius;\nvarying float vLightPool;\nvoid main() {',
      )
      .replace(
        '#include <project_vertex>',
        [
          '#include <project_vertex>',
          '\tvec4 gblInstanceWorld = modelMatrix * instanceMatrix * vec4( 0.0, 0.0, 0.0, 1.0 );',
          '\tfloat gblLightDistance = distance( gblInstanceWorld.xz, uLightPos );',
          '\tvLightPool = 1.0 - smoothstep( uLightRadius * 0.45, uLightRadius * 1.08, gblLightDistance );',
        ].join('\n'),
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        'void main() {',
        'uniform float uWhiteout;\nuniform float uLightBoost;\nuniform vec3 uLightColor;\nvarying float vLightPool;\nvoid main() {',
      )
      .replace(
        '#include <dithering_fragment>',
        [
          '#include <dithering_fragment>',
          '\tfloat gblLift = clamp( vLightPool * uLightBoost, 0.0, 1.0 );',
          '\tgl_FragColor.rgb = mix( gl_FragColor.rgb, uLightColor, gblLift * 0.38 );',
          '\tgl_FragColor.rgb += uLightColor * gblLift * 0.2;',
          '\tgl_FragColor.rgb = mix( gl_FragColor.rgb, vec3( 1.0 ), uWhiteout * 0.3 );',
          '\tgl_FragColor.rgb = min( gl_FragColor.rgb, vec3( 1.0 ) );',
        ].join('\n'),
      );
  };
  return material;
}

/** 四区颜色 token 解析（顺序与 `ZONE_ORDER` 一致）。 */
function resolveZoneColors(data: DataRegistry): readonly THREE.Color[] {
  return ZONE_ORDER.map((zoneId, index) => {
    const zone = data.zones.find((entry) => entry.id === zoneId);
    const fallback = ZONE_FALLBACKS[index] ?? GREY_FALLBACK;
    if (zone === undefined) return new THREE.Color(fallback);
    const raw: unknown = data.palette.tokens[zone.colorToken];
    if (typeof raw === 'string' && raw.trim().length > 0) return new THREE.Color(raw.trim());
    return new THREE.Color(fallback);
  });
}

function tokenColor(palette: PaletteDef, token: PaletteToken, fallback: string): THREE.Color {
  const raw: unknown = palette.tokens[token];
  if (typeof raw === 'string' && raw.trim().length > 0) return new THREE.Color(raw.trim());
  return new THREE.Color(fallback);
}

interface RangeBounds {
  readonly start: number;
  readonly count: number;
}

function clampRange(range: DirtyRange, capacity: number): RangeBounds {
  const start = clamp(Math.floor(range.start), 0, capacity);
  const end = clamp(start + Math.floor(range.count), start, capacity);
  return { start, count: end - start };
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}
