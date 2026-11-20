import * as THREE from 'three';
import { ASCENSION, SkyGlyphSystem, smoothRamp } from './gameTypes';

/**
 * The sky's answer: a vast echo of the monolith's engraving (vertical seam,
 * concentric rings, horizontal bars) drawn stroke by stroke in starlight,
 * hanging above the beam once the heavens stop turning.
 */

type Vec2 = [number, number];

interface Stroke {
    points: Vec2[];
    orderStart: number;
    orderEnd: number;
    width: number;
}

interface GlyphNode {
    at: Vec2;
    order: number;
    size: number;
}

const GLYPH_DISTANCE = 560;
const GLYPH_ANGULAR_RADIUS = 0.2;

function arc(cx: number, cy: number, r: number, a0: number, a1: number, segs: number): Vec2[] {
    const pts: Vec2[] = [];
    for (let i = 0; i <= segs; i++) {
        const a = a0 + (a1 - a0) * (i / segs);
        pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
    return pts;
}

function buildFigure(): { strokes: Stroke[]; nodes: GlyphNode[] } {
    const strokes: Stroke[] = [];
    const nodes: GlyphNode[] = [];
    const top = Math.PI / 2;

    // 1. The seam: drawn upward, continuing the beam into the heavens
    strokes.push({ points: [[0, -1.32], [0, 1.32]], orderStart: 0.0, orderEnd: 0.2, width: 1.0 });
    nodes.push({ at: [0, -1.32], order: 0.0, size: 9 }, { at: [0, 1.32], order: 0.2, size: 12 });

    // 2. Rings echoing the engraving (both halves sweep from the top, meeting below)
    const rings: { y: number; r: number; o0: number; o1: number }[] = [
        { y: 0.48, r: 0.34, o0: 0.2, o1: 0.34 },
        { y: 0.48, r: 0.2, o0: 0.27, o1: 0.4 },
        { y: -0.1, r: 0.25, o0: 0.34, o1: 0.47 },
        { y: -0.68, r: 0.15, o0: 0.42, o1: 0.52 }
    ];
    for (const ring of rings) {
        strokes.push({ points: arc(0, ring.y, ring.r, top, top + Math.PI, 48), orderStart: ring.o0, orderEnd: ring.o1, width: 0.8 });
        strokes.push({ points: arc(0, ring.y, ring.r, top, top - Math.PI, 48), orderStart: ring.o0, orderEnd: ring.o1, width: 0.8 });
        nodes.push({ at: [0, ring.y + ring.r], order: ring.o0, size: 8 });
    }

    // 3. Horizontal bars, drawn outward from the seam
    const bars: { y: number; w: number; o0: number; o1: number }[] = [
        { y: -1.02, w: 0.52, o0: 0.5, o1: 0.58 },
        { y: -0.4, w: 0.44, o0: 0.53, o1: 0.61 },
        { y: 0.12, w: 0.36, o0: 0.56, o1: 0.64 },
        { y: 0.9, w: 0.28, o0: 0.59, o1: 0.67 }
    ];
    for (const bar of bars) {
        strokes.push({ points: [[0, bar.y], [-bar.w, bar.y]], orderStart: bar.o0, orderEnd: bar.o1, width: 0.7 });
        strokes.push({ points: [[0, bar.y], [bar.w, bar.y]], orderStart: bar.o0, orderEnd: bar.o1, width: 0.7 });
        nodes.push({ at: [-bar.w, bar.y], order: bar.o1, size: 7 }, { at: [bar.w, bar.y], order: bar.o1, size: 7 });
    }

    // 4. The great halo closes around everything, last and slowest
    strokes.push({ points: arc(0, 0, 1.0, top, top + Math.PI, 160), orderStart: 0.64, orderEnd: 0.92, width: 1.0 });
    strokes.push({ points: arc(0, 0, 1.0, top, top - Math.PI, 160), orderStart: 0.64, orderEnd: 0.92, width: 1.0 });
    for (let k = 0; k <= 4; k++) {
        const t = k / 4;
        const order = 0.64 + t * 0.28;
        const a = top + Math.PI * t;
        const size = k === 0 || k === 4 ? 13 : 8;
        nodes.push({ at: [Math.cos(a), Math.sin(a)], order, size });
        if (k !== 0 && k !== 4) {
            nodes.push({ at: [-Math.cos(a), Math.sin(a)], order, size });
        }
    }

    // 5. A faint outer orbit
    strokes.push({ points: arc(0, 0, 1.13, top, top + Math.PI, 160), orderStart: 0.8, orderEnd: 1.0, width: 0.45 });
    strokes.push({ points: arc(0, 0, 1.13, top, top - Math.PI, 160), orderStart: 0.8, orderEnd: 1.0, width: 0.45 });

    return { strokes, nodes };
}

export function createSkyGlyph(): SkyGlyphSystem {
    const group = new THREE.Group();
    group.name = 'SkyGlyph';
    group.visible = false;

    const radius = GLYPH_DISTANCE * Math.tan(GLYPH_ANGULAR_RADIUS);
    const baseWidth = 6.5;
    const { strokes, nodes } = buildFigure();

    // --- Ribbon geometry for strokes ---
    const positions: number[] = [];
    const orders: number[] = [];
    const edges: number[] = [];
    const widths: number[] = [];
    const indices: number[] = [];

    for (const stroke of strokes) {
        const pts = stroke.points;
        // Cumulative length so the stroke reveals at constant speed
        const lengths = [0];
        for (let i = 1; i < pts.length; i++) {
            lengths.push(lengths[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
        }
        const total = lengths[lengths.length - 1] || 1;
        const halfW = (baseWidth * stroke.width) / 2;

        for (let i = 0; i < pts.length - 1; i++) {
            const ax = pts[i][0] * radius;
            const ay = pts[i][1] * radius;
            const bx = pts[i + 1][0] * radius;
            const by = pts[i + 1][1] * radius;
            const len = Math.hypot(bx - ax, by - ay) || 1;
            const nx = (-(by - ay) / len) * halfW;
            const ny = ((bx - ax) / len) * halfW;
            // Extend slightly along the segment to hide seams at joints
            const ex = ((bx - ax) / len) * halfW * 0.35;
            const ey = ((by - ay) / len) * halfW * 0.35;

            const oa = stroke.orderStart + (stroke.orderEnd - stroke.orderStart) * (lengths[i] / total);
            const ob = stroke.orderStart + (stroke.orderEnd - stroke.orderStart) * (lengths[i + 1] / total);

            const base = positions.length / 3;
            positions.push(
                ax - ex + nx, ay - ey + ny, 0,
                ax - ex - nx, ay - ey - ny, 0,
                bx + ex + nx, by + ey + ny, 0,
                bx + ex - nx, by + ey - ny, 0
            );
            orders.push(oa, oa, ob, ob);
            edges.push(1, -1, 1, -1);
            widths.push(stroke.width, stroke.width, stroke.width, stroke.width);
            indices.push(base, base + 1, base + 2, base + 2, base + 1, base + 3);
        }
    }

    const ribbonGeo = new THREE.BufferGeometry();
    ribbonGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    ribbonGeo.setAttribute('aOrder', new THREE.Float32BufferAttribute(orders, 1));
    ribbonGeo.setAttribute('aEdge', new THREE.Float32BufferAttribute(edges, 1));
    ribbonGeo.setAttribute('aWeight', new THREE.Float32BufferAttribute(widths, 1));
    ribbonGeo.setIndex(indices);

    const ribbonMat = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
        side: THREE.DoubleSide,
        uniforms: {
            uProgress: { value: 0 },
            uIntensity: { value: 0 },
            uHead: { value: 1 },
            uTime: { value: 0 }
        },
        vertexShader: /* glsl */ `
          attribute float aOrder;
          attribute float aEdge;
          attribute float aWeight;
          varying float vOrder;
          varying float vEdge;
          varying float vWeight;
          void main() {
            vOrder = aOrder;
            vEdge = aEdge;
            vWeight = aWeight;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform float uProgress;
          uniform float uIntensity;
          uniform float uHead;
          uniform float uTime;
          varying float vOrder;
          varying float vEdge;
          varying float vWeight;
          void main() {
            float behind = uProgress - vOrder;
            if (behind < 0.0) discard;
            float head = exp(-behind * behind * 2600.0) * uHead;
            float profile = exp(-vEdge * vEdge * 22.0) + 0.24 * exp(-vEdge * vEdge * 2.6);
            float shimmer = 0.86 + 0.14 * sin(uTime * 1.6 + vOrder * 38.0);
            float a = profile * (uIntensity * shimmer * (0.55 + 0.45 * vWeight) + head * 3.2);
            vec3 col = mix(vec3(0.62, 0.78, 1.0), vec3(1.0, 0.98, 0.94), clamp(head + 0.25, 0.0, 1.0));
            gl_FragColor = vec4(col * a, a);
          }
        `
    });

    const ribbon = new THREE.Mesh(ribbonGeo, ribbonMat);
    ribbon.frustumCulled = false;
    ribbon.renderOrder = 5;
    group.add(ribbon);

    // --- Star nodes at the figure's joints ---
    const nodePos = new Float32Array(nodes.length * 3);
    const nodeOrder = new Float32Array(nodes.length);
    const nodeSize = new Float32Array(nodes.length);
    nodes.forEach((n, i) => {
        nodePos[i * 3] = n.at[0] * radius;
        nodePos[i * 3 + 1] = n.at[1] * radius;
        nodePos[i * 3 + 2] = 0.5;
        nodeOrder[i] = n.order;
        nodeSize[i] = n.size;
    });
    const nodeGeo = new THREE.BufferGeometry();
    nodeGeo.setAttribute('position', new THREE.BufferAttribute(nodePos, 3));
    nodeGeo.setAttribute('aOrder', new THREE.BufferAttribute(nodeOrder, 1));
    nodeGeo.setAttribute('aSize', new THREE.BufferAttribute(nodeSize, 1));

    const nodeMat = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
        uniforms: {
            uProgress: { value: 0 },
            uIntensity: { value: 0 },
            uTime: { value: 0 },
            uPixelRatio: { value: 1 }
        },
        vertexShader: /* glsl */ `
          attribute float aOrder;
          attribute float aSize;
          uniform float uProgress;
          uniform float uTime;
          uniform float uPixelRatio;
          varying float vAlpha;
          varying float vFlare;
          void main() {
            float behind = uProgress - aOrder;
            float lit = smoothstep(0.0, 0.015, behind);
            vFlare = lit * exp(-max(behind, 0.0) * 22.0);
            vAlpha = lit * (0.85 + 0.15 * sin(uTime * 2.1 + aOrder * 50.0));
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            gl_PointSize = aSize * uPixelRatio * (1.6 + vFlare * 2.6) * lit;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform float uIntensity;
          varying float vAlpha;
          varying float vFlare;
          void main() {
            vec2 uv = (gl_PointCoord - 0.5) * 2.0;
            float d2 = dot(uv, uv);
            if (d2 > 1.0) discard;
            float core = exp(-d2 * 14.0);
            float halo = 0.35 * exp(-d2 * 3.0);
            // Four-point diffraction spikes
            float spikes = exp(-abs(uv.x) * 26.0) * exp(-abs(uv.y) * 2.2)
                         + exp(-abs(uv.y) * 26.0) * exp(-abs(uv.x) * 2.2);
            float a = (core + halo + spikes * 0.55) * vAlpha * (uIntensity * 1.4 + vFlare * 3.0);
            gl_FragColor = vec4(vec3(0.9, 0.95, 1.0) * a, a);
          }
        `
    });
    const nodePoints = new THREE.Points(nodeGeo, nodeMat);
    nodePoints.frustumCulled = false;
    nodePoints.renderOrder = 6;
    group.add(nodePoints);

    const tmpDir = new THREE.Vector3();
    const tmpUp = new THREE.Vector3();
    const tmpRight = new THREE.Vector3();
    const tmpNormal = new THREE.Vector3();
    const worldUp = new THREE.Vector3(0, 1, 0);
    const basis = new THREE.Matrix4();

    return {
        group,

        place(cameraPos, yaw) {
            const pitch = ASCENSION.GLYPH_PITCH;
            // Same convention as the camera: yaw about Y, forward is -Z
            tmpDir.set(
                -Math.sin(yaw) * Math.cos(pitch),
                Math.sin(pitch),
                -Math.cos(yaw) * Math.cos(pitch)
            ).normalize();
            tmpUp.copy(worldUp).addScaledVector(tmpDir, -tmpDir.dot(worldUp)).normalize();
            tmpNormal.copy(tmpDir).negate();
            tmpRight.crossVectors(tmpUp, tmpNormal).normalize();
            basis.makeBasis(tmpRight, tmpUp, tmpNormal);
            group.quaternion.setFromRotationMatrix(basis);
            group.position.copy(cameraPos).addScaledVector(tmpDir, GLYPH_DISTANCE);
        },

        update(_dt, elapsedTime, ascensionTime, pixelRatio) {
            if (ascensionTime < ASCENSION.GLYPH_START) {
                group.visible = false;
                return;
            }
            group.visible = true;

            const progress = smoothRamp(ascensionTime, ASCENSION.GLYPH_START, ASCENSION.GLYPH_END);
            // Bright while being drawn, then a calm, breathing presence during reflection
            const drawn = smoothRamp(ascensionTime, ASCENSION.GLYPH_END, ASCENSION.GLYPH_END + 2.5);
            const breathing = 0.92 + 0.08 * Math.sin(elapsedTime * 0.9);
            const intensity = (0.95 - drawn * 0.3) * breathing;

            ribbonMat.uniforms.uProgress.value = progress * 1.002;
            ribbonMat.uniforms.uIntensity.value = intensity;
            ribbonMat.uniforms.uHead.value = 1 - drawn;
            ribbonMat.uniforms.uTime.value = elapsedTime;

            nodeMat.uniforms.uProgress.value = progress * 1.002;
            nodeMat.uniforms.uIntensity.value = intensity;
            nodeMat.uniforms.uTime.value = elapsedTime;
            nodeMat.uniforms.uPixelRatio.value = pixelRatio;
        },

        reset() {
            group.visible = false;
            ribbonMat.uniforms.uProgress.value = 0;
            nodeMat.uniforms.uProgress.value = 0;
        },

        dispose() {
            ribbonGeo.dispose();
            ribbonMat.dispose();
            nodeGeo.dispose();
            nodeMat.dispose();
        }
    };
}
