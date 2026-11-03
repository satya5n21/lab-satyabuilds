import * as THREE from 'three';
import {
    DesertEnvironmentSystem,
    QualityLevel,
    WORLD_CONFIG,
    WorldCollider
} from './gameTypes';

function createSeededRandom(seed: number): () => number {
    let s = seed >>> 0;
    return () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 4294967296;
    };
}

export function getTerrainHeight(worldX: number, worldZ: number): number {
    const monoDx = worldX - WORLD_CONFIG.MONOLITH_POS.x;
    const monoDz = worldZ - WORLD_CONFIG.MONOLITH_POS.z;
    const distToMonolith = Math.hypot(monoDx, monoDz);

    const plateauFlatten = Math.min(1, Math.max(0, (distToMonolith - 10.0) / 28.0));
    const monolithRise = 2.65 * Math.exp(-(distToMonolith * distToMonolith) / (44.0 * 44.0));

    const primaryDunes =
        Math.sin(worldX * 0.022 + Math.cos(worldZ * 0.018) * 1.3) * 1.75 +
        Math.cos(worldZ * 0.025 - worldX * 0.013) * 1.45;

    const secondaryRidges =
        Math.sin(worldX * 0.055 - worldZ * 0.042 + 1.1) * 0.42 +
        Math.cos(worldX * 0.038 + worldZ * 0.058) * 0.32;

    const distFromCenter = Math.hypot(worldX, worldZ + 55);
    const outerRim = Math.pow(Math.max(0, (distFromCenter - 175) / 145), 1.8) * 5.5;

    return (primaryDunes + secondaryRidges) * plateauFlatten + monolithRise + outerRim;
}

