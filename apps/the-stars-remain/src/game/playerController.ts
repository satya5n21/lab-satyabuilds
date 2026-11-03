import * as THREE from 'three';
import { getTerrainHeight } from './createEnvironment';
import { getInitialSpawnYaw, WORLD_CONFIG, WorldCollider } from './gameTypes';

export interface ResolvedMovementResult {
    resolvedDx: number;
    resolvedDz: number;
    distanceMoved: number;
    stepTriggered: boolean;
    isLeftStep: boolean;
}

export function resolvePlayerCollisions(
    currentX: number,
    currentZ: number,
    intendedDx: number,
    intendedDz: number,
    playerRadius: number,
    colliders: readonly WorldCollider[]
): { x: number; z: number } {
    const totalDist = Math.hypot(intendedDx, intendedDz);
    if (totalDist < 1e-6) {
        return { x: currentX, z: currentZ };
    }

    const substeps = Math.max(1, Math.ceil(totalDist / (playerRadius * 0.45)));
    const stepDx = intendedDx / substeps;
    const stepDz = intendedDz / substeps;

    let rx = currentX;
    let rz = currentZ;

    for (let s = 0; s < substeps; s++) {
        rx += stepDx;
        rz += stepDz;

        const maxBound = WORLD_CONFIG.TERRAIN_SIZE * 0.44;
        rx = Math.max(-maxBound, Math.min(maxBound, rx));
        rz = Math.max(-maxBound, Math.min(maxBound, rz));

        for (let iter = 0; iter < 3; iter++) {
            for (let i = 0; i < colliders.length; i++) {
                const col = colliders[i];
                if (col.kind === 'circle') {
                    const dx = rx - col.x;
                    const dz = rz - col.z;
                    const minDist = col.radius + playerRadius;
                    const distSq = dx * dx + dz * dz;

                    if (distSq < minDist * minDist) {
                        const dist = Math.sqrt(distSq);
                        if (dist > 1e-5) {
                            const overlap = minDist - dist;
                            rx += (dx / dist) * overlap;
                            rz += (dz / dist) * overlap;
                        } else {
                            rx += minDist;
                        }
                    }
                } else {
                    const cosR = Math.cos(-col.rotationY);
                    const sinR = Math.sin(-col.rotationY);
                    const relX = rx - col.x;
                    const relZ = rz - col.z;

                    const localX = relX * cosR - relZ * sinR;
                    const localZ = relX * sinR + relZ * cosR;

                    const clampedX = Math.max(-col.halfWidth, Math.min(col.halfWidth, localX));
                    const clampedZ = Math.max(-col.halfDepth, Math.min(col.halfDepth, localZ));

                    const diffX = localX - clampedX;
                    const diffZ = localZ - clampedZ;
                    const distSq = diffX * diffX + diffZ * diffZ;

                    if (distSq < playerRadius * playerRadius) {
                        const dist = Math.sqrt(distSq);
                        let pushLocalX = 0;
                        let pushLocalZ = 0;

                        if (dist > 1e-5) {
                            const overlap = playerRadius - dist;
                            pushLocalX = (diffX / dist) * overlap;
                            pushLocalZ = (diffZ / dist) * overlap;
                        } else {
                            pushLocalZ = playerRadius;
                        }

                        const invCos = Math.cos(col.rotationY);
                        const invSin = Math.sin(col.rotationY);
                        rx += pushLocalX * invCos - pushLocalZ * invSin;
                        rz += pushLocalX * invSin + pushLocalZ * invCos;
                    }
                }
            }
        }
    }

    return { x: rx, z: rz };
}

export class FirstPersonController {
    public readonly position = new THREE.Vector3();
    public yaw = getInitialSpawnYaw();
    public pitch = 0.05;
    public reducedMotion = false;

    private keys = new Set<string>();
    private joystickVec = new THREE.Vector2(0, 0);
    private stepAccumulator = 0;
    private nextStepThreshold: number = WORLD_CONFIG.STEP_DISTANCE;
    private leftFootNext = true;

    // Visual-only first-person walking sway state (never modifies logical player position)
    private walkPhase = 0;
    private swayBlend = 0;
    private currentSwayY = 0;
    private currentSwayLateral = 0;
    private currentSwayRoll = 0;

    constructor(private readonly camera: THREE.PerspectiveCamera) {
        this.resetToSpawn();
    }

    public resetToSpawn(): void {
        const sx = WORLD_CONFIG.SPAWN_POS.x;
        const sz = WORLD_CONFIG.SPAWN_POS.z;
        const sy = getTerrainHeight(sx, sz) + WORLD_CONFIG.PLAYER_EYE_HEIGHT;

        this.position.set(sx, sy, sz);
        this.yaw = getInitialSpawnYaw();
        this.pitch = 0.05;
        this.keys.clear();
        this.joystickVec.set(0, 0);
        this.stepAccumulator = 0;
        this.nextStepThreshold = WORLD_CONFIG.STEP_DISTANCE;
        this.walkPhase = 0;
        this.swayBlend = 0;
        this.currentSwayY = 0;
        this.currentSwayLateral = 0;
        this.currentSwayRoll = 0;
        this.syncCamera();
    }

    public clearInputs(): void {
        this.keys.clear();
        this.joystickVec.set(0, 0);
    }

    public handleKeyDown(code: string): void {
        this.keys.add(code);
    }

    public handleKeyUp(code: string): void {
        this.keys.delete(code);
    }

    public setJoystick(x: number, y: number): void {
        this.joystickVec.set(x, y);
    }

