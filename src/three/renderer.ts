/**
 * WebGL2 渲染器单例与每帧绘制编排（dev-three 所有）。
 *
 * 契约：`docs/tech-spec.md` §5.4（`FrameRenderer` / `createRenderer`）、§6.4 启动顺序。
 * - 单例 `WebGLRenderer`：`antialias:false`、`powerPreference:'high-performance'`、DPR 上限 2；
 * - `resize` 由 main 转发，`draw(snapshot, settings)` 是每帧唯一入口；
 * - `stats()` 读 `renderer.info` 并给出 §9.3 的 overdraw 解析估算；
 * - `webglcontextlost` → 全屏中文提示 + 派发 `gbl:context-lost`；恢复后自动隐藏；
 * - 无后处理、无阴影、真 `SpotLight` 恰好 2 盏（在 scene 里）、无每帧新建几何体/材质。
 *
 * 装配说明（tech-spec §5.4 没有给 renderer 注入 scene/camera/instances 的入口）：
 * `createRenderer` 只拿 canvas；scene / camera / 实例 / fx 由各自工厂在 §6.4 第 5 步创建并注册，
 * renderer 在每次 `draw` 时惰性绑定当前激活对象（缺失则跳过该层，不清空其余层）。
 * `main.tsx` 不必额外 hold renderer 的内部对象，但必须**先**创建 scene 再让 loop 首次绘制。
 */

import * as THREE from 'three';
import { getActiveCameraRig } from './camera';
import {
  getActiveAudienceInstances,
  getActiveNoiseInstances,
  getActiveParticleInstances,
} from './instancing';
import { getActiveFxSystem } from './fx';
import { getActiveSceneBundle } from './scene';
import type { AudienceFrame, LightFrame, RenderSnapshot, Vec2 } from '../types/game';
import type { DisplaySettings, QualityLevel } from '../types/save';
import type { CameraRig } from './camera';
import type { AudienceInstances, NoiseInstances, ParticleInstances } from './instancing';
import type { FxSystem } from './fx';
import type { SceneBundle } from './scene';

export interface RendererInfo {
  readonly webglVersion: 2;
  readonly maxTextureSize: number;
  readonly gpu: string;
}

export interface RenderStats {
  readonly drawCalls: number;
  readonly triangles: number;
  readonly programs: number;
  readonly textures: number;
  readonly geometries: number;
  /** 半透明层叠的解析估算（§9.3），≤2.5。 */
  readonly overdrawEstimate: number;
  readonly dpr: number;
}

export interface FrameRenderer {
  readonly info: RendererInfo;
  resize(width: number, height: number, dpr: number): void;
  draw(snapshot: RenderSnapshot, settings: DisplaySettings): void;
  stats(): RenderStats;
  dispose(): void;
}

/* ==========================================================================
 * 常量
 * ========================================================================== */

/** 场馆黑（art-direction §3）。 */
const INK_HEX = 0x0b0d12;
/** 主追光锥：底半径 1（按光半径缩放）、顶半径 0.12、高 4.6m 到桁架。 */
const BEAM_HEIGHT = 4.6;
/** 地面光池贴花离地高度（避免 z-fighting，仍低于观众实例）。 */
const POOL_Y = 0.035;
/** 自发光（返照）护盾半径（GDD §6.1）。 */
const SHIELD_RADIUS = 3.0;
/** 高画质 DPR 上限（handbook §3.5 上限 2；预算目标 1.5）。 */
const HIGH_QUALITY_DPR = 1.5;
const LOW_QUALITY_DPR = 1.0;
const ABSOLUTE_DPR_CAP = 2;
/** 低画质粒子上限（GDD §16.3）。 */
const LOW_QUALITY_PARTICLES = 120;
/** 俯角（与 camera.ts 一致，仅用于 overdraw 椭圆估算）。 */
const PITCH_RADIANS = (22 * Math.PI) / 180;

type LightingState = 'warm' | 'full' | 'blackout';

