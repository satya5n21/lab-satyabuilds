import * as THREE from 'three';
import { QualityLevel, StarfieldSystem, WORLD_CONFIG } from './gameTypes';

function createSeededRandom(seed: number): () => number {
    let s = seed >>> 0;
    return () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 4294967296;
    };
}

export function createStarfield(initialQuality: QualityLevel): StarfieldSystem {
    const rootGroup = new THREE.Group();
    rootGroup.name = 'StarfieldRoot';

    // 1. HORIZON ATMOSPHERE DOME (Depth-tested at far plane 0.9998 * w so opaque terrain/rocks occlude it)
    const atmosphereGeo = new THREE.SphereGeometry(820, 48, 32);
    const atmosphereMat = new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthTest: true,
        depthWrite: false,
        depthFunc: THREE.LessEqualDepth,
        fog: false,
        uniforms: {
            uZenithColor: { value: new THREE.Color(0x02040a) },
            uMidSkyColor: { value: new THREE.Color(0x060b1a) },
            uHorizonColor: { value: new THREE.Color(0x0d172e) },
            uGroundColor: { value: new THREE.Color(0x03050a) }
        },
        vertexShader: /* glsl */ `
      varying vec3 vWorldDir;
      void main() {
        vWorldDir = normalize(position);
        vec4 clipPos = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        clipPos.z = clipPos.w * 0.9998;
        gl_Position = clipPos;
      }
    `,
        fragmentShader: /* glsl */ `
      uniform vec3 uZenithColor;
      uniform vec3 uMidSkyColor;
      uniform vec3 uHorizonColor;
      uniform vec3 uGroundColor;
      varying vec3 vWorldDir;

      void main() {
        vec3 dir = normalize(vWorldDir);
        float y = dir.y;

        float up = clamp(y, 0.0, 1.0);
        vec3 sky = mix(uHorizonColor, uMidSkyColor, smoothstep(0.0, 0.24, up));
        sky = mix(sky, uZenithColor, smoothstep(0.18, 0.82, up));

        float horizonBand = exp(-abs(y) * 14.0);
        sky += vec3(0.03, 0.05, 0.11) * horizonBand;

        vec3 finalColor = mix(uGroundColor, sky, smoothstep(-0.06, 0.01, y));
        gl_FragColor = vec4(finalColor, 1.0);
      }
    `
    });
    const atmosphereMesh = new THREE.Mesh(atmosphereGeo, atmosphereMat);
    atmosphereMesh.frustumCulled = false;
    rootGroup.add(atmosphereMesh);

    // 2. CELESTIAL RIG (Rotates coherently opposite to player locomotion)
    const celestialRig = new THREE.Group();
    celestialRig.name = 'CelestialRig';
    rootGroup.add(celestialRig);

    const galacticNormal = new THREE.Vector3(0.56, 0.48, -0.67).normalize();
    const galacticUp = new THREE.Vector3(0, 1, 0);
    const galacticRight = new THREE.Vector3().crossVectors(galacticUp, galacticNormal).normalize();
    const galacticForward = new THREE.Vector3().crossVectors(galacticNormal, galacticRight).normalize();
    const galacticBasis = new THREE.Matrix3().set(
        galacticRight.x, galacticForward.x, galacticNormal.x,
        galacticRight.y, galacticForward.y, galacticNormal.y,
        galacticRight.z, galacticForward.z, galacticNormal.z
    );

    // 2A. MILKY WAY NEBULA DOME
    const milkyWayGeo = new THREE.SphereGeometry(800, 64, 48);
    const milkyWayMat = new THREE.ShaderMaterial({
        side: THREE.BackSide,
        transparent: true,
        depthTest: true,
        depthWrite: false,
        depthFunc: THREE.LessEqualDepth,
        fog: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
            uGalacticNormal: { value: galacticNormal },
            uGalacticRight: { value: galacticRight },
            uGalacticForward: { value: galacticForward }
        },
        vertexShader: /* glsl */ `
      varying vec3 vLocalDir;
      varying vec3 vWorldDir;
      void main() {
        vLocalDir = normalize(position);
        vWorldDir = normalize((modelMatrix * vec4(position, 0.0)).xyz);
        vec4 clipPos = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        clipPos.z = clipPos.w * 0.9996;
        gl_Position = clipPos;
      }
    `,
        fragmentShader: /* glsl */ `
      uniform vec3 uGalacticNormal;
      uniform vec3 uGalacticRight;
      uniform vec3 uGalacticForward;
      varying vec3 vLocalDir;
      varying vec3 vWorldDir;

      float hash(vec3 p) {
        p = fract(p * 0.3183099 + 0.1);
        p *= 17.0;
        return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
      }

      float noise(vec3 x) {
        vec3 i = floor(x);
        vec3 f = fract(x);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
              mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
          mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
              mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y),
          f.z
        );
      }

      float fbm(vec3 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 4; i++) {
          v += a * noise(p);
          p = p * 2.05 + vec3(11.3, 7.1, 17.9);
          a *= 0.5;
        }
        return v;
      }

      void main() {
        float horizonMask = smoothstep(0.005, 0.16, vWorldDir.y);
        if (horizonMask <= 0.001) discard;

        vec3 d = normalize(vLocalDir);
        float galLat = dot(d, uGalacticNormal);
        float galY = dot(d, uGalacticForward);

        float outerBand = exp(-galLat * galLat * 12.0);
        float innerCore = exp(-galLat * galLat * 48.0);
        float coreLongitude = smoothstep(-0.75, 0.80, galY);

        float n1 = fbm(d * 6.0);
        float n2 = fbm(d * 14.5 + vec3(n1 * 1.9));

        float riftMask = smoothstep(0.32, 0.64, n2) * exp(-galLat * galLat * 115.0);

        float density = outerBand * (0.35 + 0.90 * n1) * (0.50 + 0.60 * coreLongitude);
        density += innerCore * n1 * 0.55 * coreLongitude;
        density *= (1.0 - 0.76 * riftMask);

        vec3 deepBlue = vec3(0.08, 0.11, 0.26);
        vec3 blueViolet = vec3(0.20, 0.18, 0.39);
        vec3 softLavender = vec3(0.32, 0.28, 0.52);

        vec3 col = mix(deepBlue, blueViolet, smoothstep(0.12, 0.48, density));
        col = mix(col, softLavender, innerCore * coreLongitude * (1.0 - riftMask) * 0.75);

        float alpha = clamp(density * 0.58 * horizonMask, 0.0, 0.52);
        gl_FragColor = vec4(col * alpha, 1.0);
      }
    `
    });
    const milkyWayMesh = new THREE.Mesh(milkyWayGeo, milkyWayMat);
    milkyWayMesh.frustumCulled = false;
    celestialRig.add(milkyWayMesh);

    // 2B. FULL-SPHERE STARFIELD (14,500 stars, depth-tested against opaque world geometry)
    const TOTAL_STARS_HIGH = 14500;
    const TOTAL_STARS_LOW = 8500;
    const positions = new Float32Array(TOTAL_STARS_HIGH * 3);
    const colors = new Float32Array(TOTAL_STARS_HIGH * 3);
    const sizes = new Float32Array(TOTAL_STARS_HIGH);
    const phases = new Float32Array(TOTAL_STARS_HIGH);

    const rand = createSeededRandom(20261025);
    const starPalette = [
        new THREE.Color(0xd8e6ff),
        new THREE.Color(0xf4f6ff),
        new THREE.Color(0xdccfff),
        new THREE.Color(0xfff0dd),
        new THREE.Color(0xb8d0ff),
        new THREE.Color(0xffdcb5)
    ];

    const tempVec = new THREE.Vector3();
    const radius = 780;

    for (let i = 0; i < TOTAL_STARS_HIGH; i++) {
        const isAnchorStar = i < 240;
        const isMilkyWayStar = !isAnchorStar && i < 9800;

        if (isMilkyWayStar) {
            const lon = rand() * Math.PI * 2;
            const u = (rand() - 0.5) * 2;
            const lat = u * Math.abs(u) * 0.48 + (rand() - 0.5) * 0.13;
            const cosLat = Math.cos(lat);
            tempVec.set(
                Math.cos(lon) * cosLat,
                Math.sin(lon) * cosLat,
                Math.sin(lat)
            );
            tempVec.applyMatrix3(galacticBasis).normalize();
        } else {
            const u = rand() * 2 - 1;
            const theta = rand() * Math.PI * 2;
            const r = Math.sqrt(Math.max(0, 1 - u * u));
            tempVec.set(r * Math.cos(theta), u, r * Math.sin(theta)).normalize();
        }

        positions[i * 3] = tempVec.x * radius;
        positions[i * 3 + 1] = tempVec.y * radius;
        positions[i * 3 + 2] = tempVec.z * radius;

        const baseColor = starPalette[Math.floor(rand() * starPalette.length)];
        let brightness = 0.52 + rand() * 0.48;

        if (isAnchorStar) {
            sizes[i] = 2.8 + rand() * 2.1;
            brightness = 0.95 + rand() * 0.35;
        } else if (isMilkyWayStar) {
            const rSize = rand();
            sizes[i] = rSize < 0.85 ? 1.05 + rand() * 1.05 : 2.0 + rand() * 1.1;
            brightness = 0.42 + rand() * 0.52;
        } else {
            const rSize = rand();
            sizes[i] = rSize < 0.80 ? 1.15 + rand() * 1.1 : 2.1 + rand() * 1.2;
            brightness = 0.48 + rand() * 0.48;
        }

        colors[i * 3] = Math.min(1.0, baseColor.r * brightness);
        colors[i * 3 + 1] = Math.min(1.0, baseColor.g * brightness);
        colors[i * 3 + 2] = Math.min(1.0, baseColor.b * brightness);
        phases[i] = rand() * Math.PI * 2;
    }

    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    starGeo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
    starGeo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    starGeo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
    starGeo.setDrawRange(0, initialQuality === 'high' ? TOTAL_STARS_HIGH : TOTAL_STARS_LOW);

    const starMat = new THREE.ShaderMaterial({
        transparent: true,
        depthTest: true,
        depthWrite: false,
        depthFunc: THREE.LessEqualDepth,
        fog: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
            uTime: { value: 0 },
            uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) }
        },
        vertexShader: /* glsl */ `
      attribute vec3 aColor;
      attribute float aSize;
      attribute float aPhase;

      uniform float uTime;
      uniform float uPixelRatio;

      varying vec3 vColor;
      varying float vHorizonFade;

      void main() {
        vec4 worldVec = modelMatrix * vec4(position, 0.0);
        vec3 worldDir = normalize(worldVec.xyz);

        vHorizonFade = smoothstep(0.012, 0.14, worldDir.y);

        float twinkle = 0.86 + 0.14 * sin(uTime * 1.7 + aPhase * 6.2831);
        vColor = aColor * twinkle;

        vec4 clipPos = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        clipPos.z = clipPos.w * 0.9994;
        gl_Position = clipPos;

        float rawSize = aSize * uPixelRatio * (0.94 + 0.08 * sin(uTime * 1.2 + aPhase));
        gl_PointSize = clamp(rawSize, 1.15, 6.2 * uPixelRatio);
      }
    `,
        fragmentShader: /* glsl */ `
      varying vec3 vColor;
      varying float vHorizonFade;

      void main() {
        if (vHorizonFade <= 0.002) discard;

        vec2 uv = (gl_PointCoord - vec2(0.5)) * 2.0;
        float distSq = dot(uv, uv);
        if (distSq > 1.0) discard;

        float dist = sqrt(distSq);
        float core = exp(-distSq * 5.6);
        float halo = 0.32 * (1.0 - smoothstep(0.0, 1.0, dist));
        float intensity = (core + halo) * vHorizonFade;

        gl_FragColor = vec4(vColor * intensity * 1.25, intensity);
      }
    `
    });

    const starPoints = new THREE.Points(starGeo, starMat);
    starPoints.frustumCulled = false;
    celestialRig.add(starPoints);

    // 2C. RARE, DEPTH-OCCLUDED SHOOTING STAR SYSTEM (Head point + 8-segment fading trail)
    // Average interval: 30-60 seconds during exploration, initial delay 22-42 seconds.
    const TRAIL_SEGMENTS = 8;
    const meteorGeo = new THREE.BufferGeometry();
    const meteorPositions = new Float32Array(TRAIL_SEGMENTS * 3);
    const meteorAlphas = new Float32Array(TRAIL_SEGMENTS);
    for (let i = 0; i < TRAIL_SEGMENTS; i++) {
        const t = 1 - i / (TRAIL_SEGMENTS - 1);
        meteorAlphas[i] = Math.pow(t, 1.7);
    }

    const meteorPosAttr = new THREE.BufferAttribute(meteorPositions, 3);
    meteorPosAttr.setUsage(THREE.DynamicDrawUsage);
    meteorGeo.setAttribute('position', meteorPosAttr);
    meteorGeo.setAttribute('aTrailAlpha', new THREE.BufferAttribute(meteorAlphas, 1));

    const meteorMat = new THREE.ShaderMaterial({
        transparent: true,
        depthTest: true,
        depthWrite: false,
        depthFunc: THREE.LessEqualDepth,
        fog: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
            uOpacity: { value: 0 },
            uColor: { value: new THREE.Color(0xe3efff) }
        },
        vertexShader: /* glsl */ `
      attribute float aTrailAlpha;
      varying float vTrailAlpha;
      varying float vHorizonMask;

      void main() {
        vTrailAlpha = aTrailAlpha;
        vec3 worldDir = normalize((modelMatrix * vec4(position, 0.0)).xyz);
        vHorizonMask = smoothstep(0.04, 0.16, worldDir.y);

        vec4 clipPos = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        // Depth 0.9993 * w keeps shooting stars strictly behind all opaque rocks, dunes, and monolith
        clipPos.z = clipPos.w * 0.9993;
        gl_Position = clipPos;
      }
    `,
        fragmentShader: /* glsl */ `
      uniform float uOpacity;
      uniform vec3 uColor;
      varying float vTrailAlpha;
      varying float vHorizonMask;

      void main() {
        float a = vTrailAlpha * uOpacity * vHorizonMask;
        if (a <= 0.002) discard;
        gl_FragColor = vec4(uColor * a, a);
      }
    `
    });

    const meteorLine = new THREE.Line(meteorGeo, meteorMat);
    meteorLine.frustumCulled = false;
    meteorLine.visible = false;
    celestialRig.add(meteorLine);

    // Brief bright head point on the shooting star
    const meteorHeadGeo = new THREE.BufferGeometry();
    const meteorHeadPos = new Float32Array(3);
    const meteorHeadPosAttr = new THREE.BufferAttribute(meteorHeadPos, 3);
    meteorHeadPosAttr.setUsage(THREE.DynamicDrawUsage);
    meteorHeadGeo.setAttribute('position', meteorHeadPosAttr);

    const meteorHeadMat = new THREE.ShaderMaterial({
        transparent: true,
        depthTest: true,
        depthWrite: false,
        depthFunc: THREE.LessEqualDepth,
        fog: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
            uOpacity: { value: 0 },
            uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) }
        },
        vertexShader: /* glsl */ `
      uniform float uPixelRatio;
      varying float vHorizonMask;
      void main() {
        vec3 worldDir = normalize((modelMatrix * vec4(position, 0.0)).xyz);
        vHorizonMask = smoothstep(0.04, 0.16, worldDir.y);
        vec4 clipPos = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        clipPos.z = clipPos.w * 0.9993;
        gl_Position = clipPos;
        gl_PointSize = 3.8 * uPixelRatio;
      }
    `,
        fragmentShader: /* glsl */ `
      uniform float uOpacity;
      varying float vHorizonMask;
      void main() {
        vec2 uv = (gl_PointCoord - vec2(0.5)) * 2.0;
        float distSq = dot(uv, uv);
        if (distSq > 1.0) discard;
        float falloff = exp(-distSq * 4.5) * uOpacity * vHorizonMask;
        gl_FragColor = vec4(vec3(0.92, 0.96, 1.0) * falloff, falloff);
      }
    `
    });

    const meteorHeadPoint = new THREE.Points(meteorHeadGeo, meteorHeadMat);
    meteorHeadPoint.frustumCulled = false;
    meteorHeadPoint.visible = false;
    celestialRig.add(meteorHeadPoint);

    const getNextMeteorInterval = (isInitial: boolean): number => {
        return isInitial ? 22 + Math.random() * 20 : 30 + Math.random() * 30;
    };

    let meteorTimer = getNextMeteorInterval(true);
    let meteorActive = false;
    let meteorAge = 0;
    let meteorDuration = 0.85;
    let meteorPeakBrightness = 0.72;
    const meteorStart = new THREE.Vector3();
    const meteorVelocity = new THREE.Vector3();

    // Movement-driven celestial counter-drift state
    let accumPitch = 0;
    let accumRoll = 0;
    let accumYaw = 0;
    let smoothedVelX = 0;
    let smoothedVelZ = 0;

    return {
        group: rootGroup,

        update(dt, elapsedTime, playerPos, resolvedDx, resolvedDz, pixelRatio, allowShootingStars) {
            rootGroup.position.copy(playerPos);

            starMat.uniforms.uTime.value = elapsedTime;
            starMat.uniforms.uPixelRatio.value = pixelRatio;
            meteorHeadMat.uniforms.uPixelRatio.value = pixelRatio;

            const safeDt = Math.max(dt, 0.0001);
            const instVelX = resolvedDx / safeDt;
            const instVelZ = resolvedDz / safeDt;
            const smoothFactor = 1 - Math.exp(-safeDt * 8.5);
            smoothedVelX += (instVelX - smoothedVelX) * smoothFactor;
            smoothedVelZ += (instVelZ - smoothedVelZ) * smoothFactor;

            const driftScale = WORLD_CONFIG.STAR_DRIFT_RAD_PER_UNIT;
            accumPitch += -smoothedVelZ * safeDt * driftScale;
            accumRoll += smoothedVelX * safeDt * (driftScale * 0.85);
            accumYaw += -smoothedVelX * safeDt * (driftScale * 0.45);

            const siderealYaw = elapsedTime * 0.0006;
            const velocityLagPitch = -smoothedVelZ * 0.0042;
            const velocityLagRoll = smoothedVelX * 0.0035;

            celestialRig.rotation.order = 'YXZ';
            celestialRig.rotation.x = accumPitch + velocityLagPitch;
            celestialRig.rotation.z = accumRoll + velocityLagRoll;
            celestialRig.rotation.y = accumYaw + siderealYaw;

            // Suspend active shooting stars if entering monolith reflection so quote is never distracted
            if (!allowShootingStars) {
                if (meteorActive) {
                    meteorActive = false;
                    meteorLine.visible = false;
                    meteorHeadPoint.visible = false;
                    meteorMat.uniforms.uOpacity.value = 0;
                    meteorHeadMat.uniforms.uOpacity.value = 0;
                }
                return;
            }

            if (!meteorActive) {
                meteorTimer -= safeDt;
                if (meteorTimer <= 0) {
                    meteorActive = true;
                    meteorAge = 0;
                    meteorDuration = 0.72 + Math.random() * 0.36;
                    meteorPeakBrightness = 0.58 + Math.random() * 0.24;

                    // Spawn in upper celestial hemisphere (well above the monolith silhouette)
                    const az = Math.random() * Math.PI * 2;
                    const el = 0.36 + Math.random() * 0.68;
                    const r = 740;
                    meteorStart.set(
                        Math.cos(az) * Math.cos(el) * r,
                        Math.sin(el) * r,
                        Math.sin(az) * Math.cos(el) * r
                    );

                    const tangent = new THREE.Vector3(
                        -Math.sin(az) + (Math.random() - 0.5) * 0.4,
                        -0.18 - Math.random() * 0.22,
                        Math.cos(az) + (Math.random() - 0.5) * 0.4
                    ).normalize();

                    meteorVelocity.copy(tangent).multiplyScalar(250 + Math.random() * 75);
                    meteorLine.visible = true;
                    meteorHeadPoint.visible = true;
                }
            } else {
                meteorAge += safeDt;
                const t = meteorAge / meteorDuration;
                if (t >= 1) {
                    meteorActive = false;
                    meteorLine.visible = false;
                    meteorHeadPoint.visible = false;
                    meteorMat.uniforms.uOpacity.value = 0;
                    meteorHeadMat.uniforms.uOpacity.value = 0;
                    meteorTimer = getNextMeteorInterval(false);
                } else {
                    const trailTimeSpan = 0.17;
                    for (let i = 0; i < TRAIL_SEGMENTS; i++) {
                        const segTime = Math.max(0, meteorAge - (i / (TRAIL_SEGMENTS - 1)) * trailTimeSpan);
                        const sx = meteorStart.x + meteorVelocity.x * segTime;
                        const sy = meteorStart.y + meteorVelocity.y * segTime;
                        const sz = meteorStart.z + meteorVelocity.z * segTime;
                        meteorPosAttr.setXYZ(i, sx, sy, sz);
                        if (i === 0) {
                            meteorHeadPosAttr.setXYZ(0, sx, sy, sz);
                        }
                    }
                    meteorPosAttr.needsUpdate = true;
                    meteorHeadPosAttr.needsUpdate = true;

                    // Smooth fade in and graceful tail fade out
                    const envelope = Math.sin(t * Math.PI) * (1 - t * 0.25);
                    const currentOpacity = envelope * meteorPeakBrightness;
                    meteorMat.uniforms.uOpacity.value = currentOpacity;
                    meteorHeadMat.uniforms.uOpacity.value = currentOpacity;
                }
            }
        },

        setQuality(quality) {
            starGeo.setDrawRange(0, quality === 'high' ? TOTAL_STARS_HIGH : TOTAL_STARS_LOW);
        },

        reset(spawnPos) {
            rootGroup.position.copy(spawnPos);
            accumPitch = 0;
            accumRoll = 0;
            accumYaw = 0;
            smoothedVelX = 0;
            smoothedVelZ = 0;
            celestialRig.rotation.set(0, 0, 0);
            meteorActive = false;
            meteorLine.visible = false;
            meteorHeadPoint.visible = false;
            meteorMat.uniforms.uOpacity.value = 0;
            meteorHeadMat.uniforms.uOpacity.value = 0;
            meteorTimer = getNextMeteorInterval(true);
        },

        dispose() {
            atmosphereGeo.dispose();
            atmosphereMat.dispose();
            milkyWayGeo.dispose();
            milkyWayMat.dispose();
            starGeo.dispose();
            starMat.dispose();
            meteorGeo.dispose();
            meteorMat.dispose();
            meteorHeadGeo.dispose();
            meteorHeadMat.dispose();
        }
    };
}