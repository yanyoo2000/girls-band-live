/**
 * 俯视 3/4 跟随相机（dev-three 所有）。
 *
 * 契约：`docs/tech-spec.md` §5.4（`CameraRig` / `createCameraRig`）。
 * - 俯角 22°、FOV 45、只跟随不旋转（`docs/gdd.md` §16.1）；
 * - 跟随 `CameraFrame.target` 平滑，并按移动速度给出 ≤6m 的领先；
 * - 屏震只作用于相机（art-direction §7：人浪 2px、返听 1.5px，≤0.12s）；
 * - `toStage` 把 NDC 反投影到 y=0 的舞台平面，碰撞只在 XZ 平面（handbook §3.3）。
 *
 * 无 GPU 资源，`dispose()` 只解除单例注册；几何体与材质由 scene 负责释放。
 */

import * as THREE from 'three';
import type { CameraFrame, PointerProjector, Vec2 } from '../types/game';

export interface CameraRig extends PointerProjector {
  readonly camera: THREE.PerspectiveCamera;
  update(frame: CameraFrame, dt: number): void;
  resize(width: number, height: number): void;
  dispose(): void;
}

/** 垂直视场角（GDD §16.1 锁定 45°）。 */
const FOV_DEGREES = 45;
/** 俯角（GDD §16.1 锁定 22°）。 */
const PITCH_RADIANS = (22 * Math.PI) / 180;
/** 默认机位到跟随点的水平距离（米）。 */
const BASE_DISTANCE = 13.5;
const MIN_DISTANCE = 9;
const MAX_DISTANCE = 22;
/** 跟随平滑速率（1/s）；越大越硬。 */
const FOLLOW_RATE = 5.5;
/** 速度领先时间窗（GDD §16.1「领先 6m」）。 */
const LEAD_SECONDS = 0.32;
const MAX_LEAD_METERS = 6;
/** 屏震能量衰减（1/s）。 */
const SHAKE_DECAY = 10;
/** 屏震最大位移（像素；art-direction §7 上限 2px）。 */
const SHAKE_MAX_PIXELS = 2;
/** 跟随点高度：舞台台面 0.8m 略高，读座位表更稳。 */
const TARGET_HEIGHT = 0.85;
/** 反投影失败时的舞台中心（tech-spec §5.4「失败回退到舞台中心」）。 */
const FALLBACK_STAGE_POINT: Vec2 = { x: 0, z: 0 };
/** 相机可看范围（场馆内，避免看到墙外）。 */
const BOUNDS = { minX: -8.5, maxX: 8.5, minZ: -3, maxZ: 21 } as const;
/**
 * 机位限制：不让相机跑到后墙（z=-4.28）外面，否则后墙会挡住台面。
 * 跟到舞台附近时水平距离被压缩，俯角会变陡；这是本场馆的可接受取舍。
 */
const CAMERA_LIMITS = { minX: -9.5, maxX: 9.5, minZ: -3.2, maxZ: 26, minHorizontal: 6 } as const;

/** 当前激活的相机（main 在启动顺序第 5 步创建；renderer 每帧读取）。 */
let activeRig: CameraRig | null = null;

/**
 * 创建跟随相机；同时注册为当前激活相机（`src/main.tsx` 只创建一个）。
 * `resize` 必须由 renderer.resize 转发，否则投影与鼠标反投影会错位。
 */
