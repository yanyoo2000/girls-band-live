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
import { seatPositionAt, ZONE_MARKS } from '../data/seats';
import type { SeatGridDef, ZoneDef } from '../types/data';
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
  warm: { key: 0.5, fill: 0.62, ambient: 0.78, directional: 0.78, lamps: 0.5 },
  full: { key: 1, fill: 1, ambient: 1, directional: 1, lamps: 1 },
  blackout: { key: 0.06, fill: 0.1, ambient: 0.26, directional: 0.08, lamps: 0.06 },
};

/**
 * 基准强度（物理光照单位）。
 * v1.0.1 P0-1（t142）：整帧平均亮度 19/255 → 目标 ≥32/255，舞台区 23 → ≥35；
 * 提亮只走灯光与本文件的发光底，不动 game 数值、不改 HUD 对比度。
 */
const BASE_INTENSITY = {
  key: 44,
  fill: 20,
  ambient: 1.85,
  directional: 1.8,
} as const;

/** 背景/雾比场馆黑高一档：整帧平均亮度需要它，同时保留“黑场”观感（不白到刺眼）。 */
const BACKGROUND_LIFT = 1.42;
const FOG_DENSITY = 0.0072;

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
  const backdrop = ink.clone().multiplyScalar(BACKGROUND_LIFT);
  scene.background = backdrop.clone();
  // 场馆空气感：让最后几排自然压到近黑；密度比 v1.0.0 更低，避免后排被雾吃掉（P0-1）。
  scene.fog = new THREE.FogExp2(backdrop.clone(), FOG_DENSITY);

  const stage = buildStage(data, palette);
  scene.add(stage);

  const members = new THREE.Group();
  members.name = 'gbl-members';
  for (const member of buildMembers(data).values()) {
    members.add(member);
  }
  scene.add(members);

  // H2：后排右端的荧光棒（GDD §14 的 1:12 钩子）。
  // 固定 45°/22° 相机下，场馆第 24 排在默认画面之外；这里取“后区第一排的最右端”
  // 作为等价可见钩子（仍属于后排、仍是最右），避免把邀请埋到镜头外。
  const backRight = data.zones.find((zone) => zone.id === 'back-right');
  const hookRow = backRight?.rowRange[0] ?? Math.max(0, data.seats.rows - 2);
  const hookCol = backRight === undefined ? data.seats.cols - 1 : Math.max(backRight.colRange[0], backRight.colRange[1] - 2);
  const hookSeat = seatPositionAt(data.seats, hookRow, hookCol);
  const glowstickGeometry = new THREE.CylinderGeometry(0.07, 0.09, 1.7, 6);
  const glowstickMaterial = new THREE.MeshStandardMaterial({
    color: 0xb8ffd0,
    emissive: 0x55ff9a,
    emissiveIntensity: 1.4,
    roughness: 0.35,
    metalness: 0,
  });
  const glowstick = new THREE.Mesh(glowstickGeometry, glowstickMaterial);
  glowstick.name = 'gbl-opening-glowstick';
  glowstick.position.set(hookSeat.x, 1.7, hookSeat.z);
  const glowstickTipGeometry = new THREE.SphereGeometry(0.34, 8, 6);
  const glowstickTipMaterial = new THREE.MeshBasicMaterial({
    color: 0xe8fff0,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
    fog: false,
  });
  const glowstickTip = new THREE.Mesh(glowstickTipGeometry, glowstickTipMaterial);
  glowstickTip.position.y = 0.95;
  glowstick.add(glowstickTip);
  glowstick.onBeforeRender = () => {
    const pulse = 0.9 + 0.45 * Math.sin(performance.now() / 420);
    glowstickMaterial.emissiveIntensity = pulse;
    glowstickTipMaterial.opacity = 0.6 + 0.3 * Math.sin(performance.now() / 420);
  };
  scene.add(glowstick);

  // v1.0.1 P0-4（t142）：四区在世界里的可读标记（区界地纹 + 区中心光柱 + ●▲■◆ 图腾 + 走道十字）。
  // 全部合并为 1 个顶点色加法网格，只占 1 个 draw call；静默段也保留（art-direction §6）。
  const zoneMarkers = buildZoneMarkers(data, palette);
  scene.add(zoneMarkers);

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
      scene.remove(glowstick);
      scene.remove(zoneMarkers);
      disposeObject3D(zoneMarkers);
      glowstickGeometry.dispose();
      glowstickMaterial.dispose();
      glowstickTipGeometry.dispose();
      glowstickTipMaterial.dispose();
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
 * 四区世界标记（v1.0.1 P0-4）
 * ========================================================================== */

interface MarkerPart {
  readonly geometry: THREE.BufferGeometry;
  readonly position: readonly [x: number, y: number, z: number];
  readonly color: THREE.Color;
}

/**
 * 四区标记：区界地纹（贴地细环）、区中心光柱、●▲■◆ 图腾、中央走道十字。
 * 全部合并成一个顶点色加法网格（1 draw call），颜色取 palette 的 zone token。
 * 图腾形状与 HUD 四角点、`ZONE_MARKS` 共用同一份语义（art-direction §3）。
 */
