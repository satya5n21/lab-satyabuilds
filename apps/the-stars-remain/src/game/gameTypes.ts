import * as THREE from 'three';

export type GamePhase =
    | 'start'
    | 'exploring'
    | 'approaching'
    | 'nearMonolith'
    | 'ascension'
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

/**
 * Ascension timeline (seconds since the player touches the monolith).
 * Every system derives its visuals from this single clock so the sequence can be
 * skipped by jumping the clock to DURATION.
 */
export const ASCENSION = {
    /** Glyphs charge, light gathers, the world hushes. */
    CHARGE_END: 1.6,
    /** Beam climbs from the monolith's tip to the zenith. */
    BEAM_RISE_END: 3.0,
    /** Camera eases from the player's view up along the beam. */
    TILT_START: 0.35,
    TILT_END: 4.4,
    /** The sky wheels around the zenith, leaving trails like eons passing. */
    SPIN_START: 3.8,
    SPIN_PEAK: 6.6,
    SPIN_END: 10.4,
    TRAIL_FADE_END: 11.4,
    /** The stars answer: a giant echo of the monolith's engraving is drawn overhead. */
    GLYPH_START: 9.0,
    GLYPH_END: 13.4,
    /** Hand-off to the reflection (quote) phase. */
    DURATION: 14.0,
    /** Final camera pitch while looking up the beam. */
    TARGET_PITCH: 1.06,
    /** Pitch of the sky-glyph centre (slightly above the view centre). */
    GLYPH_PITCH: 1.24
} as const;

/** 0..1 linear ramp of t between a and b. */
export function ramp(t: number, a: number, b: number): number {
    if (b <= a) return t >= b ? 1 : 0;
    return Math.min(1, Math.max(0, (t - a) / (b - a)));
}

export function smoothRamp(t: number, a: number, b: number): number {
    const x = ramp(t, a, b);
    return x * x * (3 - 2 * x);
}

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
        allowShootingStars: boolean,
        ascensionTime: number
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

export interface SkyGlyphSystem {
    group: THREE.Group;
    /** Orient the glyph so it hangs above the beam in the camera's final view. */
    place: (cameraPos: THREE.Vector3, yaw: number) => void;
    update: (dt: number, elapsedTime: number, ascensionTime: number, pixelRatio: number) => void;
    reset: () => void;
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
        isActivated: boolean,
        ascensionTime: number
    ) => void;
    reset: () => void;
    dispose: () => void;
}