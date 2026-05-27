// mulberry32 PRNG — same implementation as src/engine/rng.js, inlined here to keep the
// Uno engine importable without any dependency on the poker engine.

export function createRng(seed = Date.now()) {
  let a = seed >>> 0
  function next() {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return {
    next,
    int(max) {
      return Math.floor(next() * max)
    },
    snapshot() { return a },
    restore(s) { a = s >>> 0 },
  }
}
