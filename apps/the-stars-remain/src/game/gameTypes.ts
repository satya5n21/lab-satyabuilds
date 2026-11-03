import * as THREE from 'three';

export type GamePhase =
    | 'start'
    | 'exploring'
    | 'approaching'
    | 'nearMonolith'
    | 'reflection'
    | 'resetting'
    | 'paused';

export type QualityLevel = 'high' | 'low';

export interface GameSettings {
    muted: boolean;
    musicMuted: boolean;
    musicVolume: number;
    sensitivity: number;
    quality: QualityLevel;
    reducedMotion: boolean;
}

export interface CircleCollider {
    kind: 'circle';
    x: number;
    z: number;
    radius: number;
    label?: string;
}

export interface OrientedBoxCollider {
    kind: 'obb';
    x: number;
    z: number;
    halfWidth: number;
    halfDepth: number;
    rotationY: number;
    label?: string;
}

export type WorldCollider = CircleCollider | OrientedBoxCollider;

export const WORLD_CONFIG = {
    MONOLITH_POS: { x: 0, z: -125 },
    // Diagonal spawn position: 42 units East, 137 units South of monolith (~133.4m total distance)
    SPAWN_POS: { x: 42, z: 12 },
    PLAYER_EYE_HEIGHT: 1.72,
    PLAYER_RADIUS: 0.65,
    WALK_SPEED: 6.4,
    STEP_DISTANCE: 1.68,
    APPROACH_DISTANCE: 38.0,
    NEAR_DISTANCE: 16.0,
    INTERACTION_DISTANCE: 8.2,
    STAR_DRIFT_RAD_PER_UNIT: 0.014,
    TERRAIN_SIZE: 720,
    TERRAIN_SEGMENTS_HIGH: 220,
    TERRAIN_SEGMENTS_LOW: 128
} as const;

export function getInitialSpawnYaw(): number {
    const dx = WORLD_CONFIG.MONOLITH_POS.x - WORLD_CONFIG.SPAWN_POS.x;
    const dz = WORLD_CONFIG.MONOLITH_POS.z - WORLD_CONFIG.SPAWN_POS.z;
    const exactYawToMonolith = Math.atan2(-dx, -dz);
    return exactYawToMonolith - 0.06;
}

export interface StarfieldSystem {
    group: THREE.Group;
    update: (
        dt: number,
        elapsedTime: number,
        playerPos: THREE.Vector3,
        resolvedDx: number,
        resolvedDz: number,
        pixelRatio: number,
        allowShootingStars: boolean
    ) => void;
    setQuality: (quality: QualityLevel) => void;
    reset: (spawnPos: THREE.Vector3) => void;
    dispose: () => void;
}

export interface DesertEnvironmentSystem {
    group: THREE.Group;
    colliders: WorldCollider[];
    update: (
        dt: number,
        elapsedTime: number,
        playerPos: THREE.Vector3,
        isReflection: boolean,
        pixelRatio: number
    ) => void;
    addFootprint: (x: number, z: number, yaw: number, isLeft: boolean) => void;
    setQuality: (quality: QualityLevel) => void;
    reset: (spawnPos: THREE.Vector3) => void;
    dispose: () => void;
}

export interface MonolithSystem {
    group: THREE.Group;
    interactionMeshes: THREE.Object3D[];
    colliders: WorldCollider[];
    triggerInteractionSurge: () => void;
    update: (
        dt: number,
        elapsedTime: number,
        distanceToPlayer: number,
        isActivated: boolean
    ) => void;
    reset: () => void;
    dispose: () => void;
}