/**
 * 《谁在听》低多边形模型（M5，art-director 所有）。
 *
 * 契约（docs/tech-spec.md §5.4）严格保持 4 个公共导出：
 * `buildStage` / `buildMembers` / `buildAudienceGeometry` / `buildNoiseGeometries`。
 * 其余 builder、材质与 dispose 都留在文件内部，不新增对外契约。
 *
 * 视觉基线：docs/art-direction.md §4–§6。
 * - 只用 Three.js 基础几何体；顶点色 + 自发光/加法，无贴图、无外部模型；
 * - 40px 剪影优先：四人靠轮廓 / 乐器 / 站位 / 主色区分；
 * - 舞台台高 0.8m，鼓台再抬 0.6m；观众 768 席；噪音 3 常规 + 1 精英 + 1 Boss。
 *
 * 返回的 `THREE.Group` 在 `userData.dispose` 上挂一个幂等释放函数；
 * dev-three 在场景卸载/重开时调用即可，不必了解内部几何体数量。
 */

import * as THREE from 'three';
import type { CharacterDef, DataRegistry, PaletteDef, PaletteToken } from '../types/data';
import type { MemberId, NoiseKind } from '../types/game';
import { seatPositionAt } from '../data/seats';

/* ==========================================================================
 * 1. 常量与内部类型
 * ========================================================================== */

const STAGE_WIDTH = 12;
const STAGE_DEPTH = 8;
const STAGE_TOP = 0.8;
const DRUM_RISER_HEIGHT = 0.6;
const STAGE_FRONT_Z = STAGE_DEPTH / 2;

/**
 * 座椅几何只有"椅面高度"这一视觉常量；座位世界坐标一律走 `data/seats.ts` 的
 * `seatPositionAt`（与 instancing 调用同一函数，不保留第二份 gap / spacing / origin）。
 */
const CHAIR_SURFACE_Y = 0.5;

/** 数据层未提供站位时的兜底（不覆盖显式数据）。 */
const DEFAULT_MEMBER_POSITIONS: Readonly<Record<MemberId, readonly [x: number, z: number]>> = {
  jiangqi: [0, 2.3],
  xuliao: [3.1, 1.6],
  wensheng: [-3.1, 1.6],
  shaoyan: [0, -1.6],
};

type Vec3 = readonly [x: number, y: number, z: number];

interface PartSpec {
  readonly geometry: THREE.BufferGeometry;
  readonly color?: THREE.ColorRepresentation;
  readonly position?: readonly [x: number, y: number, z: number];
  readonly rotation?: readonly [x: number, y: number, z: number];
  readonly scale?: readonly [x: number, y: number, z: number];
}

/* ==========================================================================
 * 2. 材质、几何合并与释放
 * ========================================================================== */

function createVertexColorMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.85,
    metalness: 0.04,
    flatShading: true,
  });
}

function createOutlineMaterial(): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color: 0x05060a,
    side: THREE.BackSide,
  });
}

function tokenColor(palette: PaletteDef, token: PaletteToken, fallback: string): THREE.Color {
  const value = palette.tokens[token];
  const normalized = typeof value === 'string' ? value.trim() : '';
  return new THREE.Color(normalized.length > 0 ? normalized : fallback);
}

/**
 * 把若干基础几何体按局部变换合并成一个几何体。
 * 顶点色是可选的：观众/噪音几何不需要色，成员与舞台需要。
 */
function mergeParts(parts: readonly PartSpec[], withColors: boolean): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const color = new THREE.Color();

  for (const part of parts) {
    const source = part.geometry;
    const geometry = source.index === null ? source.clone() : source.toNonIndexed();
    position.set(part.position?.[0] ?? 0, part.position?.[1] ?? 0, part.position?.[2] ?? 0);
    euler.set(part.rotation?.[0] ?? 0, part.rotation?.[1] ?? 0, part.rotation?.[2] ?? 0, 'XYZ');
    quaternion.setFromEuler(euler);
    scale.set(part.scale?.[0] ?? 1, part.scale?.[1] ?? 1, part.scale?.[2] ?? 1);
    matrix.compose(position, quaternion, scale);
    geometry.applyMatrix4(matrix);

    const positionAttribute = geometry.getAttribute('position');
    let normalAttribute = geometry.getAttribute('normal');
    if (normalAttribute === undefined) {
      geometry.computeVertexNormals();
      normalAttribute = geometry.getAttribute('normal');
    }
    if (normalAttribute === undefined) {
      geometry.dispose();
      throw new Error('mergeParts: 几何体缺少法线属性');
    }
    if (withColors) color.set(part.color ?? 0xffffff);

    for (let i = 0; i < positionAttribute.count; i += 1) {
      positions.push(positionAttribute.getX(i), positionAttribute.getY(i), positionAttribute.getZ(i));
      normals.push(normalAttribute.getX(i), normalAttribute.getY(i), normalAttribute.getZ(i));
      if (withColors) colors.push(color.r, color.g, color.b);
    }
    geometry.dispose();
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  if (withColors) merged.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

function disposeObject3D(root: THREE.Object3D, includeMaterials = true): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      geometries.add(object.geometry);
      if (!includeMaterials) return;
      const material = object.material;
      if (Array.isArray(material)) {
        for (const entry of material) materials.add(entry);
      } else {
        materials.add(material);
      }
    }
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
}

