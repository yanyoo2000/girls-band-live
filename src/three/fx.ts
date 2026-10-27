/**
 * 事件驱动短特效（dev-three 所有）：点燃脉冲、转化、烧穿、合唱波、返听锁、人浪、白闪。
 *
 * 契约：`docs/tech-spec.md` §5.4（`FxSystem` / `createFxSystem`）。
 * - 只有 2 个 InstancedMesh（环 + 火花），全部池化，`trigger` 不分配对象、不建几何体；
 * - 加法混合、无贴图、无后处理（art-direction §7）；黑烟等「暗效果」由 game 的粒子层负责；
 * - 减少动态：关白闪、环数降到 1、火花减半（art-direction §11）；
 * - 「零飘字」：本模块不产生任何文字（art-direction §7、GDD §12.2）。
 */

import * as THREE from 'three';
import type { SfxId, Vec3 } from '../types/game';

export interface FxSystem {
  /** 事件驱动的短特效（点燃脉冲、返听锁、人浪、白闪）。 */
  trigger(cue: SfxId | 'crack' | 'flash' | 'sweep', at: Vec3): void;
  update(dt: number): void;
  setReducedMotion(enabled: boolean): void;
  dispose(): void;
}

/** 可触发的特效 id（12 个 SFX + 3 个纯视觉）。 */
type FxCue = SfxId | 'crack' | 'flash' | 'sweep';

interface CueSpec {
  /** 同时生成的环数（1–3）。 */
  readonly rings: number;
  /** 火花数（0–6）。 */
  readonly sparks: number;
  /** 起始半径（米）。 */
  readonly from: number;
  /** 结束半径（米）。 */
  readonly to: number;
  /** 时长（秒）。 */
  readonly duration: number;
  /** 颜色（art-direction §3 色板内的值）。 */
  readonly color: string;
  /** 加法亮度倍率。 */
  readonly intensity: number;
  /** 椭圆压缩（X / Z）；1 = 正圆。 */
  readonly flatX: number;
  readonly flatZ: number;
}

const NO_EFFECT: CueSpec = {
  rings: 0,
  sparks: 0,
  from: 0,
  to: 0,
  duration: 0,
  color: '#ffffff',
  intensity: 0,
  flatX: 1,
  flatZ: 1,
};

/** 每种事件一行的查表（不写 if-else 链；数值对应 art-direction §7 的时长）。 */
const CUE_SPECS: Readonly<Record<FxCue, CueSpec>> = {
  'ignite-hit': { rings: 1, sparks: 5, from: 0.2, to: 1.6, duration: 0.3, color: '#fff1d6', intensity: 1.0, flatX: 1, flatZ: 1 },
  'convert-chime': { rings: 1, sparks: 3, from: 0.6, to: 4.2, duration: 0.8, color: '#ffd9e6', intensity: 0.7, flatX: 1, flatZ: 1 },
  'burn-hiss': { rings: 1, sparks: 2, from: 0.4, to: 2.2, duration: 0.5, color: '#8a5a2a', intensity: 0.5, flatX: 1, flatZ: 1 },
  'choir-pulse': { rings: 1, sparks: 0, from: 0.5, to: 3.4, duration: 0.25, color: '#35e0d0', intensity: 0.8, flatX: 1, flatZ: 1 },
  'return-lock': { rings: 3, sparks: 0, from: 0.5, to: 2.6, duration: 0.9, color: '#ffb03a', intensity: 0.9, flatX: 1, flatZ: 1 },
  'line-snap': { rings: 1, sparks: 2, from: 0.2, to: 1.2, duration: 0.18, color: '#d8ecff', intensity: 0.8, flatX: 1, flatZ: 1 },
  'crowd-wave': { rings: 1, sparks: 0, from: 0.8, to: 10.5, duration: 3.0, color: '#fff1d6', intensity: 0.45, flatX: 1, flatZ: 0.55 },
  'silence-toggle': { rings: 1, sparks: 0, from: 0.4, to: 3.2, duration: 0.45, color: '#1b2a44', intensity: 0.6, flatX: 1, flatZ: 1 },
  encore: { rings: 2, sparks: 4, from: 0.6, to: 6.0, duration: 1.0, color: '#fff1d6', intensity: 0.9, flatX: 1, flatZ: 1 },
  'drop-light': { rings: 1, sparks: 0, from: 0.4, to: 2.2, duration: 0.4, color: '#8fa2b8', intensity: 0.6, flatX: 1, flatZ: 1 },
  fail: { rings: 1, sparks: 0, from: 0.3, to: 1.6, duration: 0.5, color: '#5a2f33', intensity: 0.5, flatX: 1, flatZ: 1 },
  ui: NO_EFFECT,
  crack: { rings: 1, sparks: 3, from: 0.3, to: 3.2, duration: 0.5, color: '#ffe9c4', intensity: 0.8, flatX: 0.25, flatZ: 1 },
  flash: { rings: 1, sparks: 0, from: 0.4, to: 2.6, duration: 0.12, color: '#ffffff', intensity: 1.2, flatX: 1, flatZ: 1 },
  sweep: { rings: 1, sparks: 2, from: 0.5, to: 6.0, duration: 0.6, color: '#ffffff', intensity: 0.7, flatX: 1, flatZ: 0.5 },
};

