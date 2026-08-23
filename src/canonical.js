export class CanonicalError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CanonicalError';
  }
}

// The envelope's own depth is 2; this cap is a generous resource guard so a
// hostile document can never drive unbounded recursion before schema
// validation has its turn.
const MAX_DEPTH = 64;

export function canonicalize(value, depth = 0) {
  if (depth > MAX_DEPTH) {
    throw new CanonicalError(`canonicalization depth exceeded ${MAX_DEPTH}`);
  }
  if (value === null || typeof value === 'boolean') return JSON.stringify(value);
  const t = typeof value;
  if (t === 'number') {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new CanonicalError(`non-canonical number: ${value}`);
    }
    return String(value);
  }
  if (t === 'string') return JSON.stringify(value.normalize('NFC'));
  if (Array.isArray(value)) return '[' + value.map((v) => canonicalize(v, depth + 1)).join(',') + ']';
  if (t === 'object') {
    // Hardening: two distinct raw keys can normalize (NFC) to the same string
    // ("e\u0301" and "\u00e9" both become "é"). Sorting happens on raw keys,
    // serialization on normalized ones, so such collisions would silently
    // merge distinct fields into one canonical entry. Reject them instead.
    const seen = new Set();
    for (const raw of Object.keys(value)) {
      const norm = raw.normalize('NFC');
      if (seen.has(norm)) {
        throw new CanonicalError(`normalized key collision under NFC: ${JSON.stringify(raw)}`);
      }
      seen.add(norm);
    }
    const keys = Object.keys(value).sort();
    return '{' + keys.map((k) => JSON.stringify(k.normalize('NFC')) + ':' + canonicalize(value[k], depth + 1)).join(',') + '}';
  }
  throw new CanonicalError(`unsupported type: ${t}`);
}

export function isCanonical(text) {
  try {
    return canonicalize(JSON.parse(text)) === text;
  } catch {
    return false;
  }
}