/* ==========================================================================
 * 3. 舞台、灯光道具、座椅与裂缝
 * ========================================================================== */

/**
 * 舞台、桁架、音箱、鼓台、768 座椅与灯头。
 * 成员不在这里重复创建（由 buildMembers 返回，scene 负责挂载）。
 * userData.lamps 是 18 个实例：索引 0–15 为 16 个假灯头，16–17 为出口灯。
 */
export function buildStage(data: DataRegistry, palette: PaletteDef): THREE.Group {
  const group = new THREE.Group();
  group.name = 'gbl-stage';

  const ink = tokenColor(palette, 'ink', '#0b0d12');
  const warm = tokenColor(palette, 'stage-warm', '#fff1d6');
  const cool = tokenColor(palette, 'stage-full', '#d8ecff');
  const amber = tokenColor(palette, 'zone-seventh', '#ffb03a');
  // 观众席最深一排决定场馆地面长度（z 正方向），避免后排椅子悬空。
  const seatRows = Math.max(1, Math.floor(data.seats.rows));
  const seatMaxZ = seatPositionAt(data.seats, seatRows - 1, 0).z;
  const floorBack = -8;
  const floorFront = Math.max(20, seatMaxZ + 2.5);
  const floorDepth = floorFront - floorBack;
  const floorCenterZ = (floorFront + floorBack) / 2;

  const metal = new THREE.Color('#3a3f48');
  const wood = new THREE.Color('#3b332a');
  const darkWood = new THREE.Color('#2a2620');
  const panel = new THREE.Color('#1a1d24');

  const venueParts: PartSpec[] = [
    // 场馆地面：延伸到观众席后方，避免椅子悬空。
    { geometry: new THREE.BoxGeometry(26, 0.1, floorDepth), position: [0, -0.06, floorCenterZ], color: ink },
    // 舞台主体与台面。
    { geometry: new THREE.BoxGeometry(STAGE_WIDTH, STAGE_TOP, STAGE_DEPTH), position: [0, STAGE_TOP / 2, 0], color: darkWood },
    { geometry: new THREE.BoxGeometry(STAGE_WIDTH + 0.04, 0.04, STAGE_DEPTH + 0.04), position: [0, STAGE_TOP + 0.02, 0], color: wood },
    // 台唇：暖白边，告诉玩家这里是边界。
    { geometry: new THREE.BoxGeometry(STAGE_WIDTH + 0.3, 0.16, 0.24), position: [0, STAGE_TOP + 0.02, STAGE_FRONT_Z + 0.1], color: warm },
    // 鼓台（抬高 0.6m）。
    { geometry: new THREE.BoxGeometry(3.4, DRUM_RISER_HEIGHT, 2.4), position: [0, STAGE_TOP + DRUM_RISER_HEIGHT / 2, -1.6], color: darkWood },
    { geometry: new THREE.BoxGeometry(3.5, 0.05, 2.5), position: [0, STAGE_TOP + DRUM_RISER_HEIGHT + 0.02, -1.6], color: wood },
    // 后墙与海报位：墙压低到 3m，保证「相机在舞台后上方」时不挡视线；
    // 海报由 dev-three 用 handbill 纹理覆盖，模型只留 3.2×1.8 的底板与锚点。
    { geometry: new THREE.BoxGeometry(STAGE_WIDTH + 1, 3.0, 0.24), position: [0, 1.5, -4.28], color: panel },
    { geometry: new THREE.BoxGeometry(3.2, 1.8, 0.05), position: [0, 1.5, -4.14], color: new THREE.Color('#23262e') },
    { geometry: new THREE.BoxGeometry(0.06, 0.24, 0.02), position: [-1.35, 2.45, -4.11], color: warm },
    { geometry: new THREE.BoxGeometry(0.06, 0.24, 0.02), position: [1.35, 2.45, -4.11], color: warm },
    // 侧墙与两侧货架。
    { geometry: new THREE.BoxGeometry(0.2, 3.2, 9.6), position: [-6.4, 1.6, 0], color: panel },
    { geometry: new THREE.BoxGeometry(0.2, 3.2, 9.6), position: [6.4, 1.6, 0], color: panel },
    { geometry: new THREE.BoxGeometry(2.2, 1.6, 0.5), position: [-5.6, 0.8, -3.4], color: new THREE.Color('#1c2028') },
    { geometry: new THREE.BoxGeometry(2.2, 1.6, 0.5), position: [5.6, 0.8, -3.4], color: new THREE.Color('#1c2028') },
    // 左右楼梯（三级）。
    ...[-5.2, 5.2].flatMap((x): PartSpec[] => [
      { geometry: new THREE.BoxGeometry(1.4, 0.2, 0.6), position: [x, 0.1, -3.7], color: panel },
      { geometry: new THREE.BoxGeometry(1.4, 0.2, 0.6), position: [x, 0.3, -3.5], color: panel },
      { geometry: new THREE.BoxGeometry(1.4, 0.2, 0.6), position: [x, 0.5, -3.3], color: panel },
    ]),
    // 顶桁架：两横两竖。
    { geometry: new THREE.BoxGeometry(13, 0.16, 0.16), position: [0, 6.2, -1.5], color: metal },
    { geometry: new THREE.BoxGeometry(13, 0.16, 0.16), position: [0, 6.2, 2.4], color: metal },
    { geometry: new THREE.BoxGeometry(0.16, 6.2, 0.16), position: [-6.3, 3.1, -1.5], color: metal },
    { geometry: new THREE.BoxGeometry(0.16, 6.2, 0.16), position: [6.3, 3.1, -1.5], color: metal },
    // 台前护栏：一根横杆 + 六根立柱。
    { geometry: new THREE.BoxGeometry(STAGE_WIDTH + 0.6, 0.06, 0.06), position: [0, 1.22, STAGE_FRONT_Z + 0.45], color: metal },
    ...[-5.5, -3.3, -1.1, 1.1, 3.3, 5.5].map(
      (x): PartSpec => ({ geometry: new THREE.BoxGeometry(0.06, 0.42, 0.06), position: [x, 1.0, STAGE_FRONT_Z + 0.45], color: metal }),
    ),
    // 三根麦克风架（台前）。
    ...[-2.6, 0, 2.6].flatMap((x): PartSpec[] => [
      { geometry: new THREE.CylinderGeometry(0.024, 0.024, 1.15, 5), position: [x, STAGE_TOP + 0.575, 2.7], color: metal },
      { geometry: new THREE.CylinderGeometry(0.16, 0.16, 0.035, 6), position: [x, STAGE_TOP + 0.02, 2.7], color: metal },
    ]),
    // 两侧音箱堆：两只箱体 + 横向网罩条。
    ...[-5.0, 5.0].flatMap((x): PartSpec[] => [
      { geometry: new THREE.BoxGeometry(1.0, 1.5, 0.9), position: [x, STAGE_TOP + 0.78, 2.5], color: new THREE.Color('#191c22') },
      { geometry: new THREE.BoxGeometry(0.9, 0.36, 0.8), position: [x, STAGE_TOP + 1.7, 2.45], color: new THREE.Color('#1f232b') },
      { geometry: new THREE.BoxGeometry(0.82, 0.02, 0.02), position: [x, STAGE_TOP + 1.2, 2.96], color: metal },
      { geometry: new THREE.BoxGeometry(0.82, 0.02, 0.02), position: [x, STAGE_TOP + 1.45, 2.96], color: metal },
      { geometry: new THREE.BoxGeometry(0.82, 0.02, 0.02), position: [x, STAGE_TOP + 1.65, 2.96], color: metal },
    ]),
    // 鼓组：底鼓、军鼓、两只通鼓、镲片与鼓凳。
    { geometry: new THREE.CylinderGeometry(0.44, 0.44, 0.4, 8), position: [0, STAGE_TOP + 0.98, -1.0], rotation: [Math.PI / 2, 0, 0], color: new THREE.Color('#15171c') },
    { geometry: new THREE.CylinderGeometry(0.24, 0.24, 0.12, 8), position: [0.42, STAGE_TOP + 1.16, -1.35], color: metal },
    { geometry: new THREE.CylinderGeometry(0.18, 0.18, 0.1, 6), position: [-0.4, STAGE_TOP + 1.26, -1.25], color: new THREE.Color('#15171c') },
    { geometry: new THREE.CylinderGeometry(0.18, 0.18, 0.1, 6), position: [0.4, STAGE_TOP + 1.26, -1.25], color: new THREE.Color('#15171c') },
    { geometry: new THREE.CylinderGeometry(0.28, 0.28, 0.02, 8), position: [-0.82, STAGE_TOP + 1.62, -1.2], rotation: [0, 0, 0.18], color: amber },
    { geometry: new THREE.CylinderGeometry(0.3, 0.3, 0.02, 8), position: [0.82, STAGE_TOP + 1.72, -1.2], rotation: [0, 0, -0.16], color: amber },
    { geometry: new THREE.CylinderGeometry(0.025, 0.025, 0.75, 4), position: [-0.82, STAGE_TOP + 1.24, -1.2], color: metal },
    { geometry: new THREE.CylinderGeometry(0.025, 0.025, 0.85, 4), position: [0.82, STAGE_TOP + 1.29, -1.2], color: metal },
    { geometry: new THREE.CylinderGeometry(0.2, 0.2, 0.09, 6), position: [0, STAGE_TOP + 0.74, -1.95], color: new THREE.Color('#1b1e24') },
    // 台面四道标线：走位参照，不抢视觉。
    { geometry: new THREE.BoxGeometry(0.02, 0.006, STAGE_DEPTH - 0.8), position: [-2.8, STAGE_TOP + 0.045, 0], color: new THREE.Color('#4a4235') },
    { geometry: new THREE.BoxGeometry(0.02, 0.006, STAGE_DEPTH - 0.8), position: [2.8, STAGE_TOP + 0.045, 0], color: new THREE.Color('#4a4235') },
    { geometry: new THREE.BoxGeometry(STAGE_WIDTH - 0.8, 0.006, 0.02), position: [0, STAGE_TOP + 0.045, -2.4], color: new THREE.Color('#4a4235') },
    { geometry: new THREE.BoxGeometry(STAGE_WIDTH - 0.8, 0.006, 0.02), position: [0, STAGE_TOP + 0.045, 2.4], color: new THREE.Color('#4a4235') },
  ];

  const venueMaterial = createVertexColorMaterial();
  const venueMesh = new THREE.Mesh(mergeParts(venueParts, true), venueMaterial);
  venueMesh.name = 'stage-venue';
  group.add(venueMesh);

  const seats = buildSeats(data, venueMaterial, ink);
  group.add(seats);

  const lamps = buildLampFixtures(warm, cool, amber);
  group.add(lamps);

  const { meshes: cracks, material: crackMaterial } = buildCracks(warm);
  for (const crack of cracks) group.add(crack);

  const dispose = (): void => {
    disposeObject3D(group);
    group.clear();
  };
  group.userData = {
    stageTopY: STAGE_TOP,
    stageFrontZ: STAGE_FRONT_Z,
    poster: { x: 0, y: 1.5, z: -4.11, width: 3.2, height: 1.8 },
    seats,
    lamps,
    cracks,
    crackMaterial,
    dispose,
  };

  return group;
}

