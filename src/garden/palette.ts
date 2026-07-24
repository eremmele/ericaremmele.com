import * as THREE from "three";

/** Scene clear / page wash. */
export const BACKGROUND = 0x101211;

/**
 * Landscape palette — user swatches plus reference-inspired greens, rusts,
 * cools, and highlights for mottled variation.
 */
export const PALETTE = [
  // User blues / cools
  0x637d96,
  0x253e54,
  0x6b86a0,
  0x3a5978,
  0x7fa99a,
  0x171f43,
  0x1a2a40,
  0x2a4858,
  0x4a6a88,
  // User greens / olives
  0xa6ceaa,
  0x687974,
  0x9b9b75,
  0x55552e,
  0x9bb161,
  // Reference greens (deep → lime)
  0x1a3320,
  0x2a4a2e,
  0x3d6b38,
  0x4f8a40,
  0x6ba84a,
  0x8fc45a,
  0xb4d86a,
  0xcde87e,
  0x5a7a48,
  0x718f52,
  // Warm earth / rust (reference)
  0xcfa658,
  0xc7c0a6,
  0xc45a2e,
  0xa84828,
  0xd47840,
  0xe8a050,
  0xb86b3a,
  0x8a4a22,
  // Rose / plum (user)
  0xdb8395,
  0x921e56,
  0x63425f,
  0xc07080,
  0xa85870,
  // Highlights / pale tips
  0xe8e4d0,
  0xf2ecd8,
  0xd8d4b8,
  0xc8c8a0,
  // Deep shadow flecks
  0x0c1410,
  0x152018,
  0x1a2228,
] as const;

const paletteColors = PALETTE.map((hex) => new THREE.Color(hex));

function luminance(c: THREE.Color): number {
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}

/**
 * Soft-map a texture sample onto the palette: blend the two nearest swatches,
 * keep sample luminance for grain, and mix a little original chroma back in.
 */
export function mapToPalette(sample: THREE.Color, out: THREE.Color): THREE.Color {
  let i0 = 0;
  let i1 = 0;
  let d0 = Infinity;
  let d1 = Infinity;

  for (let i = 0; i < paletteColors.length; i += 1) {
    const p = paletteColors[i];
    const dr = sample.r - p.r;
    const dg = sample.g - p.g;
    const db = sample.b - p.b;
    const d = dr * dr + dg * dg + db * db;
    if (d < d0) {
      d1 = d0;
      i1 = i0;
      d0 = d;
      i0 = i;
    } else if (d < d1) {
      d1 = d;
      i1 = i;
    }
  }

  if (i0 === i1) {
    i1 = (i0 + 1) % paletteColors.length;
    const p = paletteColors[i1];
    const dr = sample.r - p.r;
    const dg = sample.g - p.g;
    const db = sample.b - p.b;
    d1 = dr * dr + dg * dg + db * db;
  }

  const mix = d0 + d1 > 1e-8 ? d1 / (d0 + d1) : 1;
  out.copy(paletteColors[i0]).lerp(paletteColors[i1], 1 - mix);

  // Preserve texture luminance so neighboring pixels stay mottled
  const sampleLum = luminance(sample);
  const outLum = luminance(out);
  if (outLum > 1e-4) {
    const scale = THREE.MathUtils.clamp(sampleLum / outLum, 0.45, 1.85);
    out.multiplyScalar(scale);
  }

  // Slight original chroma bleed for micro-variation (reference feel)
  out.r = THREE.MathUtils.clamp(out.r * 0.82 + sample.r * 0.18, 0, 1);
  out.g = THREE.MathUtils.clamp(out.g * 0.82 + sample.g * 0.18, 0, 1);
  out.b = THREE.MathUtils.clamp(out.b * 0.82 + sample.b * 0.18, 0, 1);

  return out;
}

export function nearestPaletteColor(sample: THREE.Color, out: THREE.Color): THREE.Color {
  return mapToPalette(sample, out);
}