    public rotateLook(deltaX: number, deltaY: number, sensitivity: number): void {
        const lookScale = 0.0022 * sensitivity;
        this.yaw -= deltaX * lookScale;
        this.pitch -= deltaY * lookScale;

        const maxPitch = Math.PI * 0.47;
        this.pitch = Math.max(-maxPitch, Math.min(maxPitch, this.pitch));
        this.syncCamera();
    }

    public update(
        dt: number,
        canMove: boolean,
        colliders: readonly WorldCollider[]
    ): ResolvedMovementResult {
        const safeDt = Math.min(dt, 0.1);

        if (!canMove) {
            this.settleSway(safeDt, 0, 0);
            this.syncCamera();
            return {
                resolvedDx: 0,
                resolvedDz: 0,
                distanceMoved: 0,
                stepTriggered: false,
                isLeftStep: this.leftFootNext
            };
        }

        let moveForward = 0;
        let moveRight = 0;

        if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) moveForward += 1;
        if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) moveForward -= 1;
        if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) moveRight += 1;
        if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) moveRight -= 1;

        moveForward += -this.joystickVec.y;
        moveRight += this.joystickVec.x;

        const inputLen = Math.hypot(moveForward, moveRight);
        if (inputLen > 1) {
            moveForward /= inputLen;
            moveRight /= inputLen;
        }

        if (inputLen < 0.01) {
            this.settleSway(safeDt, 0, 0);
            this.syncCamera();
            return {
                resolvedDx: 0,
                resolvedDz: 0,
                distanceMoved: 0,
                stepTriggered: false,
                isLeftStep: this.leftFootNext
            };
        }

        const forwardX = -Math.sin(this.yaw);
        const forwardZ = -Math.cos(this.yaw);
        const rightX = Math.cos(this.yaw);
        const rightZ = -Math.sin(this.yaw);

        const speed = WORLD_CONFIG.WALK_SPEED * Math.min(1, inputLen);
        const intendedDx = (forwardX * moveForward + rightX * moveRight) * speed * safeDt;
        const intendedDz = (forwardZ * moveForward + rightZ * moveRight) * speed * safeDt;

        const prevX = this.position.x;
        const prevZ = this.position.z;

        const resolved = resolvePlayerCollisions(
            prevX,
            prevZ,
            intendedDx,
            intendedDz,
            WORLD_CONFIG.PLAYER_RADIUS,
            colliders
        );

        const resolvedDx = resolved.x - prevX;
        const resolvedDz = resolved.z - prevZ;
        const distanceMoved = Math.hypot(resolvedDx, resolvedDz);

        this.position.x = resolved.x;
        this.position.z = resolved.z;
        this.position.y =
            getTerrainHeight(this.position.x, this.position.z) + WORLD_CONFIG.PLAYER_EYE_HEIGHT;

        let stepTriggered = false;
        const isLeftStep = this.leftFootNext;

        if (distanceMoved > 0.001) {
            this.stepAccumulator += distanceMoved;
            if (this.stepAccumulator >= this.nextStepThreshold) {
                this.stepAccumulator -= this.nextStepThreshold;
                // Subtle natural variation (±6%) in step spacing so footsteps feel organic
                this.nextStepThreshold =
                    WORLD_CONFIG.STEP_DISTANCE * (0.94 + Math.random() * 0.12);
                stepTriggered = true;
                this.leftFootNext = !this.leftFootNext;
            }
        }

        const actualSpeedRatio = Math.min(
            1,
            distanceMoved / Math.max(0.0001, WORLD_CONFIG.WALK_SPEED * safeDt)
        );
        this.settleSway(safeDt, distanceMoved, actualSpeedRatio);
        this.syncCamera();

        return {
            resolvedDx,
            resolvedDz,
            distanceMoved,
            stepTriggered,
            isLeftStep
        };
    }

    private settleSway(safeDt: number, distanceMoved: number, speedRatio: number): void {
        if (this.reducedMotion) {
            this.swayBlend = 0;
            this.currentSwayY = 0;
            this.currentSwayLateral = 0;
            this.currentSwayRoll = 0;
            return;
        }

        const targetBlend = distanceMoved > 0.0005 ? speedRatio : 0;
        const blendRate = targetBlend > this.swayBlend ? 7.5 : 10.5;
        this.swayBlend += (targetBlend - this.swayBlend) * (1 - Math.exp(-safeDt * blendRate));

        if (distanceMoved > 0.0005) {
            // Advance phase by actual distance walked so one half-cycle aligns with each step
            this.walkPhase += (distanceMoved / WORLD_CONFIG.STEP_DISTANCE) * Math.PI;
        }

        // Restrained, low-amplitude physical walking cadence
        const targetY = Math.sin(this.walkPhase * 2.0) * 0.032 * this.swayBlend;
        const targetLateral = Math.cos(this.walkPhase) * 0.018 * this.swayBlend;
        const targetRoll = Math.sin(this.walkPhase) * 0.0028 * this.swayBlend;

        const smooth = 1 - Math.exp(-safeDt * 12.0);
        this.currentSwayY += (targetY - this.currentSwayY) * smooth;
        this.currentSwayLateral += (targetLateral - this.currentSwayLateral) * smooth;
        this.currentSwayRoll += (targetRoll - this.currentSwayRoll) * smooth;
    }

    private syncCamera(): void {
        const rightX = Math.cos(this.yaw);
        const rightZ = -Math.sin(this.yaw);

        this.camera.position.set(
            this.position.x + rightX * this.currentSwayLateral,
            this.position.y + this.currentSwayY,
            this.position.z + rightZ * this.currentSwayLateral
        );
        this.camera.rotation.order = 'YXZ';
        this.camera.rotation.y = this.yaw;
        this.camera.rotation.x = this.pitch;
        this.camera.rotation.z = this.currentSwayRoll;
    }
}