function buildSeats(data: DataRegistry, material: THREE.MeshStandardMaterial, seatColor: THREE.Color): THREE.InstancedMesh {
  const rows = Math.max(1, Math.floor(data.seats.rows));
  const cols = Math.max(1, Math.floor(data.seats.cols));
  const seatCount = rows * cols;

  const geometry = new THREE.BoxGeometry(0.42, CHAIR_SURFACE_Y, 0.12);
  geometry.translate(0, CHAIR_SURFACE_Y / 2, 0);
  // 座椅与场馆共用同一份顶点色材质：768 个实例只占 1 个材质。
  const seatColors = new Float32Array(geometry.getAttribute('position').count * 3);
  for (let vertex = 0; vertex < geometry.getAttribute('position').count; vertex += 1) {
    seatColors[vertex * 3] = seatColor.r;
    seatColors[vertex * 3 + 1] = seatColor.g;
    seatColors[vertex * 3 + 2] = seatColor.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(seatColors, 3));
  const seats = new THREE.InstancedMesh(geometry, material, seatCount);
  seats.name = 'stage-seats';

  // 与 instancing.computeSeatLayout 完全一致：两处都调用 data 的 seatPositionAt。
  const matrix = new THREE.Matrix4();
  let index = 0;
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const position = seatPositionAt(data.seats, row, col);
      matrix.makeTranslation(position.x, position.y, position.z);
      seats.setMatrixAt(index, matrix);
      index += 1;
    }
  }
  seats.instanceMatrix.needsUpdate = true;
  seats.computeBoundingSphere();
  return seats;
}

