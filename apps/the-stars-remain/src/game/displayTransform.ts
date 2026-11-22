import * as THREE from 'three';

/**
 * Display-space rendering for the post-processing pipeline.
 *
 * The game's look was authored for direct-to-canvas rendering, where:
 *  - built-in materials (terrain, rocks, monolith) are ACES tone-mapped and
 *    sRGB-encoded inside their own shaders, with an sRGB fog colour mixed afterwards;
 *  - custom sky ShaderMaterials (atmosphere, Milky Way, stars, meteors) write
 *    their colours straight to the screen with no conversion.
 *
 * A standard OutputPass converts *every* pixel, which brightens the sky and
 * flattens the dune silhouettes into black cut-outs. Instead, we keep the
 * composer in display space: built-in materials perform their own tone mapping
 * and sRGB encoding (exactly as when rendering to the canvas), custom shaders
 * stay untouched, and the final pass is a plain copy.
 */

/** Shared exposure uniform (mirrors renderer.toneMappingExposure). */
export const displayExposure = { value: 1.06 };

const DISPLAY_FUNCTIONS = /* glsl */ `
uniform float uDisplayExposure;

vec3 displayRRTAndODTFit( vec3 v ) {
    vec3 a = v * ( v + 0.0245786 ) - 0.000090537;
    vec3 b = v * ( 0.983729 * v + 0.4329510 ) + 0.238081;
    return a / b;
}

// Identical to three.js ACESFilmicToneMapping, driven by uDisplayExposure
vec3 displayACES( vec3 color ) {
    const mat3 inputMat = mat3(
        vec3( 0.59719, 0.07600, 0.02840 ),
        vec3( 0.35458, 0.90834, 0.13383 ),
        vec3( 0.04823, 0.01566, 0.83777 )
    );
    const mat3 outputMat = mat3(
        vec3(  1.60475, -0.10208, -0.00327 ),
        vec3( -0.53108,  1.10813, -0.07276 ),
        vec3( -0.07367, -0.00605,  1.07602 )
    );
    color *= uDisplayExposure / 0.6;
    color = inputMat * color;
    color = displayRRTAndODTFit( color );
    color = outputMat * color;
    return clamp( color, 0.0, 1.0 );
}

vec4 displaySRGB( vec4 value ) {
    return vec4( mix(
        pow( value.rgb, vec3( 0.41666 ) ) * 1.055 - vec3( 0.055 ),
        value.rgb * 12.92,
        vec3( lessThanEqual( value.rgb, vec3( 0.0031308 ) ) )
    ), value.a );
}
`;

/**
 * Fog is mixed after tone mapping/encoding. When rendering to the canvas three.js
 * hands the fog colour over already sRGB-encoded, but inside a render target it is
 * linear (far darker), which erased the haze on distant dunes. Encode it here.
 */
const DISPLAY_FOG = /* glsl */ `
#ifdef USE_FOG
    #ifdef FOG_EXP2
        float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
    #else
        float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
    #endif
    gl_FragColor.rgb = mix( gl_FragColor.rgb, displaySRGB( vec4( fogColor, 1.0 ) ).rgb, fogFactor );
#endif
`;

function patchMaterial(material: THREE.Material): void {
    if ((material as THREE.ShaderMaterial).isShaderMaterial) return;
    if (material.userData.displaySpace) return;
    material.userData.displaySpace = true;

    material.onBeforeCompile = (shader) => {
        shader.uniforms.uDisplayExposure = displayExposure;
        shader.fragmentShader =
            DISPLAY_FUNCTIONS +
            shader.fragmentShader
                .replace(
                    '#include <tonemapping_fragment>',
                    'gl_FragColor.rgb = displayACES( gl_FragColor.rgb );'
                )
                .replace(
                    '#include <colorspace_fragment>',
                    'gl_FragColor = displaySRGB( gl_FragColor );'
                )
                .replace('#include <fog_fragment>', DISPLAY_FOG);
    };
    material.customProgramCacheKey = () => 'display-space-v2';
    material.needsUpdate = true;
}

/** Make every built-in material under `root` tone-map and encode itself. */
export function applyDisplaySpaceOutput(root: THREE.Object3D): void {
    root.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.material) return;
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        materials.forEach(patchMaterial);
    });
}