/** 每帧复用的 CameraFrame（避免 60Hz 分配；target 直接引用快照内的只读对象）。 */
interface MutableCameraFrame {
  target: Vec2;
  zoom: number;
  shake: number;
}

/* ==========================================================================
 * 创建
 * ========================================================================== */

/**
 * 创建渲染器单例。WebGL2 不可用时抛出带中文说明的 `Error`（§6.4 第 4 步转为提示屏）。
 */
export function createRenderer(canvas: HTMLCanvasElement): FrameRenderer {
  const probe = canvas.getContext('webgl2');
  if (probe === null) {
    throw new Error('无法创建 WebGL2 上下文：请使用最新版 Chrome / Edge / Firefox，并确认未禁用硬件加速。');
  }

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    alpha: false,
    stencil: false,
    depth: true,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: false,
  });
  renderer.autoClear = true;
  renderer.setClearColor(INK_HEX, 1);
  renderer.info.autoReset = true;

  if (!renderer.capabilities.isWebGL2) {
    renderer.dispose();
    throw new Error('当前浏览器只提供 WebGL1：本项目需要 WebGL2（GDD §19）。');
  }

  const info: RendererInfo = {
    webglVersion: 2,
    maxTextureSize: renderer.capabilities.maxTextureSize,
    gpu: readGpuName(renderer),
  };

  /* ---- 可直接渲染的兜底相机（scene/camera 尚未创建时也不黑屏崩溃） ---- */
  const fallbackCamera = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 90);
  fallbackCamera.position.set(0, 8.2, -5.5);
  fallbackCamera.lookAt(0, 0.8, 8);

  /* ---- 光锥 / 光池 / 护盾（renderer 自有的加法层，≤3 层） ---- */
  const lightRig = new THREE.Group();
  lightRig.name = 'gbl-light-rig';

  const beamMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    vertexColors: true,
    transparent: true,
    opacity: 0.1,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
    fog: false,
  });
  const beam = new THREE.Mesh(createBeamGeometry(), beamMaterial);
  beam.name = 'gbl-light-beam';
  beam.frustumCulled = false;
  beam.renderOrder = 2;
  lightRig.add(beam);

  const poolMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    vertexColors: true,
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
    fog: false,
  });
  const pool = new THREE.Mesh(createPoolGeometry(), poolMaterial);
  pool.name = 'gbl-light-pool';
  pool.position.y = POOL_Y;
  pool.frustumCulled = false;
  pool.renderOrder = 1;
  lightRig.add(pool);

  const shieldMaterial = new THREE.MeshBasicMaterial({
    color: 0x35e0d0,
    transparent: true,
    opacity: 0.3,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
    fog: false,
  });
  const shieldGeometry = new THREE.RingGeometry(0.93, 1, 6, 1);
  shieldGeometry.rotateX(-Math.PI / 2);
  const shield = new THREE.Mesh(shieldGeometry, shieldMaterial);
  shield.name = 'gbl-light-shield';
  shield.position.y = POOL_Y + 0.004;
  shield.visible = false;
  shield.frustumCulled = false;
  shield.renderOrder = 3;
  lightRig.add(shield);

  /* ---- 绑定状态 ---- */
  const bound = {
    scene: null as SceneBundle | null,
    camera: null as CameraRig | null,
    audience: null as AudienceInstances | null,
    noise: null as NoiseInstances | null,
    particles: null as ParticleInstances | null,
    fx: null as FxSystem | null,
  };

  let viewportWidth = Math.max(1, Math.floor(canvas.clientWidth || canvas.width || 1280));
  let viewportHeight = Math.max(1, Math.floor(canvas.clientHeight || canvas.height || 720));
  let requestedDpr = 1;
  let currentQuality: QualityLevel = 'high';
  let currentReducedMotion = false;
  let appliedLighting: LightingState = 'warm';
  let lastLightRadius = 4.2;
  let beamAlpha = 0;
  let poolAlpha = 0;
  let shieldAlpha = 0;
  let disposed = false;
  let contextLost = false;
  let lastFrameMs = 0;
  let warnedMissingScene = false;
  let overlay: HTMLDivElement | null = null;

  applySize();

  const statsMutable = {
    drawCalls: 0,
    triangles: 0,
    programs: 0,
    textures: 0,
    geometries: 0,
    overdrawEstimate: 0,
    dpr: 1,
  };

  const scratchCameraFrame: MutableCameraFrame = {
    target: { x: 0, z: 0 },
    zoom: 1,
    shake: 0,
  };

  /* ---- WebGL 上下文丢失 / 恢复 ---- */
  function handleContextLost(event: Event): void {
    if (disposed) return;
    event.preventDefault();
    contextLost = true;
    showContextLostOverlay();
    canvas.dispatchEvent(new CustomEvent('gbl:context-lost'));
  }

  function handleContextRestored(): void {
    if (disposed) return;
    contextLost = false;
    hideContextLostOverlay();
    // three 会在恢复时重建 GPU 资源；这里只需把尺寸/DPR 重新对齐。
    applySize();
    lastFrameMs = 0;
    canvas.dispatchEvent(new CustomEvent('gbl:context-restored'));
  }

  canvas.addEventListener('webglcontextlost', handleContextLost, false);
  canvas.addEventListener('webglcontextrestored', handleContextRestored, false);

  /* ---- 内部函数 ---- */

  function applySize(): void {
    const dpr = effectivePixelRatio();
    renderer.setPixelRatio(dpr);
    renderer.setSize(viewportWidth, viewportHeight, true);
    fallbackCamera.aspect = viewportWidth / viewportHeight;
    fallbackCamera.updateProjectionMatrix();
    bound.camera?.resize(viewportWidth, viewportHeight);
  }

  function effectivePixelRatio(): number {
    const cap = currentQuality === 'low' ? LOW_QUALITY_DPR : HIGH_QUALITY_DPR;
    return Math.min(Math.max(requestedDpr, 1), cap, ABSOLUTE_DPR_CAP);
  }

  function bindPipeline(): void {
    const nextScene = getActiveSceneBundle();
    const nextCamera = getActiveCameraRig();
    const nextAudience = getActiveAudienceInstances();
    const nextNoise = getActiveNoiseInstances();
    const nextParticles = getActiveParticleInstances();
    const nextFx = getActiveFxSystem();

    const sceneChanged = nextScene !== bound.scene;
    const instancesChanged =
      nextAudience !== bound.audience || nextNoise !== bound.noise || nextParticles !== bound.particles;

    if (sceneChanged || instancesChanged) {
      lightRig.removeFromParent();
      bound.audience?.mesh.removeFromParent();
      bound.audience?.phones.removeFromParent();
      bound.noise?.group.removeFromParent();
      bound.particles?.mesh.removeFromParent();

      if (nextScene !== null) {
        nextScene.scene.add(lightRig);
        if (nextAudience !== null) {
          nextScene.scene.add(nextAudience.mesh);
          nextScene.scene.add(nextAudience.phones);
        }
        if (nextNoise !== null) nextScene.scene.add(nextNoise.group);
        if (nextParticles !== null) nextScene.scene.add(nextParticles.mesh);
      }

      bound.scene = nextScene;
      bound.audience = nextAudience;
      bound.noise = nextNoise;
      bound.particles = nextParticles;
      appliedLighting = 'warm';
      if (nextScene === null && !warnedMissingScene) {
        warnedMissingScene = true;
        console.warn('[gbl/three] 尚未创建场景：请先调用 createScene(data, palette) 再开始绘制（tech-spec §6.4）。');
      }
    }

    if (nextCamera !== bound.camera) {
      bound.camera = nextCamera;
      nextCamera?.resize(viewportWidth, viewportHeight);
    }

    if (nextFx !== bound.fx) {
      bound.fx = nextFx;
      nextFx?.setReducedMotion(currentReducedMotion);
    }
  }

  function activeCamera(): THREE.PerspectiveCamera {
    return bound.camera?.camera ?? fallbackCamera;
  }

  function applyDisplaySettings(settings: DisplaySettings): void {
    if (settings.quality !== currentQuality) {
      currentQuality = settings.quality;
      applySize();
    }
    if (settings.reducedMotion !== currentReducedMotion) {
      currentReducedMotion = settings.reducedMotion;
      bound.fx?.setReducedMotion(settings.reducedMotion);
    }
  }

  function applyLight(light: LightFrame, flash: number, settings: DisplaySettings): void {
    lastLightRadius = clamp(light.radius, 0.5, 12);
    lightRig.position.set(light.position.x, 0, light.position.z);

    const contrast = settings.highContrast ? 1.15 : 1;
    const flashValue = settings.lowFlash ? Math.min(flash, 0.6) : flash;
    const pulse = settings.reducedMotion ? 0 : clamp(light.pulse, 0, 1);
    const visibility = clamp(light.visibility, 0, 1);
    const brightness =
      clamp(light.intensity, 0, 2) * (1 + pulse * 0.8 + flashValue * 1.8) * contrast * visibility;

    beam.scale.set(lastLightRadius, 1, lastLightRadius);
    pool.scale.set(lastLightRadius, 1, lastLightRadius);

    beamAlpha = clamp(0.1 * brightness, 0, 0.3);
    poolAlpha = clamp(0.17 * brightness, 0, 0.32);
    beamMaterial.opacity = beamAlpha;
    poolMaterial.opacity = poolAlpha;

    const selfMode = light.mode === 'self';
    shield.visible = selfMode;
    shield.scale.setScalar(SHIELD_RADIUS);
    shieldAlpha = selfMode ? clamp(0.28 * brightness, 0, 0.4) : 0;
    shieldMaterial.opacity = shieldAlpha;

    // 真追光跟随光心（scene 拥有这盏灯；renderer 只改瞄准点）。
    if (bound.scene !== null) {
      const target = bound.scene.lights.key.target;
      target.position.set(light.position.x, 0, light.position.z);
    }
  }

  function applyAudienceLighting(snapshot: RenderSnapshot): void {
    if (bound.audience === null) return;
    const whiteout = deriveWhiteout(snapshot.audience);
    applyWhiteoutUniform(bound.audience.mesh, whiteout);

    const dim = 0.35 + 0.65 * clamp(snapshot.venueLight, 0, 1);
    const material = bound.audience.mesh.material;
    const single = Array.isArray(material) ? material[0] : material;
    if (single instanceof THREE.MeshBasicMaterial) single.color.setScalar(dim);

    bound.audience.phones.visible = bound.audience.mesh.visible && !snapshot.silenced;
  }

  function updateDerivedLighting(snapshot: RenderSnapshot): void {
    if (bound.scene === null) return;
    const desired: LightingState = snapshot.silenced ? 'blackout' : snapshot.venueLight >= 0.7 ? 'full' : 'warm';
    if (desired !== appliedLighting) {
      appliedLighting = desired;
      bound.scene.setLighting(desired);
    }
    bound.scene.setVenueLight(clamp(snapshot.venueLight, 0, 1));
  }

  function estimateOverdraw(): number {
    const camera = activeCamera();
    const distance = Math.max(
      0.5,
      Math.hypot(lightRig.position.x - camera.position.x, camera.position.y, lightRig.position.z - camera.position.z),
    );
    const tanV = Math.tan((camera.fov * Math.PI) / 360);
    const tanH = tanV * camera.aspect;
    const screenFraction = (radius: number): number => {
      const ndcX = radius / (distance * tanH);
      const ndcY = (radius * Math.sin(PITCH_RADIANS)) / (distance * tanV);
      return clamp((Math.PI * ndcX * ndcY) / 4, 0, 1);
    };
    const coneArea = screenFraction(lastLightRadius);
    const shieldArea = shield.visible ? screenFraction(SHIELD_RADIUS) : 0;
    return clamp(beamAlpha * coneArea + poolAlpha * coneArea + shieldAlpha * shieldArea, 0, 4);
  }

  function updateStats(): void {
    const renderInfo = renderer.info;
    statsMutable.drawCalls = renderInfo.render.calls;
    statsMutable.triangles = renderInfo.render.triangles;
    statsMutable.programs = renderInfo.programs === null ? 0 : renderInfo.programs.length;
    statsMutable.textures = renderInfo.memory.textures;
    statsMutable.geometries = renderInfo.memory.geometries;
    statsMutable.overdrawEstimate = estimateOverdraw();
    statsMutable.dpr = renderer.getPixelRatio();
  }

  function showContextLostOverlay(): void {
    if (overlay !== null) return;
    const parent = canvas.parentElement;
    if (parent === null) return;
    const element = document.createElement('div');
    element.className = 'gbl-context-lost';
    element.setAttribute('role', 'alert');
    element.setAttribute('aria-live', 'assertive');
    element.textContent = '图形上下文已丢失：正在等待 GPU 恢复。若长时间未恢复，请刷新页面（F5）重新开演。';
    element.style.cssText =
      'position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;' +
      'padding:24px;text-align:center;background:rgba(11,13,18,0.9);color:#edeff2;' +
      'font:16px/1.6 "PingFang SC","Microsoft YaHei",system-ui,sans-serif;';
    parent.appendChild(element);
    overlay = element;
  }

  function hideContextLostOverlay(): void {
    overlay?.remove();
    overlay = null;
  }

  const frameRenderer: FrameRenderer = {
    info,

    resize(width: number, height: number, dpr: number): void {
      viewportWidth = Math.max(1, Math.floor(width));
      viewportHeight = Math.max(1, Math.floor(height));
      requestedDpr = clamp(dpr, 1, ABSOLUTE_DPR_CAP);
      applySize();
    },

    draw(snapshot: RenderSnapshot, settings: DisplaySettings): void {
      if (disposed) return;
      if (contextLost) return;

      const now = performance.now();
      const dt = lastFrameMs === 0 ? 1 / 60 : clamp((now - lastFrameMs) / 1000, 0, 0.1);
      lastFrameMs = now;

      bindPipeline();
      applyDisplaySettings(settings);

      const sceneBundle = bound.scene;
      if (sceneBundle === null) {
        renderer.clear();
        updateStats();
        return;
      }

      updateDerivedLighting(snapshot);

      const scratchFrame = scratchCameraFrame;
      scratchFrame.target = snapshot.camera.target;
      scratchFrame.zoom = snapshot.camera.zoom;
      scratchFrame.shake = settings.reducedMotion ? 0 : snapshot.camera.shake;
      bound.camera?.update(scratchFrame, dt);

      applyLight(snapshot.light, clamp(snapshot.flash, 0, 1), settings);

      bound.audience?.apply(snapshot.audience, settings);
      applyAudienceLighting(snapshot);
      bound.noise?.apply(snapshot.noise, settings);

      const particles = bound.particles;
      if (particles !== null) {
        particles.apply(snapshot.particles);
        if (settings.quality === 'low') {
          particles.mesh.count = Math.min(particles.mesh.count, LOW_QUALITY_PARTICLES);
        }
        // 面片始终正对相机（粒子是四边形，不做逐实例朝向）。
        particles.mesh.quaternion.copy(activeCamera().quaternion);
      }

      bound.fx?.update(dt);

      renderer.render(sceneBundle.scene, activeCamera());
      updateStats();
    },

    stats(): RenderStats {
      return statsMutable;
    },

    dispose(): void {
      if (disposed) return;
      disposed = true;
      canvas.removeEventListener('webglcontextlost', handleContextLost, false);
      canvas.removeEventListener('webglcontextrestored', handleContextRestored, false);
      hideContextLostOverlay();

      lightRig.removeFromParent();
      beam.geometry.dispose();
      beamMaterial.dispose();
      pool.geometry.dispose();
      poolMaterial.dispose();
      shieldGeometry.dispose();
      shieldMaterial.dispose();

      renderer.dispose();
      renderer.forceContextLoss();
    },
  };

  return frameRenderer;
}

