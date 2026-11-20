import * as THREE from 'three';
import { getTerrainHeight } from './createEnvironment';
import {
    ASCENSION,
    MonolithSystem,
    ramp,
    smoothRamp,
    WORLD_CONFIG,
    WorldCollider
} from './gameTypes';

export function createMonolith(): MonolithSystem {
    const rootGroup = new THREE.Group();
    rootGroup.name = 'MonolithSanctuary';

    const mx = WORLD_CONFIG.MONOLITH_POS.x;
    const mz = WORLD_CONFIG.MONOLITH_POS.z;
    const baseY = getTerrainHeight(mx, mz);
    rootGroup.position.set(mx, baseY, mz);

    const approachAngle = Math.atan2(
        WORLD_CONFIG.SPAWN_POS.x - mx,
        WORLD_CONFIG.SPAWN_POS.z - mz
    );
    rootGroup.rotation.y = approachAngle * 0.45;

    const colliders: WorldCollider[] = [];
    const interactionMeshes: THREE.Object3D[] = [];

    // 1. DARK ANCIENT BASALT FOUNDATION PLINTH
    const plinthMat = new THREE.MeshStandardMaterial({
        color: 0x070a12,
        roughness: 0.94,
        metalness: 0.05,
        flatShading: true
    });

    const lowerPlinthGeo = new THREE.CylinderGeometry(4.1, 4.8, 0.65, 8);
    const lowerPlinth = new THREE.Mesh(lowerPlinthGeo, plinthMat);
    lowerPlinth.position.y = 0.25;
    lowerPlinth.rotation.y = Math.PI / 8;
    rootGroup.add(lowerPlinth);

    const upperPlinthGeo = new THREE.CylinderGeometry(2.85, 3.35, 0.6, 8);
    const upperPlinth = new THREE.Mesh(upperPlinthGeo, plinthMat);
    upperPlinth.position.y = 0.78;
    upperPlinth.rotation.y = Math.PI / 8;
    rootGroup.add(upperPlinth);

    // 2. MONUMENTAL SACRED MONOLITH (13.8 units high, dark obsidian-slate slab)
    const obeliskHeight = 13.8;
    const baseWidth = 3.25;
    const baseDepth = 1.68;

    const obeliskGeo = new THREE.BoxGeometry(baseWidth, obeliskHeight, baseDepth, 6, 24, 4);
    const obeliskPos = obeliskGeo.getAttribute('position') as THREE.BufferAttribute;
    const v = new THREE.Vector3();

    for (let i = 0; i < obeliskPos.count; i++) {
        v.fromBufferAttribute(obeliskPos, i);
        const normalizedY = (v.y + obeliskHeight * 0.5) / obeliskHeight;

        const widthTaper = 1.0 - normalizedY * 0.46;
        const depthTaper = 1.0 - normalizedY * 0.52;
        v.x *= widthTaper;
        v.z *= depthTaper;

        if (normalizedY > 0.84) {
            const peakT = (normalizedY - 0.84) / 0.16;
            v.x *= 1.0 - peakT * 0.42;
            v.z *= 1.0 - peakT * 0.68;
            v.y -= Math.max(0, -v.x * 0.35) * peakT;
        }

        v.x += Math.sin(v.y * 1.4 + v.z * 2.1) * 0.018;
        v.z += Math.cos(v.y * 1.7 - v.x * 1.5) * 0.014;
        obeliskPos.setXYZ(i, v.x, v.y, v.z);
    }
    obeliskGeo.computeVertexNormals();

    // Keep stone body dark so only the engraved inscriptions shine
    const obeliskMat = new THREE.MeshStandardMaterial({
        color: 0x070b14,
        emissive: new THREE.Color(0x02040a),
        emissiveIntensity: 0.12,
        roughness: 0.91,
        metalness: 0.09,
        flatShading: false
    });

    const obeliskMesh = new THREE.Mesh(obeliskGeo, obeliskMat);
    obeliskMesh.position.y = 0.95 + obeliskHeight * 0.5;
    obeliskMesh.name = 'MonolithObelisk';
    rootGroup.add(obeliskMesh);
    interactionMeshes.push(obeliskMesh, upperPlinth, lowerPlinth);

    colliders.push({
        kind: 'circle',
        x: mx,
        z: mz,
        radius: 3.35,
        label: 'monolith'
    });

    // 3. ENHANCED LUMINOUS CELESTIAL ENGRAVINGS (+25–30% perceived brightness, strictly localized on stone surface)
    const getFrontSurfaceZ = (localY: number): number => {
        const normalizedY = (localY + obeliskHeight * 0.5) / obeliskHeight;
        let depthTaper = 1.0 - normalizedY * 0.52;
        if (normalizedY > 0.84) {
            const peakT = (normalizedY - 0.84) / 0.16;
            depthTaper *= 1.0 - peakT * 0.68;
        }
        return (baseDepth * 0.5) * depthTaper + 0.016;
    };

    // Bright, crisp cool ivory-white core for primary seam
    const primarySeamMat = new THREE.MeshBasicMaterial({
        color: 0xf0f7ff,
        transparent: true,
        opacity: 0.84,
        fog: false,
        blending: THREE.AdditiveBlending
    });

    // Surface-conforming micro-bloom backing strip (only 9.5cm wide on the stone face itself, zero air halo)
    const seamMicroGlowMat = new THREE.MeshBasicMaterial({
        color: 0x7eb8ff,
        transparent: true,
        opacity: 0.28,
        fog: false,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });

    // Crisp pale starlight-blue for secondary rings and geometric inscriptions
    const secondaryGlyphMat = new THREE.MeshBasicMaterial({
        color: 0xc8e2ff,
        transparent: true,
        opacity: 0.52,
        fog: false,
        blending: THREE.AdditiveBlending
    });

    const glyphsGroup = new THREE.Group();
    glyphsGroup.position.y = obeliskMesh.position.y;
    rootGroup.add(glyphsGroup);

    const disposableGeos: THREE.BufferGeometry[] = [];

    const createSurfaceStrip = (
        yBottom: number,
        yTop: number,
        width: number,
        xOffset: number,
        zExtraOffset: number,
        side: 1 | -1,
        mat: THREE.Material
    ) => {
        const segs = 16;
        const height = yTop - yBottom;
        const geo = new THREE.PlaneGeometry(width, height, 1, segs);
        const pos = geo.getAttribute('position') as THREE.BufferAttribute;
        for (let i = 0; i < pos.count; i++) {
            const ly = yBottom + (pos.getY(i) + height * 0.5);
            const lz = side * (getFrontSurfaceZ(ly) + zExtraOffset);
            pos.setXYZ(i, pos.getX(i) + xOffset, ly, lz);
        }
        geo.computeVertexNormals();
        disposableGeos.push(geo);
        const mesh = new THREE.Mesh(geo, mat);
        if (side === -1) {
            mesh.rotation.y = Math.PI;
        }
        glyphsGroup.add(mesh);
    };

    // Primary vertical engraving seam + localized stone-edge micro-glow on both faces
    createSurfaceStrip(-6.2, 5.1, 0.040, -0.08, 0.002, 1, primarySeamMat);
    createSurfaceStrip(-6.2, 5.1, 0.098, -0.08, 0.000, 1, seamMicroGlowMat);
    createSurfaceStrip(-6.2, 5.1, 0.040, 0.08, 0.002, -1, primarySeamMat);
    createSurfaceStrip(-6.2, 5.1, 0.098, 0.08, 0.000, -1, seamMicroGlowMat);

    // Parallel fine harmonic line
    createSurfaceStrip(-1.8, 4.4, 0.022, 0.14, 0.002, 1, secondaryGlyphMat);

    const slopeAngle = Math.atan2(
        getFrontSurfaceZ(-2.0) - getFrontSurfaceZ(2.0),
        4.0
    );

    // Concentric astronomical rings with slightly crisper stroke width for distance legibility
    const ringConfigs = [
        { y: 2.1, rOuter: 0.64, thickness: 0.028 },
        { y: 2.1, rOuter: 0.37, thickness: 0.024 },
        { y: 0.1, rOuter: 0.45, thickness: 0.025 },
        { y: -2.1, rOuter: 0.29, thickness: 0.024 }
    ];

    ringConfigs.forEach(({ y, rOuter, thickness }) => {
        const ringGeo = new THREE.RingGeometry(rOuter - thickness, rOuter, 48);
        disposableGeos.push(ringGeo);

        const zFront = getFrontSurfaceZ(y) + 0.006;
        const frontRing = new THREE.Mesh(ringGeo, secondaryGlyphMat);
        frontRing.position.set(-0.08, y, zFront);
        frontRing.rotation.x = -slopeAngle;
        glyphsGroup.add(frontRing);
    });

    // Delicate horizontal astronomical bars across the seam
    const barHeights = [-4.2, -2.9, -1.1, 1.05, 3.35];
    barHeights.forEach((bh, idx) => {
        const barWidth = 0.90 - idx * 0.11;
        const barGeo = new THREE.PlaneGeometry(barWidth, 0.025);
        disposableGeos.push(barGeo);

        const zFront = getFrontSurfaceZ(bh) + 0.006;
        const barMesh = new THREE.Mesh(barGeo, secondaryGlyphMat);
        barMesh.position.set(-0.08, bh, zFront);
        barMesh.rotation.x = -slopeAngle;
        glyphsGroup.add(barMesh);
    });

    // 4. WEATHERED PERIMETER RUIN STONES
    const pillarGeo = new THREE.BoxGeometry(0.85, 1.9, 0.75);
    disposableGeos.push(pillarGeo);
    const ruinAngles = [0.75, 2.35, 3.88, 5.38];
    ruinAngles.forEach((angle, idx) => {
        const dist = 8.8 + (idx % 2) * 1.5;
        const rx = Math.cos(angle) * dist;
        const rz = Math.sin(angle) * dist;
        const hScale = 0.55 + (idx % 3) * 0.22;

        const ruinMesh = new THREE.Mesh(pillarGeo, plinthMat);
        const localGroundOffset = getTerrainHeight(mx + rx, mz + rz) - baseY;
        ruinMesh.position.set(rx, localGroundOffset + hScale * 0.75, rz);
        ruinMesh.scale.set(1, hScale, 1);
        ruinMesh.rotation.set((idx - 1.5) * 0.05, angle + 0.4, (idx % 2 === 0 ? 1 : -1) * 0.06);
        rootGroup.add(ruinMesh);

        colliders.push({
            kind: 'circle',
            x: mx + rx,
            z: mz + rz,
            radius: 0.9,
            label: 'ruin_stone'
        });
    });

    // 5. ASCENSION: BEAM OF LIGHT, GROUND SHOCKWAVE, AND MONOLITH FLARE
    const tipY = 0.95 + obeliskHeight - 0.4;
    const BEAM_MAX_HEIGHT = 1100;

    const beamVertex = /* glsl */ `
      varying vec2 vUv;
      varying float vFacing;
      void main() {
        vUv = uv;
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vec3 worldNormal = normalize(mat3(modelMatrix) * normal);
        vec3 toCam = normalize(cameraPosition - worldPos.xyz);
        vFacing = abs(dot(worldNormal, toCam));
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `;
    const beamFragment = /* glsl */ `
      uniform vec3 uColor;
      uniform float uIntensity;
      uniform float uTime;
      uniform float uSharpness;
      varying vec2 vUv;
      varying float vFacing;
      void main() {
        float core = pow(clamp(vFacing, 0.0001, 1.0), uSharpness);
        // Bright at the stone, dissolving into the zenith
        float heightFade = pow(clamp(1.0 - vUv.y, 0.0001, 1.0), 0.55);
        // Slow luminous pulses travelling upward along the beam
        float pulse = 0.82 + 0.18 * sin(vUv.y * 90.0 - uTime * 3.2);
        float a = clamp(core * heightFade * pulse * uIntensity, 0.0, 16.0);
        gl_FragColor = vec4(uColor * a, a);
      }
    `;

    const makeBeamMat = (color: number, sharpness: number) =>
        new THREE.ShaderMaterial({
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            fog: false,
            side: THREE.DoubleSide,
            uniforms: {
                uColor: { value: new THREE.Color(color) },
                uIntensity: { value: 0 },
                uTime: { value: 0 },
                uSharpness: { value: sharpness }
            },
            vertexShader: beamVertex,
            fragmentShader: beamFragment
        });

    const beamCoreGeo = new THREE.CylinderGeometry(0.16, 0.16, 1, 20, 1, true);
    beamCoreGeo.translate(0, 0.5, 0);
    const beamGlowGeo = new THREE.CylinderGeometry(1.6, 0.9, 1, 28, 1, true);
    beamGlowGeo.translate(0, 0.5, 0);
    disposableGeos.push(beamCoreGeo, beamGlowGeo);

    const beamCoreMat = makeBeamMat(0xf4f9ff, 1.6);
    const beamGlowMat = makeBeamMat(0x7fb2ff, 3.2);

    const beamGroup = new THREE.Group();
    beamGroup.position.y = tipY;
    beamGroup.visible = false;
    const beamCore = new THREE.Mesh(beamCoreGeo, beamCoreMat);
    const beamGlow = new THREE.Mesh(beamGlowGeo, beamGlowMat);
    beamCore.frustumCulled = false;
    beamGlow.frustumCulled = false;
    beamCore.renderOrder = 3;
    beamGlow.renderOrder = 2;
    beamGroup.add(beamGlow, beamCore);
    rootGroup.add(beamGroup);

    // Expanding ring of light that sweeps outward across the sand when the beam ignites
    const shockGeo = new THREE.CylinderGeometry(1, 1, 4.5, 96, 1, true);
    shockGeo.translate(0, -1.0, 0);
    disposableGeos.push(shockGeo);
    const shockMat = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
        side: THREE.DoubleSide,
        uniforms: {
            uIntensity: { value: 0 },
            uColor: { value: new THREE.Color(0x9cc6ff) }
        },
        vertexShader: /* glsl */ `
          varying float vY;
          varying float vCamDist;
          void main() {
            vY = uv.y;
            vec4 worldPos = modelMatrix * vec4(position, 1.0);
            vCamDist = distance(worldPos.xyz, cameraPosition);
            gl_Position = projectionMatrix * viewMatrix * worldPos;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform float uIntensity;
          uniform vec3 uColor;
          varying float vY;
          varying float vCamDist;
          void main() {
            // Strong where it hugs the ground, feathering away above it;
            // dissolves as it sweeps past the viewer so it never becomes a hard wall
            float nearFade = smoothstep(2.0, 14.0, vCamDist);
            float a = (1.0 - smoothstep(0.32, 1.0, vY)) * uIntensity * nearFade;
            gl_FragColor = vec4(uColor * a, a);
          }
        `
    });
    const shockMesh = new THREE.Mesh(shockGeo, shockMat);
    shockMesh.visible = false;
    shockMesh.frustumCulled = false;
    rootGroup.add(shockMesh);

    // Cold flare that lights the plinth, ruins, and the surrounding sand
    const flareLight = new THREE.PointLight(0xa8ccff, 0, 95, 1.35);
    flareLight.position.set(0, 3.2, 0);
    rootGroup.add(flareLight);
    const tipLight = new THREE.PointLight(0xdfeaff, 0, 40, 1.6);
    tipLight.position.set(0, tipY + 1.0, 0);
    rootGroup.add(tipLight);

    const seamBaseColor = new THREE.Color(0xf0f7ff);
    const microBaseColor = new THREE.Color(0x7eb8ff);
    const glyphBaseColor = new THREE.Color(0xc8e2ff);

    let activationBlend = 0;
    let interactionSurge = 0;

    return {
        group: rootGroup,
        interactionMeshes,
        colliders,

        triggerInteractionSurge() {
            // Brief luminous surge upon touching the monolith that smoothly settles into steady reflection glow
            interactionSurge = 1.0;
        },

        update(dt, elapsedTime, distanceToPlayer, isActivated, ascensionTime) {
            const safeDt = Math.min(dt, 0.1);
            const targetActivation = isActivated ? 1 : 0;
            activationBlend += (targetActivation - activationBlend) * (1 - Math.exp(-safeDt * 2.6));

            if (interactionSurge > 0.001) {
                interactionSurge *= Math.exp(-safeDt * 1.85);
            } else {
                interactionSurge = 0;
            }

            // Smooth distance interpolation: 0 at > 48m, rising smoothly to 1 at 8.2m interaction range
            const proximity = 1 - Math.min(1, Math.max(0, (distanceToPlayer - 8.2) / 40.0));
            const smoothProx = proximity * proximity * (3 - 2 * proximity);

            // Very calm, barely perceptible breathing during exploration; steady during reflection
            const calmPulse = 0.96 + 0.04 * Math.sin(elapsedTime * 1.25);

            // ~28% brighter baseline at distance so the inscriptions draw the eye from spawn,
            // intensifying smoothly on approach, peaking briefly on interaction, then holding steady
            const seamOpacity =
                (0.82 + smoothProx * 0.14 + activationBlend * 0.04 + interactionSurge * 0.18) * calmPulse;
            const microGlowOpacity =
                (0.24 + smoothProx * 0.18 + activationBlend * 0.10 + interactionSurge * 0.26) * calmPulse;
            const secondaryOpacity =
                (0.48 + smoothProx * 0.36 + activationBlend * 0.14 + interactionSurge * 0.22) * calmPulse;

            primarySeamMat.opacity = Math.min(1.0, seamOpacity);
            seamMicroGlowMat.opacity = Math.min(0.75, microGlowOpacity);
            secondaryGlyphMat.opacity = Math.min(1.0, secondaryOpacity);

            // --- Ascension choreography ---
            const asc = ascensionTime;
            if (asc < 0) {
                beamGroup.visible = false;
                shockMesh.visible = false;
                flareLight.intensity = 0;
                tipLight.intensity = 0;
                primarySeamMat.color.copy(seamBaseColor);
                seamMicroGlowMat.color.copy(microBaseColor);
                secondaryGlyphMat.color.copy(glyphBaseColor);
                return;
            }

            // Charge: engravings flood with light (HDR > 1 so bloom catches them)
            const charge = smoothRamp(asc, 0, ASCENSION.CHARGE_END);
            const ignite = asc >= ASCENSION.CHARGE_END
                ? Math.exp(-(asc - ASCENSION.CHARGE_END) * 1.4)
                : 0;
            const settled = smoothRamp(asc, ASCENSION.SPIN_END, ASCENSION.DURATION);
            const glyphBoost = 1 + charge * (2.4 - settled * 1.1) + ignite * 2.0;
            primarySeamMat.color.copy(seamBaseColor).multiplyScalar(glyphBoost);
            seamMicroGlowMat.color.copy(microBaseColor).multiplyScalar(1 + charge * 1.6 + ignite);
            secondaryGlyphMat.color.copy(glyphBaseColor).multiplyScalar(glyphBoost * 0.9);
            primarySeamMat.opacity = 1.0;
            secondaryGlyphMat.opacity = 1.0;
            seamMicroGlowMat.opacity = 0.75;

            // Beam rises from the tip toward the zenith
            const rise = ramp(asc, ASCENSION.CHARGE_END, ASCENSION.BEAM_RISE_END);
            const riseEased = 1 - Math.pow(1 - rise, 3);
            beamGroup.visible = asc >= ASCENSION.CHARGE_END;
            beamGroup.scale.y = Math.max(0.001, riseEased * BEAM_MAX_HEIGHT);
            const beamFlicker = 0.94 + 0.06 * Math.sin(elapsedTime * 23.0) * Math.sin(elapsedTime * 7.3);
            const beamFadeIn = smoothRamp(asc, ASCENSION.CHARGE_END, ASCENSION.CHARGE_END + 0.25);
            const beamStrength = (1.7 + ignite * 1.8 - settled * 0.55) * beamFlicker * beamFadeIn;
            beamCoreMat.uniforms.uIntensity.value = beamStrength;
            beamGlowMat.uniforms.uIntensity.value = beamStrength * 0.42;
            beamCoreMat.uniforms.uTime.value = elapsedTime;
            beamGlowMat.uniforms.uTime.value = elapsedTime;
            beamGlow.scale.x = beamGlow.scale.z = 1 + ignite * 0.9;

            // Shockwave sweeps outward over ~3.4s from ignition
            const shockT = ramp(asc, ASCENSION.CHARGE_END, ASCENSION.CHARGE_END + 3.4);
            shockMesh.visible = shockT > 0 && shockT < 1;
            if (shockMesh.visible) {
                const r = 4.2 + (1 - Math.pow(1 - shockT, 2.2)) * 120;
                shockMesh.scale.set(r, 1, r);
                shockMat.uniforms.uIntensity.value = Math.pow(1 - shockT, 1.6) * 0.75;
            }

            // Flare lights the sand: a breath in during charge, a burst on ignition, then a calm glow
            flareLight.intensity = charge * 70 + ignite * 220 + charge * (1 - ignite) * (110 - settled * 45);
            tipLight.intensity = (charge * 30 + ignite * 160) * (1 - settled * 0.4);
        },

        reset() {
            beamGroup.visible = false;
            shockMesh.visible = false;
            flareLight.intensity = 0;
            tipLight.intensity = 0;
            primarySeamMat.color.copy(seamBaseColor);
            seamMicroGlowMat.color.copy(microBaseColor);
            secondaryGlyphMat.color.copy(glyphBaseColor);
            activationBlend = 0;
            interactionSurge = 0;
            primarySeamMat.opacity = 0.82;
            seamMicroGlowMat.opacity = 0.24;
            secondaryGlyphMat.opacity = 0.48;
        },

        dispose() {
            lowerPlinthGeo.dispose();
            upperPlinthGeo.dispose();
            obeliskGeo.dispose();
            obeliskMat.dispose();
            plinthMat.dispose();
            primarySeamMat.dispose();
            seamMicroGlowMat.dispose();
            secondaryGlyphMat.dispose();
            beamCoreMat.dispose();
            beamGlowMat.dispose();
            shockMat.dispose();
            flareLight.dispose();
            tipLight.dispose();
            for (const g of disposableGeos) {
                g.dispose();
            }
        }
    };
}