function buildLampFixtures(warm: THREE.Color, cool: THREE.Color, amber: THREE.Color): THREE.InstancedMesh {
  // 16 个假灯头 + 2 个出口灯；真 SpotLight ≤2 由 scene 管理。
  const lampCount = 18;
  const geometry = new THREE.BoxGeometry(0.26, 0.18, 0.26);
  const material = new THREE.MeshBasicMaterial({ toneMapped: false });
  const lamps = new THREE.InstancedMesh(geometry, material, lampCount);
  lamps.name = 'stage-lamp-fixtures';

  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const position = new THREE.Vector3();
  const unit = new THREE.Vector3(1, 1, 1);

  for (let index = 0; index < 16; index += 1) {
    const row = index < 8 ? 0 : 1;
    const slot = index % 8;
    position.set(-5.25 + slot * 1.5, 6.02, row === 0 ? -1.45 : 2.55);
    euler.set(row === 0 ? 0.5 : -0.5, 0, 0);
    quaternion.setFromEuler(euler);
    matrix.compose(position, quaternion, unit);
    lamps.setMatrixAt(index, matrix);
    lamps.setColorAt(index, index % 3 === 0 ? cool : warm);
  }
  for (let index = 0; index < 2; index += 1) {
    position.set(index === 0 ? -4.6 : 4.6, 2.35, -4.08);
    quaternion.identity();
    matrix.compose(position, quaternion, unit);
    lamps.setMatrixAt(16 + index, matrix);
    lamps.setColorAt(16 + index, amber);
  }
  lamps.instanceMatrix.needsUpdate = true;
  if (lamps.instanceColor !== null) lamps.instanceColor.needsUpdate = true;
  lamps.computeBoundingSphere();
  return lamps;
}