function buildZoneMarkers(data: DataRegistry, palette: PaletteDef): THREE.Group {
  const group = new THREE.Group();
  group.name = 'gbl-zone-markers';
  const parts: MarkerPart[] = [];

  for (const zone of data.zones) {
    const color = tokenColor(palette, zone.colorToken, '#bfd6e8');
    const first = seatPositionAt(data.seats, zone.rowRange[0], zone.colRange[0]);
    const last = seatPositionAt(data.seats, zone.rowRange[1], zone.colRange[1]);
    const centerX = (first.x + last.x) / 2;
    const centerZ = (first.z + last.z) / 2;
    const width = Math.abs(first.x - last.x) + data.seats.spacing.x;
    const depth = Math.abs(first.z - last.z) + data.seats.spacing.z;

    // 1) 区界地纹：贴地细环（只在走道/排间露出，阅读「这是我这一区」）。
    const radius = Math.min(width, depth) * 0.44;
    const ring = new THREE.RingGeometry(radius * 0.94, radius, 40, 1);
    ring.rotateX(-Math.PI / 2);
    parts.push({
      geometry: ring,
      position: [centerX, 0.05, centerZ],
      color: color.clone().multiplyScalar(0.5),
    });

    // 2) 区中心光柱：抬头就能定位这个区在哪（细、暗，不抢画面）。
    const pole = new THREE.CylinderGeometry(0.025, 0.025, 2.6, 6);
    parts.push({
      geometry: pole,
      position: [centerX, 1.3, centerZ],
      color: color.clone().multiplyScalar(0.24),
    });

    // 3) 形状图腾：●▲■◆，悬在 2.95m（远高于人群，不被遮挡）。
    parts.push({
      geometry: zoneGlyphGeometry(zone),
      position: [centerX, 2.95, centerZ],
      color: color.clone(),
    });
  }

  for (const strip of buildAisleCross(data)) parts.push(strip);

  const geometry = mergeMarkerParts(parts);
  const material = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    fog: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'gbl-zone-markers-mesh';
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;
  group.add(mesh);
  return group;
}

/** 四区图腾形状（与 HUD 的 ●▲■◆ 同义）。 */
function zoneGlyphGeometry(zone: ZoneDef): THREE.BufferGeometry {
  switch (ZONE_MARKS[zone.id]) {
    case 'circle':
      return new THREE.SphereGeometry(0.2, 10, 8);
    case 'triangle':
      return new THREE.ConeGeometry(0.24, 0.44, 3);
    case 'square':
      return new THREE.BoxGeometry(0.32, 0.32, 0.32);
    case 'diamond':
      return new THREE.OctahedronGeometry(0.24, 0);
  }
}

/** 中央走道十字：两条贴地细光带，把观众席切成可读的四象限。 */
function buildAisleCross(data: DataRegistry): MarkerPart[] {
  const seats: SeatGridDef = data.seats;
  const lastRow = Math.max(0, seats.rows - 1);
  const lastCol = Math.max(0, seats.cols - 1);
  const colBefore = Math.max(0, Math.min(lastCol, seats.aisleCol - 1));
  const colAfter = Math.max(0, Math.min(lastCol, seats.aisleCol));
  const rowBefore = Math.max(0, Math.min(lastRow, seats.aisleRow - 1));
  const rowAfter = Math.max(0, Math.min(lastRow, seats.aisleRow));

  const xBefore = seatPositionAt(seats, 0, colBefore).x;
  const xAfter = seatPositionAt(seats, 0, colAfter).x;
  const zBefore = seatPositionAt(seats, rowBefore, 0).z;
  const zAfter = seatPositionAt(seats, rowAfter, 0).z;

  const aisleX = (xBefore + xAfter) / 2;
  const aisleZ = (zBefore + zAfter) / 2;
  const leftX = seatPositionAt(seats, 0, lastCol).x - 0.45;
  const rightX = seatPositionAt(seats, 0, 0).x + 0.45;
  const frontZ = seatPositionAt(seats, 0, 0).z - 0.55;
  const backZ = seatPositionAt(seats, lastRow, 0).z + 0.55;

  const color = new THREE.Color('#9fb4cc').multiplyScalar(0.34);
  const alongZ = new THREE.BoxGeometry(0.1, 0.01, backZ - frontZ);
  const alongX = new THREE.BoxGeometry(rightX - leftX, 0.01, 0.1);
  return [
    { geometry: alongZ, position: [aisleX, 0.055, (frontZ + backZ) / 2], color },
    { geometry: alongX, position: [(leftX + rightX) / 2, 0.055, aisleZ], color },
  ];
}

/** 合并几何 + 逐顶点色；源几何在合并后释放（临时几何，不驻留）。 */
function mergeMarkerParts(parts: readonly MarkerPart[]): THREE.BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  for (const part of parts) {
    const source = part.geometry;
    const geometry = source.index === null ? source.clone() : source.toNonIndexed();
    const attribute = geometry.getAttribute('position');
    for (let index = 0; index < attribute.count; index += 1) {
      positions.push(
        attribute.getX(index) + part.position[0],
        attribute.getY(index) + part.position[1],
        attribute.getZ(index) + part.position[2],
      );
      colors.push(part.color.r, part.color.g, part.color.b);
    }
    geometry.dispose();
    source.dispose();
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  merged.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  merged.computeBoundingSphere();
  return merged;
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
