/** Shared GLSL chunks. */

export const NOISE_GLSL = /* glsl */ `
float hash12(vec2 p){
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float hash13(vec3 p3){
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}
vec3 hash33(vec3 p3){
  p3 = fract(p3 * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yxz + 33.33);
  return fract((p3.xxy + p3.yxx) * p3.zyx);
}
float vnoise(vec2 p){
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), f.x),
             mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), f.x), f.y);
}
float vnoise3(vec3 p){
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = mix(mix(hash13(i), hash13(i + vec3(1.0, 0.0, 0.0)), f.x),
                mix(hash13(i + vec3(0.0, 1.0, 0.0)), hash13(i + vec3(1.0, 1.0, 0.0)), f.x), f.y);
  float b = mix(mix(hash13(i + vec3(0.0, 0.0, 1.0)), hash13(i + vec3(1.0, 0.0, 1.0)), f.x),
                mix(hash13(i + vec3(0.0, 1.0, 1.0)), hash13(i + vec3(1.0, 1.0, 1.0)), f.x), f.y);
  return mix(a, b, f.z);
}
float fbm2(vec2 p){
  float a = 0.5;
  float s = 0.0;
  for (int i = 0; i < 5; i++) {
    s += a * vnoise(p);
    p = mat2(1.6, 1.2, -1.2, 1.6) * p + 7.3;
    a *= 0.5;
  }
  return s;
}
float fbm3(vec3 p){
  float a = 0.5;
  float s = 0.0;
  for (int i = 0; i < 4; i++) {
    s += a * vnoise3(p);
    p = p * 2.03 + vec3(11.3, 7.1, 3.7);
    a *= 0.5;
  }
  return s;
}
`;

/**
 * Analytic atmosphere: zenith→horizon gradient, forward scattering around the
 * sun and a soft counter-glow opposite it. Used by the sky, by distance fog
 * (so far terrain melts into the real sky colour), by the water and by the
 * moons, which is what keeps the whole scene coherent.
 */
export const ATMOSPHERE_GLSL = /* glsl */ `
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uGround;
uniform vec3 uSunDir;
uniform vec3 uSunGlow;
uniform float uGlowAmt;
uniform vec3 uAntiGlow;

vec3 atmosphere(vec3 d){
  float h = clamp(d.y, 0.0, 1.0);
  vec3 col = mix(uZenith, uHorizon, pow(1.0 - h, 3.4));
  float sd = dot(d, uSunDir);
  float s = max(sd, 0.0);
  float band = pow(1.0 - min(abs(d.y), 1.0), 5.0);
  col += uSunGlow * uGlowAmt * (0.2 * pow(s, 3.0) * (0.3 + band) + 0.42 * pow(s, 22.0) + 0.9 * pow(s, 160.0));
  col += uAntiGlow * pow(1.0 - min(abs(d.y), 1.0), 9.0) * smoothstep(0.1, 1.0, -sd) * 0.55;
  col = mix(col, uGround, smoothstep(0.0, -0.2, d.y));
  return col;
}
`;