export function createDesertEnvironment(initialQuality: QualityLevel): DesertEnvironmentSystem {
    const rootGroup = new THREE.Group();
    rootGroup.name = 'DesertEnvironment';
    const colliders: WorldCollider[] = [];

    // 1. DARK NOCTURNAL DESERT TERRAIN WITH SUBTLE DUNE RIDGE CONTOURS
    const segments =
        initialQuality === 'high'
            ? WORLD_CONFIG.TERRAIN_SEGMENTS_HIGH
            : WORLD_CONFIG.TERRAIN_SEGMENTS_LOW;

    const terrainGeo = new THREE.PlaneGeometry(
        WORLD_CONFIG.TERRAIN_SIZE,
        WORLD_CONFIG.TERRAIN_SIZE,
        segments,
        segments
    );
    terrainGeo.rotateX(-Math.PI / 2);

    const posAttr = terrainGeo.getAttribute('position') as THREE.BufferAttribute;
    const vertexCount = posAttr.count;
    const colors = new Float32Array(vertexCount * 3);

    // Deep charcoal-navy troughs with restrained blue-slate ridge highlights so dune contours are legible
    const troughColor = new THREE.Color(0x050810);
    const slopeColor = new THREE.Color(0x0a101d);
    const crestColor = new THREE.Color(0x162038);
    const tempColor = new THREE.Color();

    for (let i = 0; i < vertexCount; i++) {
        const wx = posAttr.getX(i);
        const wz = posAttr.getZ(i);
        const wy = getTerrainHeight(wx, wz);
        posAttr.setY(i, wy);

        const hEast = getTerrainHeight(wx + 1.4, wz);
        const hNorth = getTerrainHeight(wx, wz - 1.4);
        const slopeHighlight = Math.max(
            0,
            Math.min(1, (wy - hEast) * 0.45 + (wy - hNorth) * 0.30 + 0.42)
        );
        const normalizedHeight = Math.max(0, Math.min(1, (wy + 2.8) / 6.5));

        tempColor.copy(troughColor).lerp(slopeColor, normalizedHeight);
        tempColor.lerp(crestColor, Math.pow(slopeHighlight, 1.65) * 0.65);

        colors[i * 3] = tempColor.r;
        colors[i * 3 + 1] = tempColor.g;
        colors[i * 3 + 2] = tempColor.b;
    }

    terrainGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    terrainGeo.computeVertexNormals();

    const terrainMat = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.96,
        metalness: 0.03,
        flatShading: false
    });

    const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
    terrainMesh.name = 'DesertTerrainMesh';
    rootGroup.add(terrainMesh);

    // 2. SMOOTH, SILHOUETTED BOULDERS & ROUNDED HORIZON MESAS
    const rockGeo = new THREE.IcosahedronGeometry(1, 3);
    const rockPos = rockGeo.getAttribute('position') as THREE.BufferAttribute;
    const rockVertex = new THREE.Vector3();
    for (let i = 0; i < rockPos.count; i++) {
        rockVertex.fromBufferAttribute(rockPos, i);
        const smoothDeform =
            1.0 +
            0.08 * Math.sin(rockVertex.x * 2.4 + rockVertex.y * 1.8) +
            0.07 * Math.cos(rockVertex.z * 2.6 - rockVertex.x * 1.5);
        rockVertex.multiplyScalar(smoothDeform);
        if (rockVertex.y < -0.15) {
            rockVertex.y *= 0.52;
        }
        rockPos.setXYZ(i, rockVertex.x, rockVertex.y, rockVertex.z);
    }
    rockGeo.computeVertexNormals();

    const rockMat = new THREE.MeshStandardMaterial({
        color: 0x070a12,
        roughness: 0.97,
        metalness: 0.02,
        flatShading: false
    });

    const rand = createSeededRandom(908172);
    const rocksGroup = new THREE.Group();
    rocksGroup.name = 'DesertRocks';
    rootGroup.add(rocksGroup);

    interface RockPlacement {
        x: number;
        z: number;
        scaleX: number;
        scaleY: number;
        scaleZ: number;
        rotY: number;
    }

    const placements: RockPlacement[] = [];

    const curatedRocks: Array<{ x: number; z: number; sx: number; sy: number; sz: number; ry: number }> = [
        { x: 16, z: -22, sx: 2.9, sy: 1.7, sz: 2.6, ry: 0.4 },
        { x: 54, z: -26, sx: 3.8, sy: 2.2, sz: 3.3, ry: 1.2 },
        { x: 8, z: -48, sx: 3.4, sy: 1.9, sz: 3.0, ry: 2.1 },
        { x: 38, z: -64, sx: 4.5, sy: 2.5, sz: 3.9, ry: 0.85 },
        { x: -16, z: -56, sx: 3.5, sy: 2.0, sz: 3.1, ry: 1.7 },
        { x: 22, z: -86, sx: 4.1, sy: 2.3, sz: 3.6, ry: 2.6 },
        { x: -22, z: -92, sx: 4.8, sy: 2.7, sz: 4.2, ry: 0.3 },
        { x: 28, z: -110, sx: 3.6, sy: 2.0, sz: 3.2, ry: 1.9 }
    ];

    for (const c of curatedRocks) {
        placements.push({
            x: c.x,
            z: c.z,
            scaleX: c.sx,
            scaleY: c.sy,
            scaleZ: c.sz,
            rotY: c.ry
        });
    }

    const horizonMesas: Array<{ x: number; z: number; sx: number; sy: number; sz: number; ry: number }> = [
        { x: -78, z: -165, sx: 24, sy: 11.5, sz: 18, ry: 0.2 },
        { x: 48, z: -175, sx: 18, sy: 12.0, sz: 16, ry: 1.1 },
        { x: 125, z: -150, sx: 26, sy: 11.0, sz: 20, ry: 0.7 },
        { x: -145, z: -110, sx: 22, sy: 10.5, sz: 18, ry: 2.0 }
    ];

    for (const m of horizonMesas) {
        placements.push({
            x: m.x,
            z: m.z,
            scaleX: m.sx,
            scaleY: m.sy,
            scaleZ: m.sz,
            rotY: m.ry
        });
    }

    for (let i = 0; i < 48; i++) {
        const isOuterMesa = i >= 30;
        let rx = 0;
        let rz = 0;

        if (isOuterMesa) {
            const angle = (i - 30) * ((Math.PI * 2) / 18) + (rand() - 0.5) * 0.2;
            const dist = 175 + rand() * 70;
            rx = Math.cos(angle) * dist;
            rz = -55 + Math.sin(angle) * dist;
        } else {
            rx = (rand() - 0.45) * 195;
            rz = 30 - rand() * 190;
        }

        const distFromSpawn = Math.hypot(
            rx - WORLD_CONFIG.SPAWN_POS.x,
            rz - WORLD_CONFIG.SPAWN_POS.z
        );
        const distFromMonolith = Math.hypot(
            rx - WORLD_CONFIG.MONOLITH_POS.x,
            rz - WORLD_CONFIG.MONOLITH_POS.z
        );

        if (distFromSpawn < 24 || distFromMonolith < 20) {
            continue;
        }

        const scaleX = isOuterMesa ? 14 + rand() * 16 : 1.8 + rand() * 3.4;
        const scaleZ = scaleX * (0.82 + rand() * 0.32);
        const scaleY = isOuterMesa ? 6.5 + rand() * 8.5 : 1.0 + rand() * 2.1;

        placements.push({
            x: rx,
            z: rz,
            scaleX,
            scaleY,
            scaleZ,
            rotY: rand() * Math.PI * 2
        });
    }

    for (const p of placements) {
        const mesh = new THREE.Mesh(rockGeo, rockMat);
        const groundY = getTerrainHeight(p.x, p.z);
        mesh.position.set(p.x, groundY + p.scaleY * 0.28 - 0.32, p.z);
        mesh.scale.set(p.scaleX, p.scaleY, p.scaleZ);
        mesh.rotation.y = p.rotY;
        rocksGroup.add(mesh);

        const horizontalRadius = Math.max(p.scaleX, p.scaleZ) * 0.88;
        colliders.push({
            kind: 'circle',
            x: p.x,
            z: p.z,
            radius: horizontalRadius,
            label: 'rock'
        });
    }

    // 3. FADING FOOTPRINTS RING BUFFER
    const MAX_FOOTPRINTS = 36;
    const footprintGeo = new THREE.PlaneGeometry(0.28, 0.56);
    footprintGeo.rotateX(-Math.PI / 2);

    interface FootprintSlot {
        mesh: THREE.Mesh;
        mat: THREE.MeshBasicMaterial;
        age: number;
        active: boolean;
    }

    const footprints: FootprintSlot[] = [];
    const footprintsGroup = new THREE.Group();
    footprintsGroup.name = 'Footprints';
    rootGroup.add(footprintsGroup);

    for (let i = 0; i < MAX_FOOTPRINTS; i++) {
        const mat = new THREE.MeshBasicMaterial({
            color: 0x020307,
            transparent: true,
            opacity: 0,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -1
        });
        const mesh = new THREE.Mesh(footprintGeo, mat);
        mesh.visible = false;
        footprintsGroup.add(mesh);
        footprints.push({ mesh, mat, age: 0, active: false });
    }
    let footprintCursor = 0;

    // 4. STABLE, CLEARLY VISIBLE SQUARE DUST FLECKS
    const MAX_PARTICLES_HIGH = 220;
    const MAX_PARTICLES_LOW = 110;
    const DUST_RADIUS = 44.0;

    const dustPositions = new Float32Array(MAX_PARTICLES_HIGH * 3);
    const dustHeightOffsets = new Float32Array(MAX_PARTICLES_HIGH);
    const dustSizes = new Float32Array(MAX_PARTICLES_HIGH);
    const dustAlphas = new Float32Array(MAX_PARTICLES_HIGH);
    const dustPhases = new Float32Array(MAX_PARTICLES_HIGH);

    const dustRand = createSeededRandom(551923);

    const spawnOrigin = new THREE.Vector3(
        WORLD_CONFIG.SPAWN_POS.x,
        getTerrainHeight(WORLD_CONFIG.SPAWN_POS.x, WORLD_CONFIG.SPAWN_POS.z),
        WORLD_CONFIG.SPAWN_POS.z
    );

    const populateDustAround = (center: THREE.Vector3) => {
        for (let i = 0; i < MAX_PARTICLES_HIGH; i++) {
            const r = 2.5 + Math.pow(dustRand(), 0.72) * (DUST_RADIUS - 2.5);
            const theta = dustRand() * Math.PI * 2;
            const px = center.x + Math.cos(theta) * r;
            const pz = center.z + Math.sin(theta) * r;
            const hOffset = 0.18 + dustRand() * 2.4;
            const py = getTerrainHeight(px, pz) + hOffset;

            dustPositions[i * 3] = px;
            dustPositions[i * 3 + 1] = py;
            dustPositions[i * 3 + 2] = pz;
            dustHeightOffsets[i] = hOffset;
            dustSizes[i] = dustRand() < 0.16 ? 4.4 + dustRand() * 2.0 : 2.4 + dustRand() * 1.8;
            dustAlphas[i] = 0.36 + dustRand() * 0.38;
            dustPhases[i] = dustRand() * Math.PI * 2;
        }
    };

    populateDustAround(spawnOrigin);

    const dustGeo = new THREE.BufferGeometry();
    const dustPosAttr = new THREE.BufferAttribute(dustPositions, 3);
    dustPosAttr.setUsage(THREE.DynamicDrawUsage);
    dustGeo.setAttribute('position', dustPosAttr);
    dustGeo.setAttribute('aSize', new THREE.BufferAttribute(dustSizes, 1));
    dustGeo.setAttribute('aAlpha', new THREE.BufferAttribute(dustAlphas, 1));
    dustGeo.setAttribute('aPhase', new THREE.BufferAttribute(dustPhases, 1));
    dustGeo.setDrawRange(0, initialQuality === 'high' ? MAX_PARTICLES_HIGH : MAX_PARTICLES_LOW);

    const dustMat = new THREE.ShaderMaterial({
        transparent: true,
        depthTest: true,
        depthWrite: false,
        fog: false,
        blending: THREE.NormalBlending,
        uniforms: {
            uTime: { value: 0 },
            uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
            uPlayerPos: { value: spawnOrigin.clone() },
            uMaxRadius: { value: DUST_RADIUS }
        },
        vertexShader: /* glsl */ `
      attribute float aSize;
      attribute float aAlpha;
      attribute float aPhase;

      uniform float uTime;
      uniform float uPixelRatio;
      uniform vec3 uPlayerPos;
      uniform float uMaxRadius;

      varying float vAlpha;

      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;

        float distToPlayer = length(position.xz - uPlayerPos.xz);
        float outerFade = 1.0 - smoothstep(uMaxRadius * 0.76, uMaxRadius * 0.98, distToPlayer);
        float nearFade = smoothstep(0.8, 2.4, -mvPosition.z);
        float gentleDriftFade = 0.85 + 0.15 * sin(uTime * 1.1 + aPhase);

        vAlpha = aAlpha * outerFade * nearFade * gentleDriftFade;

        float distAtten = clamp(16.0 / max(3.5, -mvPosition.z), 0.58, 1.45);
        gl_PointSize = clamp(aSize * distAtten * uPixelRatio, 2.2 * uPixelRatio, 6.8 * uPixelRatio);
      }
    `,
        fragmentShader: /* glsl */ `
      varying float vAlpha;

      void main() {
        if (vAlpha <= 0.005) discard;

        vec2 uv = abs(gl_PointCoord - vec2(0.5)) * 2.0;
        float squareEdge = 1.0 - smoothstep(0.78, 1.0, max(uv.x, uv.y));

        vec3 dustColor = vec3(0.45, 0.51, 0.62);
        gl_FragColor = vec4(dustColor, squareEdge * vAlpha);
      }
    `
    });

    const dustPoints = new THREE.Points(dustGeo, dustMat);
    dustPoints.name = 'DesertDustParticles';
    dustPoints.frustumCulled = false;
    rootGroup.add(dustPoints);

    let activeDustCount = initialQuality === 'high' ? MAX_PARTICLES_HIGH : MAX_PARTICLES_LOW;

    return {
        group: rootGroup,
        colliders,

        update(dt, elapsedTime, playerPos, isReflection, pixelRatio) {
            const safeDt = Math.min(dt, 0.1);

            for (let i = 0; i < MAX_FOOTPRINTS; i++) {
                const fp = footprints[i];
                if (!fp.active) continue;
                fp.age += safeDt;
                if (fp.age >= 18) {
                    fp.active = false;
                    fp.mesh.visible = false;
                } else {
                    fp.mat.opacity = 0.28 * (1 - fp.age / 18);
                }
            }

            const windMultiplier = isReflection ? 0.35 : 1.0;
            const windVx = 0.85 * windMultiplier;
            const windVz = 0.32 * windMultiplier;

            for (let i = 0; i < activeDustCount; i++) {
                let px =
                    dustPositions[i * 3] +
                    (windVx + Math.sin(elapsedTime * 0.55 + dustPhases[i]) * 0.18) * safeDt;
                let pz =
                    dustPositions[i * 3 + 2] +
                    (windVz + Math.cos(elapsedTime * 0.48 + dustPhases[i]) * 0.16) * safeDt;

                const dx = px - playerPos.x;
                const dz = pz - playerPos.z;
                const distSq = dx * dx + dz * dz;

                if (distSq > DUST_RADIUS * DUST_RADIUS) {
                    const angle = Math.atan2(dz, dx) + Math.PI + (Math.random() - 0.5) * 0.5;
                    const wrapR = DUST_RADIUS * (0.88 + Math.random() * 0.09);
                    px = playerPos.x + Math.cos(angle) * wrapR;
                    pz = playerPos.z + Math.sin(angle) * wrapR;
                }

                const waveH = Math.sin(elapsedTime * 0.75 + dustPhases[i]) * 0.1;
                const py = getTerrainHeight(px, pz) + dustHeightOffsets[i] + waveH;

                dustPositions[i * 3] = px;
                dustPositions[i * 3 + 1] = py;
                dustPositions[i * 3 + 2] = pz;
            }

            dustPosAttr.needsUpdate = true;

            dustMat.uniforms.uTime.value = elapsedTime;
            dustMat.uniforms.uPixelRatio.value = pixelRatio;
            dustMat.uniforms.uPlayerPos.value.copy(playerPos);
        },

        addFootprint(x, z, yaw, isLeft) {
            const fp = footprints[footprintCursor];
            footprintCursor = (footprintCursor + 1) % MAX_FOOTPRINTS;

            const lateralOffset = isLeft ? -0.22 : 0.22;
            const fx = x + Math.cos(yaw) * lateralOffset;
            const fz = z - Math.sin(yaw) * lateralOffset;
            const fy = getTerrainHeight(fx, fz) + 0.018;

            fp.mesh.position.set(fx, fy, fz);
            fp.mesh.rotation.set(-Math.PI / 2, 0, yaw);
            fp.mesh.visible = true;
            fp.mat.opacity = 0.28;
            fp.age = 0;
            fp.active = true;
        },

        setQuality(quality) {
            activeDustCount = quality === 'high' ? MAX_PARTICLES_HIGH : MAX_PARTICLES_LOW;
            dustGeo.setDrawRange(0, activeDustCount);
        },

        reset(spawnPos) {
            for (const fp of footprints) {
                fp.active = false;
                fp.mesh.visible = false;
                fp.age = 0;
            }
            populateDustAround(spawnPos);
            dustPosAttr.needsUpdate = true;
            dustMat.uniforms.uPlayerPos.value.copy(spawnPos);
        },

        dispose() {
            terrainGeo.dispose();
            terrainMat.dispose();
            rockGeo.dispose();
            rockMat.dispose();
            footprintGeo.dispose();
            for (const fp of footprints) {
                fp.mat.dispose();
            }
            dustGeo.dispose();
            dustMat.dispose();
        }
    };
}