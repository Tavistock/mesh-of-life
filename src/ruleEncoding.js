// Canonical rule codec: classic base-36 <-> {birth,survive} <-> bit-packed hex.

const HEX_RULE = /^B0x([0-9A-Fa-f]+)\/S0x([0-9A-Fa-f]+)$/;

export function isHexRule(s) {
  const m = HEX_RULE.exec((s || '').trim());
  return !!m && m[1].length % 2 === 0 && m[2].length % 2 === 0;
}

// --- classic notation (no elision) ---
export function parseClassic(s) {
  const birth = new Set(), survive = new Set();
  for (const part of (s || '').toUpperCase().split('/')) {
    let target = null, body = '';
    if (part.startsWith('B')) { target = birth;   body = part.slice(1); }
    else if (part.startsWith('S')) { target = survive; body = part.slice(1); }
    if (!target) continue;
    for (const ch of body) {                    // base-36, one char per count
      const n = parseInt(ch, 36);
      if (!isNaN(n)) target.add(n);
    }
  }
  return { birth, survive };
}

export function formatClassic(set) {
  return Array.from(set).sort((a, b) => a - b)
    .map(n => n.toString(36).toUpperCase()).join('');
}

// --- hex notation ---
function setToHex(set) {
  let v = 0n;
  for (const n of set) v |= 1n << BigInt(n);
  if (v === 0n) return '00';
  let be = v.toString(16).toUpperCase();
  if (be.length % 2) be = '0' + be;
  return (be.match(/../g) || ['00']).reverse().join('');   // little-endian
}

export function encodeRuleHex({ birth, survive }) {
  return `B0x${setToHex(birth)}/S0x${setToHex(survive)}`;
}

function hexToSet(hex) {
  const be = (hex.match(/../g) || []).reverse().join('');
  const v = BigInt('0x' + be);
  const set = new Set();
  for (let i = 0; v >> BigInt(i); i++) if ((v >> BigInt(i)) & 1n) set.add(i);
  return set;
}

export function decodeRuleHex(s) {
  const m = HEX_RULE.exec((s || '').trim());
  if (!m || m[1].length % 2 || m[2].length % 2) return null;
  return { birth: hexToSet(m[1]), survive: hexToSet(m[2]) };
}

// --- dispatch / canonical ---
export function parseRule(s) {
  return isHexRule(s) ? decodeRuleHex(s) : parseClassic(s);
}

export function ruleToStrings(sets) {
  return {
    classic: `B${formatClassic(sets.birth)}/S${formatClassic(sets.survive)}`,
    hex: encodeRuleHex(sets)
  };
}