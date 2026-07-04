// Deterministic PRNG from string seed. Exact translation of FrMiniMap bundle's hash.
// Call order matters — callers must invoke rnd() in the same sequence every render.
export function frHash(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

const AVATAR_PALETTE = [
  '#E8703D', '#3D8BFF', '#1F9E63', '#C44D0A',
  '#E0A52E', '#6C5CE7', '#D8463C', '#0FA3A3',
];

export function avatarBg(name: string): string {
  const rnd = frHash(name);
  return AVATAR_PALETTE[Math.floor(rnd() * AVATAR_PALETTE.length)];
}
