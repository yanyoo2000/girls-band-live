/**
 * B2 旧货仓场馆、舞台与灯光（dev-three 所有）。
 *
 * 契约：`docs/tech-spec.md` §5.4（`SceneBundle` / `createScene`）。
 * - 场景内容：场馆黑 + 雾、舞台（`models.buildStage`）、四名成员（`models.buildMembers`）、
 *   环境光 + 补光方向光 + 2 盏真 SpotLight（GDD §16.2 上限 2，无阴影）；
 * - 三种灯光态：暖场 / 满灯 / 静默（GDD §9.1），`setVenueLight` 再把观众席整体亮度叠上去；
 * - 无外部贴图、无后处理、无阴影；所有几何体与材质在 `dispose()` 释放。
 *
 * 消费边界：只读 `DataRegistry` / `PaletteDef`，不 import React，不改 game 状态。
 */

import * as THREE from 'three';
import { buildMembers, buildStage } from './models';
import type { DataRegistry, PaletteDef, PaletteToken } from '../types/data';

export interface SceneBundle {
  readonly scene: THREE.Scene;
  readonly stage: THREE.Group;
  readonly lights: { readonly key: THREE.SpotLight; readonly fill: THREE.SpotLight };
  setLighting(state: 'warm' | 'full' | 'blackout'): void;
  setVenueLight(value: number): void;
  dispose(): void;
}

/** 灯光态（GDD §9.1 / art-direction §6）。 */
type LightingState = 'warm' | 'full' | 'blackout';

/** 单态下的强度倍率；`venue` 由 `setVenueLight` 另外相乘。 */
interface LightingPreset {
  /** 追光（跟随光心的真 SpotLight）。 */
  readonly key: number;
  /** 侧后方补光 SpotLight。 */
  readonly fill: number;
  /** 环境光。 */
  readonly ambient: number;
  /** 方向补光。 */
  readonly directional: number;
  /** 16 个假灯头的自发光倍率。 */
  readonly lamps: number;
}

const LIGHTING_PRESETS: Readonly<Record<LightingState, LightingPreset>> = {
  warm: { key: 0.38, fill: 0.5, ambient: 0.55, directional: 0.5, lamps: 0.3 },
  full: { key: 1, fill: 1, ambient: 1, directional: 1, lamps: 1 },
  blackout: { key: 0.04, fill: 0.08, ambient: 0.2, directional: 0.06, lamps: 0.05 },
};

/** 基准强度（物理光照单位；M5 视觉复调时只改这里）。 */
const BASE_INTENSITY = {
  key: 32,
  fill: 8,
  ambient: 0.65,
  directional: 0.9,
} as const;

/** 场馆底色（art-direction §3：场馆黑 #0B0D12）。 */
const INK_FALLBACK = '#0b0d12';
/** 追光冷白（art-direction §3：追光冷白 #D8ECFF）。 */
const KEY_FALLBACK = '#d8ecff';
/** 舞台暖白（art-direction §3：舞台暖白 #FFF1D6）。 */
const FILL_FALLBACK = '#fff1d6';

/** 真 SpotLight 的固定摆位（桁架 / 侧后方）。 */
const KEY_LIGHT_POSITION = new THREE.Vector3(0, 4.6, 2.5);
const KEY_LIGHT_TARGET = new THREE.Vector3(0, 0.6, 8);
const FILL_LIGHT_POSITION = new THREE.Vector3(-4.2, 4.3, -1.8);
const FILL_LIGHT_TARGET = new THREE.Vector3(0, 0.9, 2.2);

/** 当前激活的场景（renderer 惰性绑定；main 只在启动时创建一个）。 */
let activeBundle: SceneBundle | null = null;

/**
 * 创建场馆场景、舞台与灯光。
 * `data` 决定座椅网格与成员站位，`palette` 决定全部颜色（token 缺失时用 art-direction 兜底值）。
 */