const RING_CAPACITY = 16;
const SPARK_CAPACITY = 32;
/** 火花初速度（米/秒）与上抛初速。 */
const SPARK_SPEED = 2.6;
const SPARK_LIFT = 1.1;
const SPARK_GRAVITY = 3.4;
const RING_Y = 0.06;

interface RingState {
  active: boolean;
  age: number;
  duration: number;
  from: number;
  to: number;
  x: number;
  y: number;
  z: number;
  flatX: number;
  flatZ: number;
  intensity: number;
  readonly color: THREE.Color;
}

interface SparkState {
  active: boolean;
  age: number;
  duration: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  size: number;
  readonly color: THREE.Color;
}

/** 当前激活的特效系统（renderer 每帧 update；main 不直接持有）。 */
let activeFx: FxSystem | null = null;

/** 创建特效系统；`scene` 由 main 传入，本模块只 add 一个 group，dispose 时移除。 */
export function createFxSystem(scene: THREE.Scene): FxSystem {
  const group = new THREE.Group();
  group.name = 'gbl-fx';

  const ringGeometry = new THREE.RingGeometry(0.82, 1, 24, 1);
  ringGeometry.rotateX(-Math.PI / 2);
  const ringMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
    fog: false,
  });
  const rings = new THREE.InstancedMesh(ringGeometry, ringMaterial, RING_CAPACITY);
  rings.name = 'gbl-fx-rings';
  rings.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  rings.frustumCulled = false;
  rings.count = 0;
  rings.visible = false;
  const ringColors = new THREE.InstancedBufferAttribute(new Float32Array(RING_CAPACITY * 3), 3);
  ringColors.setUsage(THREE.DynamicDrawUsage);
  rings.instanceColor = ringColors;
  group.add(rings);

  const sparkGeometry = new THREE.PlaneGeometry(0.14, 0.14);
  sparkGeometry.rotateX(-Math.PI / 2);
  const sparkMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
    fog: false,
  });
  const sparks = new THREE.InstancedMesh(sparkGeometry, sparkMaterial, SPARK_CAPACITY);
  sparks.name = 'gbl-fx-sparks';
  sparks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  sparks.frustumCulled = false;
  sparks.count = 0;
  sparks.visible = false;
  const sparkColors = new THREE.InstancedBufferAttribute(new Float32Array(SPARK_CAPACITY * 3), 3);
  sparkColors.setUsage(THREE.DynamicDrawUsage);
  sparks.instanceColor = sparkColors;
  group.add(sparks);

  scene.add(group);

  const ringPool: RingState[] = [];
  for (let index = 0; index < RING_CAPACITY; index += 1) {
    ringPool.push({
      active: false,
      age: 0,
      duration: 0,
      from: 0,
      to: 0,
      x: 0,
      y: RING_Y,
      z: 0,
      flatX: 1,
      flatZ: 1,
      intensity: 1,
      color: new THREE.Color('#ffffff'),
    });
  }
  const sparkPool: SparkState[] = [];
  for (let index = 0; index < SPARK_CAPACITY; index += 1) {
    sparkPool.push({
      active: false,
      age: 0,
      duration: 0,
      x: 0,
      y: 0,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      size: 1,
      color: new THREE.Color('#ffffff'),
    });
  }

  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const position = new THREE.Vector3();
  const scaleVector = new THREE.Vector3();
  const scratchColor = new THREE.Color();
  let ringCursor = 0;
  let sparkCursor = 0;
  let reducedMotion = false;
  let randomState = 0x9e3779b9;

  function nextRandom(): number {
    randomState ^= randomState << 13;
    randomState ^= randomState >>> 17;
    randomState ^= randomState << 5;
    return ((randomState >>> 0) % 10000) / 10000;
  }

  function spawnRing(spec: CueSpec, at: Vec3, ordinal: number): void {
    const ring = ringPool[ringCursor % RING_CAPACITY];
    if (ring === undefined) return;
    ringCursor += 1;
    ring.active = true;
    ring.age = 0;
    ring.duration = spec.duration;
    // 多环按序错开：0 / 0.18 / 0.36 的半径起点。
    ring.from = spec.from * (1 + ordinal * 0.45);
    ring.to = spec.to;
    ring.x = at.x;
    ring.y = RING_Y + ordinal * 0.01;
    ring.z = at.z;
    ring.flatX = spec.flatX;
    ring.flatZ = spec.flatZ;
    ring.intensity = spec.intensity;
    ring.color.set(spec.color);
  }

  function spawnSparks(spec: CueSpec, at: Vec3, count: number): void {
    for (let index = 0; index < count; index += 1) {
      const spark = sparkPool[sparkCursor % SPARK_CAPACITY];
      if (spark === undefined) return;
      sparkCursor += 1;
      const angle = nextRandom() * Math.PI * 2;
      const speed = SPARK_SPEED * (0.55 + nextRandom() * 0.9);
      spark.active = true;
      spark.age = 0;
      spark.duration = Math.max(0.12, spec.duration * (0.8 + nextRandom() * 0.6));
      spark.x = at.x;
      spark.y = Math.max(0.08, at.y * 0.35 + 0.12);
      spark.z = at.z;
      spark.vx = Math.cos(angle) * speed;
      spark.vz = Math.sin(angle) * speed;
      spark.vy = SPARK_LIFT + nextRandom() * 0.6;
      spark.size = 0.6 + nextRandom() * 0.6;
      spark.color.set(spec.color);
    }
  }

  const fx: FxSystem = {
    trigger(cue: FxCue, at: Vec3): void {
      const spec = CUE_SPECS[cue];
      if (spec.duration <= 0) return;
      if (reducedMotion && cue === 'flash') return;
      const ringCount = reducedMotion ? Math.min(1, spec.rings) : spec.rings;
      for (let index = 0; index < ringCount; index += 1) spawnRing(spec, at, index);
      const sparkCount = Math.round(spec.sparks * (reducedMotion ? 0.5 : 1));
      if (sparkCount > 0) spawnSparks(spec, at, sparkCount);
    },

    update(dt: number): void {
      const step = clamp(dt, 0, 0.1);
      let ringCount = 0;
      for (const ring of ringPool) {
        if (!ring.active) continue;
        ring.age += step;
        if (ring.age >= ring.duration) {
          ring.active = false;
          continue;
        }
        const progress = ring.age / ring.duration;
        const eased = 1 - (1 - progress) * (1 - progress);
        const radius = ring.from + (ring.to - ring.from) * eased;
        const fade = (1 - progress) * (1 - progress);
        position.set(ring.x, ring.y, ring.z);
        scaleVector.set(Math.max(0.001, radius * ring.flatX), 1, Math.max(0.001, radius * ring.flatZ));
        matrix.compose(position, quaternion, scaleVector);
        rings.setMatrixAt(ringCount, matrix);
        scratchColor.copy(ring.color).multiplyScalar(fade * ring.intensity);
        ringColors.setXYZ(ringCount, scratchColor.r, scratchColor.g, scratchColor.b);
        ringCount += 1;
      }
      rings.count = ringCount;
      rings.visible = ringCount > 0;
      if (ringCount > 0) {
        rings.instanceMatrix.needsUpdate = true;
        ringColors.needsUpdate = true;
      }

      let sparkCount = 0;
      for (const spark of sparkPool) {
        if (!spark.active) continue;
        spark.age += step;
        if (spark.age >= spark.duration) {
          spark.active = false;
          continue;
        }
        const life = 1 - spark.age / spark.duration;
        const x = spark.x + spark.vx * spark.age;
        const z = spark.z + spark.vz * spark.age;
        const y = spark.y + spark.vy * spark.age - 0.5 * SPARK_GRAVITY * spark.age * spark.age;
        if (y < 0.02) {
          spark.active = false;
          continue;
        }
        position.set(x, y, z);
        const size = spark.size * (0.6 + life * 0.6);
        scaleVector.set(size, size, size);
        matrix.compose(position, quaternion, scaleVector);
        sparks.setMatrixAt(sparkCount, matrix);
        scratchColor.copy(spark.color).multiplyScalar(life * life);
        sparkColors.setXYZ(sparkCount, scratchColor.r, scratchColor.g, scratchColor.b);
        sparkCount += 1;
      }
      sparks.count = sparkCount;
      sparks.visible = sparkCount > 0;
      if (sparkCount > 0) {
        sparks.instanceMatrix.needsUpdate = true;
        sparkColors.needsUpdate = true;
      }
    },

    setReducedMotion(enabled: boolean): void {
      reducedMotion = enabled;
    },

    dispose(): void {
      for (const ring of ringPool) ring.active = false;
      for (const spark of sparkPool) spark.active = false;
      teardown();
    },
  };

  function teardown(): void {
    group.removeFromParent();
    rings.dispose();
    sparks.dispose();
    ringGeometry.dispose();
    ringMaterial.dispose();
    sparkGeometry.dispose();
    sparkMaterial.dispose();
    group.clear();
    if (activeFx === fx) activeFx = null;
  }

  activeFx = fx;
  return fx;
}

/**
 * 当前激活的特效系统（renderer 每帧 update；`main.tsx` 不直接使用）。
 * 存在原因：tech-spec §5.4 的 `createRenderer(canvas)` 没有 fx 参数，§6.4 要求启动时创建一次。
 */
export function getActiveFxSystem(): FxSystem | null {
  return activeFx;
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}