export function createCameraRig(canvas: HTMLCanvasElement): CameraRig {
  const camera = new THREE.PerspectiveCamera(FOV_DEGREES, 16 / 9, 0.1, 90);
  camera.position.set(0, 6.6, -0.5);

  const smoothed = new THREE.Vector3(0, TARGET_HEIGHT, 8);
  const desired = new THREE.Vector3(0, TARGET_HEIGHT, 8);
  const lastTarget = new THREE.Vector3(0, 0, 8);
  const rayOrigin = new THREE.Vector3();
  const rayDirection = new THREE.Vector3();
  const unprojected = new THREE.Vector3();

  let viewportWidth = Math.max(1, Math.floor(canvas.clientWidth || canvas.width || 1280));
  let viewportHeight = Math.max(1, Math.floor(canvas.clientHeight || canvas.height || 720));
  let velocityX = 0;
  let velocityZ = 0;
  let shakeEnergy = 0;
  let elapsed = 0;

  applyProjection();

  const rig: CameraRig = {
    camera,

    update(frame: CameraFrame, dt: number): void {
      const step = clamp(dt, 0, 0.1);
      elapsed += step;

      const wantedX = clamp(frame.target.x, BOUNDS.minX, BOUNDS.maxX);
      const wantedZ = clamp(frame.target.z, BOUNDS.minZ, BOUNDS.maxZ);

      if (step > 1e-4) {
        const blend = 1 - Math.exp(-12 * step);
        velocityX += ((wantedX - lastTarget.x) / step - velocityX) * blend;
        velocityZ += ((wantedZ - lastTarget.z) / step - velocityZ) * blend;
      }
      lastTarget.set(wantedX, 0, wantedZ);

      const leadX = clamp(velocityX * LEAD_SECONDS, -MAX_LEAD_METERS, MAX_LEAD_METERS);
      const leadZ = clamp(velocityZ * LEAD_SECONDS, -MAX_LEAD_METERS, MAX_LEAD_METERS);
      desired.set(
        clamp(wantedX + leadX, BOUNDS.minX, BOUNDS.maxX),
        TARGET_HEIGHT,
        clamp(wantedZ + leadZ, BOUNDS.minZ, BOUNDS.maxZ),
      );

      smoothed.lerp(desired, step > 0 ? 1 - Math.exp(-FOLLOW_RATE * step) : 0);

      const zoom = clamp(frame.zoom > 0 ? frame.zoom : 1, 0.6, 1.8);
      const distance = clamp(BASE_DISTANCE / zoom, MIN_DISTANCE, MAX_DISTANCE);

      shakeEnergy = Math.max(clamp(frame.shake, 0, 1), shakeEnergy * Math.exp(-SHAKE_DECAY * step));
      const worldPerPixel = (2 * distance * Math.tan((FOV_DEGREES * Math.PI) / 360)) / viewportHeight;
      const amplitude = worldPerPixel * SHAKE_MAX_PIXELS * shakeEnergy;
      const shakeX = Math.sin(elapsed * 61.7) * amplitude;
      const shakeY = Math.cos(elapsed * 47.3) * amplitude * 0.55;

      // 机位限制在场馆内（不穿过后墙）；水平距离被压缩时用高度补回俯角，保持 22°。
      const cameraZ = clamp(
        smoothed.z - Math.cos(PITCH_RADIANS) * distance,
        CAMERA_LIMITS.minZ,
        CAMERA_LIMITS.maxZ,
      );
      const horizontal = Math.max(CAMERA_LIMITS.minHorizontal, smoothed.z - cameraZ);

      camera.position.set(
        clamp(smoothed.x + shakeX, CAMERA_LIMITS.minX, CAMERA_LIMITS.maxX),
        smoothed.y + Math.tan(PITCH_RADIANS) * horizontal + shakeY,
        cameraZ,
      );
      camera.lookAt(smoothed.x, smoothed.y, smoothed.z);
    },

    resize(width: number, height: number): void {
      viewportWidth = Math.max(1, Math.floor(width));
      viewportHeight = Math.max(1, Math.floor(height));
      applyProjection();
    },

    toStage(ndc: Vec2): Vec2 {
      rayOrigin.copy(camera.position);
      // Vec2 复用给 NDC：x = 屏幕横轴，z = 屏幕纵轴（game 输入层按同一约定传入）。
      unprojected.set(clamp(ndc.x, -1, 1), clamp(ndc.z, -1, 1), 0.5).unproject(camera);
      rayDirection.copy(unprojected).sub(rayOrigin);
      if (Math.abs(rayDirection.y) < 1e-5) return { ...FALLBACK_STAGE_POINT };

      const distanceToPlane = -rayOrigin.y / rayDirection.y;
      if (!Number.isFinite(distanceToPlane) || distanceToPlane <= 0) return { ...FALLBACK_STAGE_POINT };

      const hitX = rayOrigin.x + rayDirection.x * distanceToPlane;
      const hitZ = rayOrigin.z + rayDirection.z * distanceToPlane;
      if (!Number.isFinite(hitX) || !Number.isFinite(hitZ)) return { ...FALLBACK_STAGE_POINT };

      return {
        x: clamp(hitX, BOUNDS.minX, BOUNDS.maxX),
        z: clamp(hitZ, BOUNDS.minZ, BOUNDS.maxZ),
      };
    },

    dispose(): void {
      if (activeRig !== null && activeRig.camera === camera) activeRig = null;
    },
  };

  function applyProjection(): void {
    camera.aspect = viewportWidth / viewportHeight;
    camera.updateProjectionMatrix();
  }

  activeRig = rig;
  return rig;
}

/**
 * 当前激活的相机（renderer 读取；`main.tsx` 不直接使用）。
 * 存在原因：tech-spec §5.4 的 `createRenderer(canvas)` 没有 scene/camera 参数，
 * 而 §6.4 要求两者都在启动时创建一次，故由工厂注册、renderer 惰性绑定。
 */
export function getActiveCameraRig(): CameraRig | null {
  return activeRig;
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}