function buildCracks(warm: THREE.Color): { meshes: readonly THREE.Mesh[]; material: THREE.MeshBasicMaterial } {
  const material = new THREE.MeshBasicMaterial({
    color: warm,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const meshes: THREE.Mesh[] = [];
  for (let index = 0; index < 3; index += 1) {
    const geometry = new THREE.BoxGeometry(0.045, 0.035, 3.2 + index * 0.65);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `stage-crack-${index}`;
    mesh.position.set(-3.2 + index * 3.2, 4.2, 7 + index * 2.2);
    mesh.rotation.y = -0.32 + index * 0.3;
    mesh.visible = false;
    meshes.push(mesh);
  }
  return { meshes, material };
}

/* ==========================================================================
 * 4. 四名成员
 * ========================================================================== */

/**
 * 四名成员：每人 1 个身体网格 + 1 个乐器/手臂网格 + 1 个描边壳。
 * 四人共享身体/描边两份材质；场景卸载时整组释放，单独释放某一成员也可（材质已随首个释放）。
 */
export function buildMembers(data: DataRegistry): ReadonlyMap<MemberId, THREE.Group> {
  const members = new Map<MemberId, THREE.Group>();
  // 四人共享两份材质（身体 + 描边）：材质数从 8 降到 2，仍在 art-direction 预算内。
  const bodyMaterial = createVertexColorMaterial();
  const outlineMaterial = createOutlineMaterial();
  let materialsDisposed = false;
  const disposeMaterials = (): void => {
    if (materialsDisposed) return;
    materialsDisposed = true;
    bodyMaterial.dispose();
    outlineMaterial.dispose();
  };
  for (const definition of data.characters) {
    members.set(definition.id, buildMember(definition, data.palette, bodyMaterial, outlineMaterial, disposeMaterials));
  }
  return members;
}

function buildMember(
  definition: CharacterDef,
  palette: PaletteDef,
  bodyMaterial: THREE.MeshStandardMaterial,
  outlineMaterial: THREE.MeshBasicMaterial,
  disposeMaterials: () => void,
): THREE.Group {
  const isDrummer = definition.line === 'drums';
  const primary = tokenColor(palette, definition.silhouette.primary, '#edeff2');
  const secondary = tokenColor(palette, definition.silhouette.secondary, '#ff3d7f');
  const ink = tokenColor(palette, 'ink', '#0b0d12');
  const warm = tokenColor(palette, 'stage-warm', '#fff1d6');

  const bodyParts = isDrummer
    ? buildSeatedBodyParts(primary, secondary, ink)
    : buildStandingBodyParts(definition, primary, secondary, ink);
  const rigParts = buildRigParts(definition, primary, secondary, ink, warm);

  const bodyGeometry = mergeParts(bodyParts, true);
  const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
  body.name = `member-${definition.id}-body`;

  const outline = new THREE.Mesh(bodyGeometry.clone(), outlineMaterial);
  outline.name = `member-${definition.id}-outline`;
  outline.scale.setScalar(1.04);

  const rig = new THREE.Group();
  rig.name = `member-${definition.id}-rig`;
  const rigMesh = new THREE.Mesh(mergeParts(rigParts, true), bodyMaterial);
  rigMesh.name = `member-${definition.id}-instrument`;
  rig.add(rigMesh);

  const root = new THREE.Group();
  root.name = `member-${definition.id}`;
  const stagePosition = definition.silhouette.stagePosition;
  const hasPosition = Math.abs(stagePosition.x) + Math.abs(stagePosition.z) > 0.001;
  const fallback = DEFAULT_MEMBER_POSITIONS[definition.id];
  const x = hasPosition ? stagePosition.x : fallback[0];
  const z = hasPosition ? stagePosition.z : fallback[1];
  const baseY = STAGE_TOP + (isDrummer ? DRUM_RISER_HEIGHT : 0);
  root.position.set(x, baseY, z);
  root.rotation.y = isDrummer ? 0 : definition.id === 'xuliao' ? -0.08 : definition.id === 'wensheng' ? 0.08 : 0;
  // 许燎前倾 6°：只转整体，脚仍贴台面；剪影读作「前倾的窄肩」。
  root.rotation.x = definition.id === 'xuliao' ? -0.06 : 0;

  // 鼓手坐在鼓台前沿之后，其余成员站在自身站位；乐器/手臂的枢轴在肩部。
  rig.position.set(isDrummer ? 0 : 0.2, isDrummer ? 1.02 : 1.3, isDrummer ? 0.12 : 0.02);

  root.add(body, outline, rig);
  root.userData = {
    memberId: definition.id,
    body,
    outline,
    rig,
    stageY: baseY,
    dispose: (): void => {
      disposeObject3D(root, false);
      disposeMaterials();
      root.clear();
    },
  };
  return root;
}

function buildStandingBodyParts(
  definition: CharacterDef,
  primary: THREE.Color,
  secondary: THREE.Color,
  ink: THREE.Color,
): PartSpec[] {
  const shoulderWidth = definition.id === 'xuliao' ? 0.34 : definition.id === 'wensheng' ? 0.46 : 0.4;
  const torsoTop = definition.id === 'wensheng' ? 0.15 : 0.14;
  const torsoBottom = definition.id === 'wensheng' ? 0.19 : 0.18;
  const parts: PartSpec[] = [
    // 腿与鞋。
    { geometry: new THREE.BoxGeometry(0.13, 0.72, 0.15), position: [-0.1, 0.36, 0], color: ink },
    { geometry: new THREE.BoxGeometry(0.13, 0.72, 0.15), position: [0.1, 0.36, 0], color: ink },
    { geometry: new THREE.BoxGeometry(0.16, 0.08, 0.26), position: [-0.1, 0.04, 0.05], color: ink },
    { geometry: new THREE.BoxGeometry(0.16, 0.08, 0.26), position: [0.1, 0.04, 0.05], color: ink },
    // 髋、裙摆、躯干、肩线。
    { geometry: new THREE.BoxGeometry(0.3, 0.16, 0.2), position: [0, 0.8, 0], color: ink },
    { geometry: new THREE.CylinderGeometry(0.17, 0.22, 0.2, 6), position: [0, 0.88, 0], color: secondary },
    { geometry: new THREE.CylinderGeometry(torsoTop, torsoBottom, 0.5, 6), position: [0, 1.1, 0], color: primary },
    { geometry: new THREE.BoxGeometry(shoulderWidth, 0.1, 0.2), position: [0, 1.35, 0], color: secondary },
    // 颈与头（无脸；靠发型与色块认人）。
    { geometry: new THREE.CylinderGeometry(0.035, 0.035, 0.08, 5), position: [0, 1.41, 0], color: ink },
    { geometry: new THREE.IcosahedronGeometry(0.135, 0), position: [0, 1.51, 0], color: ink },
  ];

  // 发型：四人的第一识别点。
  if (definition.id === 'jiangqi') {
    parts.push(
      { geometry: new THREE.BoxGeometry(0.28, 0.1, 0.26), position: [0, 1.62, 0], color: secondary },
      { geometry: new THREE.BoxGeometry(0.09, 0.26, 0.14), position: [-0.17, 1.5, 0], rotation: [0, 0, 0.22], color: secondary },
      { geometry: new THREE.BoxGeometry(0.09, 0.26, 0.14), position: [0.17, 1.5, 0], rotation: [0, 0, -0.22], color: secondary },
    );
  } else if (definition.id === 'xuliao') {
    parts.push(
      { geometry: new THREE.ConeGeometry(0.06, 0.18, 4), position: [0, 1.64, 0], color: secondary },
      { geometry: new THREE.ConeGeometry(0.05, 0.16, 4), position: [-0.08, 1.62, 0.04], rotation: [0, 0, 0.4], color: secondary },
      { geometry: new THREE.ConeGeometry(0.05, 0.16, 4), position: [0.08, 1.62, 0.04], rotation: [0, 0, -0.4], color: secondary },
    );
  } else if (definition.id === 'wensheng') {
    parts.push(
      { geometry: new THREE.BoxGeometry(0.27, 0.1, 0.25), position: [0, 1.62, 0], color: secondary },
      { geometry: new THREE.BoxGeometry(0.11, 0.48, 0.1), position: [0, 1.3, -0.14], color: secondary },
    );
  } else {
    parts.push(
      { geometry: new THREE.BoxGeometry(0.28, 0.1, 0.26), position: [0, 1.63, 0], color: secondary },
      { geometry: new THREE.ConeGeometry(0.07, 0.42, 5), position: [0, 1.55, -0.16], rotation: [0.55, 0, 0], color: secondary },
    );
  }
  return parts;
}

function buildSeatedBodyParts(primary: THREE.Color, secondary: THREE.Color, ink: THREE.Color): PartSpec[] {
  return [
    // 大腿前伸、小腿下垂。
    { geometry: new THREE.BoxGeometry(0.15, 0.16, 0.46), position: [-0.11, 0.52, 0.16], color: ink },
    { geometry: new THREE.BoxGeometry(0.15, 0.16, 0.46), position: [0.11, 0.52, 0.16], color: ink },
    { geometry: new THREE.BoxGeometry(0.12, 0.4, 0.13), position: [-0.11, 0.24, 0.38], color: ink },
    { geometry: new THREE.BoxGeometry(0.12, 0.4, 0.13), position: [0.11, 0.24, 0.38], color: ink },
    { geometry: new THREE.BoxGeometry(0.16, 0.08, 0.24), position: [-0.11, 0.05, 0.44], color: ink },
    { geometry: new THREE.BoxGeometry(0.16, 0.08, 0.24), position: [0.11, 0.05, 0.44], color: ink },
    // 髋、躯干、肩线。
    { geometry: new THREE.BoxGeometry(0.34, 0.18, 0.24), position: [0, 0.56, 0], color: ink },
    { geometry: new THREE.CylinderGeometry(0.15, 0.19, 0.46, 6), position: [0, 0.84, 0], color: primary },
    { geometry: new THREE.BoxGeometry(0.44, 0.1, 0.2), position: [0, 1.06, 0], color: secondary },
    { geometry: new THREE.CylinderGeometry(0.035, 0.035, 0.08, 5), position: [0, 1.12, 0], color: ink },
    { geometry: new THREE.IcosahedronGeometry(0.135, 0), position: [0, 1.22, 0], color: ink },
    // 高马尾。
    { geometry: new THREE.BoxGeometry(0.28, 0.1, 0.26), position: [0, 1.33, 0], color: secondary },
    { geometry: new THREE.ConeGeometry(0.07, 0.4, 5), position: [0, 1.26, -0.16], rotation: [0.55, 0, 0], color: secondary },
  ];
}

function buildRigParts(
  definition: CharacterDef,
  primary: THREE.Color,
  secondary: THREE.Color,
  ink: THREE.Color,
  warm: THREE.Color,
): PartSpec[] {
  if (definition.line === 'drums') {
    // 两臂与鼓棒抬到肩线附近，保证从舞台后上方的相机也能看见「在打鼓」。
    return [
      { geometry: new THREE.BoxGeometry(0.09, 0.34, 0.1), position: [-0.2, 0.02, 0.06], rotation: [-0.85, 0, 0.22], color: ink },
      { geometry: new THREE.BoxGeometry(0.09, 0.34, 0.1), position: [0.2, 0.02, 0.06], rotation: [-0.85, 0, -0.22], color: ink },
      { geometry: new THREE.CylinderGeometry(0.014, 0.014, 0.38, 4), position: [-0.3, 0.18, 0.16], rotation: [1.2, 0, 0.28], color: warm },
      { geometry: new THREE.CylinderGeometry(0.014, 0.014, 0.38, 4), position: [0.3, 0.18, 0.16], rotation: [1.2, 0, -0.28], color: warm },
    ];
  }

  if (definition.id === 'jiangqi') {
    // 举麦：手在肩上方，琴/麦从背后也能读出。
    return [
      { geometry: new THREE.BoxGeometry(0.09, 0.36, 0.1), position: [0.12, 0.02, 0.02], rotation: [0, 0, -1.2], color: primary },
      { geometry: new THREE.BoxGeometry(0.08, 0.1, 0.1), position: [0.32, 0.1, 0.03], color: ink },
      { geometry: new THREE.CylinderGeometry(0.018, 0.018, 0.24, 5), position: [0.36, 0.22, 0.04], rotation: [0, 0, -0.15], color: warm },
      { geometry: new THREE.SphereGeometry(0.045, 5, 3), position: [0.38, 0.35, 0.05], color: ink },
    ];
  }

  if (definition.id === 'xuliao') {
    // 吉他斜挎：琴颈伸到右肩上方，从后上方看是一条明确的斜线。
    return [
      { geometry: new THREE.BoxGeometry(0.09, 0.34, 0.1), position: [0.08, -0.08, 0.04], rotation: [0, 0, -0.5], color: primary },
      { geometry: new THREE.BoxGeometry(0.08, 0.1, 0.1), position: [0.24, -0.2, 0.06], color: ink },
      { geometry: new THREE.BoxGeometry(0.38, 0.3, 0.08), position: [0.14, -0.2, 0.08], rotation: [0, 0, 0.18], color: primary },
      { geometry: new THREE.BoxGeometry(0.06, 0.62, 0.045), position: [0.38, 0.12, 0.07], rotation: [0, 0, -0.9], color: warm },
    ];
  }

  // 闻笙：贝斯长颈横到身侧，长横线是她的 40px 识别点。
  return [
    { geometry: new THREE.BoxGeometry(0.09, 0.34, 0.1), position: [0.08, -0.08, 0.04], rotation: [0, 0, -0.55], color: primary },
    { geometry: new THREE.BoxGeometry(0.08, 0.1, 0.1), position: [0.24, -0.2, 0.06], color: ink },
    { geometry: new THREE.BoxGeometry(0.44, 0.32, 0.08), position: [0.12, -0.22, 0.08], rotation: [0, 0, 0.15], color: secondary },
    { geometry: new THREE.BoxGeometry(0.06, 0.92, 0.045), position: [0.5, 0.06, 0.07], rotation: [0, 0, -1.35], color: warm },
  ];
}

/* ==========================================================================
 * 5. 观众与噪音几何
 * ========================================================================== */

/**
 * 40px 可读的观众低模（头 + 肩，12 个三角面）；一个几何体供 InstancedMesh 复用。
 * 底座在 y=0，实例只需给 XZ + 排高；手机灯与颜色由 instancing 层另建。
 */
export function buildAudienceGeometry(): THREE.BufferGeometry {
  // 10 个三角面：4 边锥台（8 面）+ 顶盖（2 面），无底盖（永远坐在地面上）。
  const bottomRadius = 0.17;
  const topRadius = 0.1;
  const height = 0.72;
  const bottom: readonly [Vec3, Vec3, Vec3, Vec3] = [
    [-bottomRadius, 0, -bottomRadius],
    [bottomRadius, 0, -bottomRadius],
    [bottomRadius, 0, bottomRadius],
    [-bottomRadius, 0, bottomRadius],
  ];
  const top: readonly [Vec3, Vec3, Vec3, Vec3] = [
    [-topRadius, height, -topRadius],
    [topRadius, height, -topRadius],
    [topRadius, height, topRadius],
    [-topRadius, height, topRadius],
  ];
  const [b0, b1, b2, b3] = bottom;
  const [t0, t1, t2, t3] = top;

  const positions: number[] = [];
  const triangle = (a: Vec3, b: Vec3, c: Vec3): void => {
    positions.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
  };

  // 四个侧面，每个面 2 个三角，绕序保证法线朝外。
  triangle(b0, t1, b1);
  triangle(b0, t0, t1);
  triangle(b1, t2, b2);
  triangle(b1, t1, t2);
  triangle(b2, t3, b3);
  triangle(b2, t2, t3);
  triangle(b3, t0, b0);
  triangle(b3, t3, t0);
  // 顶盖。
  triangle(t0, t2, t1);
  triangle(t0, t3, t2);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  geometry.name = 'audience-bust';
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * 五种噪音几何：底噪 / 啸叫 / 失真 / 返听 / 静默。
 * 全部以原点为脚底或中心，实例层只负责位置与朝向；颜色由 instancing/scene 决定。
 */
export function buildNoiseGeometries(): Readonly<Record<NoiseKind, THREE.BufferGeometry>> {
  const floorNoise = new THREE.CylinderGeometry(0.16, 0.22, 0.07, 6, 1, false);
  floorNoise.translate(0, 0.035, 0);
  floorNoise.name = 'noise-floor-noise';

  const scream = new THREE.ConeGeometry(0.26, 1.8, 4, 1, false);
  scream.translate(0, 0.9, 0);
  scream.name = 'noise-scream';

  const distortion = mergeParts(
    [
      { geometry: new THREE.BoxGeometry(1.1, 1.0, 0.8) },
      { geometry: new THREE.BoxGeometry(0.55, 0.55, 0.55), position: [0.16, 0.1, 0.32], rotation: [0.5, 0.4, 0.2] },
    ],
    false,
  );
  distortion.translate(0, 0.5, 0);
  distortion.name = 'noise-distortion';

  const returnListener = mergeParts(
    [
      { geometry: new THREE.TorusGeometry(1.0, 0.1, 3, 8, Math.PI), rotation: [0, 0, -Math.PI / 2] },
      { geometry: new THREE.TorusGeometry(0.62, 0.08, 3, 8, Math.PI), position: [0.02, 0.2, 0], rotation: [0, 0, -Math.PI / 2] },
      { geometry: new THREE.IcosahedronGeometry(0.36, 0), position: [0, -0.64, 0] },
    ],
    false,
  );
  returnListener.translate(0, 1.1, 0);
  returnListener.name = 'noise-return-listener';

  const silence = mergeParts(
    [
      // 两片幕布各做正反两面，避免依赖材质的 DoubleSide 设置。
      { geometry: new THREE.PlaneGeometry(3, 6), position: [-0.5, 3, 0], rotation: [0, 0.35, 0] },
      { geometry: new THREE.PlaneGeometry(3, 6), position: [-0.5, 3, 0], rotation: [0, 0.35 + Math.PI, 0] },
      { geometry: new THREE.PlaneGeometry(3, 6), position: [0.5, 3, 0.6], rotation: [0, -0.35, 0] },
      { geometry: new THREE.PlaneGeometry(3, 6), position: [0.5, 3, 0.6], rotation: [0, -0.35 + Math.PI, 0] },
      { geometry: new THREE.BoxGeometry(0.06, 6, 0.06), position: [-1.95, 3, 0.4] },
      { geometry: new THREE.BoxGeometry(0.06, 6, 0.06), position: [1.95, 3, 0.4] },
      { geometry: new THREE.BoxGeometry(3.9, 0.06, 0.06), position: [0, 6, 0.4] },
      { geometry: new THREE.BoxGeometry(0.06, 0.06, 1.6), position: [0, 0.1, 0.3] },
    ],
    false,
  );
  silence.name = 'noise-silence';

  return {
    'floor-noise': floorNoise,
    scream,
    distortion,
    'return-listener': returnListener,
    silence,
  };
}