/* ==========================================================================
 * 内部工具
 * ========================================================================== */

function readGpuName(renderer: THREE.WebGLRenderer): string {
  const context = renderer.getContext();
  const debugInfo = context.getExtension('WEBGL_debug_renderer_info') as
    | { readonly UNMASKED_RENDERER_WEBGL: number }
    | null;
  if (debugInfo === null) return 'unknown';
  const value: unknown = context.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
  return typeof value === 'string' ? value : 'unknown';
}

/** 追光锥：底半径 1、顶半径 0.12、高 4.6m；顶点色做自上而下的衰减。 */
function createBeamGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.CylinderGeometry(0.12, 1, BEAM_HEIGHT, 20, 3, true);
  geometry.translate(0, BEAM_HEIGHT / 2, 0);
  const position = geometry.getAttribute('position');
  const colors = new Float32Array(position.count * 3);
  for (let index = 0; index < position.count; index += 1) {
    const height = clamp(position.getY(index) / BEAM_HEIGHT, 0, 1);
    const brightness = 0.06 + 0.5 * (1 - height) * (1 - height);
    colors[index * 3] = brightness;
    colors[index * 3 + 1] = brightness;
    colors[index * 3 + 2] = brightness;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

/** 地面光池：5 环 × 48 段的径向衰减贴花（无贴图，顶点色即亮度）。 */
function createPoolGeometry(): THREE.BufferGeometry {
  const segments = 48;
  const rings = 5;
  const positions: number[] = [0, 0, 0];
  const colors: number[] = [1, 1, 1];
  const indices: number[] = [];

  for (let ring = 1; ring <= rings; ring += 1) {
    const radius = ring / rings;
    const brightness = Math.pow(1 - radius, 1.8);
    for (let segment = 0; segment < segments; segment += 1) {
      const angle = (segment / segments) * Math.PI * 2;
      positions.push(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
      colors.push(brightness, brightness, brightness);
    }
  }

  for (let segment = 0; segment < segments; segment += 1) {
    const next = (segment + 1) % segments;
    indices.push(0, 1 + next, 1 + segment);
  }
  for (let ring = 1; ring < rings; ring += 1) {
    const inner = 1 + (ring - 1) * segments;
    const outer = 1 + ring * segments;
    for (let segment = 0; segment < segments; segment += 1) {
      const next = (segment + 1) % segments;
      indices.push(inner + segment, outer + segment, outer + next);
      indices.push(inner + segment, outer + next, inner + next);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * 白光遮罩：与 `game/audience.ts computeWhiteout` 同一公式（0.85 × 空缺比例，clamp 0..0.85）。
 * `RenderSnapshot` 未携带 `whiteout` 字段（tech-spec §14.3 的已知缺口），故由观众帧推导；
 * game 侧一旦把字段加进快照，这里应改为直接读快照值。
 */
function deriveWhiteout(frame: AudienceFrame): number {
  const size = Math.floor(frame.size);
  if (size <= 0) return 0;
  const limit = Math.min(size, frame.state.length);
  let present = 0;
  for (let index = 0; index < limit; index += 1) {
    const code = frame.state[index];
    if (code === 1 || code === 2 || code === 3) present += 1;
  }
  return clamp(0.85 * (1 - present / size), 0, 0.85);
}

/** 把 whiteout 写进观众材质的 uniform（句柄由 instancing.createAudienceMaterial 挂在 userData）。 */
function applyWhiteoutUniform(mesh: THREE.InstancedMesh, value: number): void {
  const material = mesh.material;
  const single = Array.isArray(material) ? material[0] : material;
  if (single === undefined) return;
  const handle: unknown = single.userData['whiteout'];
  if (typeof handle !== 'object' || handle === null) return;
  const uniform = handle as { value?: unknown };
  if (typeof uniform.value === 'number') uniform.value = value;
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}