export function createScene(data: DataRegistry, palette: PaletteDef): SceneBundle {
  const scene = new THREE.Scene();
  scene.name = 'gbl-livehouse';

  const ink = tokenColor(palette, 'ink', INK_FALLBACK);
  scene.background = ink.clone();
  // 场馆空气感：让最后几排自然压到近黑（art-direction §2「上 1/3 压到近黑」）。
  scene.fog = new THREE.FogExp2(ink.clone(), 0.01);

  const stage = buildStage(data, palette);
  scene.add(stage);

  const members = new THREE.Group();
  members.name = 'gbl-members';
  for (const member of buildMembers(data).values()) {
    members.add(member);
  }
  scene.add(members);

  const ambient = new THREE.AmbientLight(0x2a3446, BASE_INTENSITY.ambient);
  ambient.name = 'gbl-ambient';
  scene.add(ambient);

  const directional = new THREE.DirectionalLight(0x9fb4cc, BASE_INTENSITY.directional);
  directional.name = 'gbl-directional';
  directional.position.set(0, 9, 12);
  directional.target.position.set(0, 1, 2);
  scene.add(directional);
  scene.add(directional.target);

  const key = new THREE.SpotLight(
    tokenColor(palette, 'stage-full', KEY_FALLBACK),
    BASE_INTENSITY.key,
    34,
    0.62,
    0.42,
    1.35,
  );
  key.name = 'gbl-key-light';
  key.position.copy(KEY_LIGHT_POSITION);
  key.castShadow = false;
  key.target.position.copy(KEY_LIGHT_TARGET);
  scene.add(key);
  scene.add(key.target);

  const fill = new THREE.SpotLight(
    tokenColor(palette, 'stage-warm', FILL_FALLBACK),
    BASE_INTENSITY.fill,
    26,
    1.15,
    0.9,
    1.2,
  );
  fill.name = 'gbl-fill-light';
  fill.position.copy(FILL_LIGHT_POSITION);
  fill.castShadow = false;
  fill.target.position.copy(FILL_LIGHT_TARGET);
  scene.add(fill);
  scene.add(fill.target);

  const lamps = readInstancedMesh(stage, 'lamps');

  let lighting: LightingState = 'warm';
  let venueLight = 1;

  // 初值：静默前先落在暖场，避免第一帧闪全亮。
  applyLighting();

  const bundle: SceneBundle = {
    scene,
    stage,
    lights: { key, fill },

    setLighting(state: LightingState): void {
      if (lighting === state) return;
      lighting = state;
      applyLighting();
    },

    setVenueLight(value: number): void {
      const next = clamp(value, 0, 1);
      if (Math.abs(next - venueLight) < 0.004) return;
      venueLight = next;
      applyLighting();
    },

    dispose(): void {
      // 成员与舞台由 models 提供幂等释放函数（models.ts 头注释）。
      for (const member of members.children) {
        const disposeMember = readDispose(member);
        if (disposeMember !== null) disposeMember();
      }
      members.clear();

      const disposeStage = readDispose(stage);
      if (disposeStage !== null) disposeStage();
      else disposeObject3D(stage);

      scene.remove(stage);
      scene.remove(members);
      scene.remove(ambient);
      scene.remove(directional);
      scene.remove(directional.target);
      scene.remove(key);
      scene.remove(key.target);
      scene.remove(fill);
      scene.remove(fill.target);
      scene.clear();
      if (activeBundle === bundle) activeBundle = null;
    },
  };

  function applyLighting(): void {
    const preset = LIGHTING_PRESETS[lighting];
    // 观众席亮度只压环境/方向/灯头，追光保持「硬光」，避免静默段整场糊掉。
    const venue = 0.35 + 0.65 * venueLight;
    key.intensity = BASE_INTENSITY.key * preset.key;
    fill.intensity = BASE_INTENSITY.fill * preset.fill * venue;
    ambient.intensity = BASE_INTENSITY.ambient * preset.ambient * venue;
    directional.intensity = BASE_INTENSITY.directional * preset.directional * venue;
    if (lamps !== null) {
      const material = lamps.material;
      const single = Array.isArray(material) ? material[0] : material;
      if (single instanceof THREE.MeshBasicMaterial) single.color.setScalar(Math.max(0.02, preset.lamps * venue));
    }
  }

  activeBundle = bundle;
  return bundle;
}

/**
 * 当前激活的场景（renderer 读取；`main.tsx` 不直接使用）。
 * 存在原因：tech-spec §5.4 的 `createRenderer(canvas)` 没有 scene 参数，
 * 而 §6.4 要求 `createScene` 在启动时创建一次，故由工厂注册、renderer 惰性绑定。
 */
export function getActiveSceneBundle(): SceneBundle | null {
  return activeBundle;
}

/* ==========================================================================
 * 内部工具
 * ========================================================================== */

/** 读取 palette token；缺失或空串时用 art-direction 的兜底色。 */
function tokenColor(palette: PaletteDef, token: PaletteToken, fallback: string): THREE.Color {
  const raw: unknown = palette.tokens[token];
  if (typeof raw === 'string' && raw.trim().length > 0) return new THREE.Color(raw.trim());
  return new THREE.Color(fallback);
}

/** 从 models 的 `userData` 里取一个 InstancedMesh（类型安全，不用 any）。 */
function readInstancedMesh(group: THREE.Object3D, key: string): THREE.InstancedMesh | null {
  const bag: unknown = group.userData;
  if (typeof bag !== 'object' || bag === null) return null;
  const candidate: unknown = (bag as Record<string, unknown>)[key];
  return candidate instanceof THREE.InstancedMesh ? candidate : null;
}

/** 从 models 的 `userData.dispose` 取幂等释放函数。 */
function readDispose(object: THREE.Object3D): (() => void) | null {
  const bag: unknown = object.userData;
  if (typeof bag !== 'object' || bag === null) return null;
  const candidate: unknown = (bag as Record<string, unknown>)['dispose'];
  return typeof candidate === 'function' ? (candidate as () => void) : null;
}

/** 兜底释放：models 未提供 dispose 时按引用去重遍历释放。 */
function disposeObject3D(root: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    geometries.add(object.geometry);
    const material = object.material;
    if (Array.isArray(material)) {
      for (const entry of material) materials.add(entry);
    } else {
      materials.add(material);
    }
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}
