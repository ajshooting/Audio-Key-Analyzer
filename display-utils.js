(function initializeDisplayUtils(root) {
  const NOTE_OFFSETS = {
    C: 0,
    D: 2,
    E: 4,
    F: 5,
    G: 7,
    A: 9,
    B: 11
  };
  const SHARP_NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const FLAT_NOTES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

  function parseKey(key) {
    const match = String(key || '').trim().match(/^([A-Ga-g])([#b♯♭]?)(?:m)?$/);
    if (!match) return null;

    const letter = match[1].toUpperCase();
    const accidental = match[2].replace('♯', '#').replace('♭', 'b');
    const accidentalOffset = accidental === '#' ? 1 : accidental === 'b' ? -1 : 0;

    return {
      name: `${letter}${accidental}`,
      pitchClass: (NOTE_OFFSETS[letter] + accidentalOffset + 12) % 12,
      preferFlats: accidental === 'b'
    };
  }

  function formatKeyWithRelative(key, scale) {
    const parsedKey = parseKey(key);
    const normalizedScale = String(scale || '').toLowerCase();

    if (!parsedKey || (normalizedScale !== 'major' && normalizedScale !== 'minor')) {
      return `${key || ''} ${scale || ''}`.trim();
    }

    const notes = parsedKey.preferFlats ? FLAT_NOTES : SHARP_NOTES;
    const isMinor = normalizedScale === 'minor';
    const relativePitchClass = (parsedKey.pitchClass + (isMinor ? 3 : 9)) % 12;
    const primaryKey = `${parsedKey.name}${isMinor ? 'm' : ''}`;
    const relativeKey = `${notes[relativePitchClass]}${isMinor ? '' : 'm'}`;

    return `${primaryKey} (${relativeKey})`;
  }

  function formatApproximateBpm(bpm, label = 'BPM') {
    if (bpm === null || bpm === undefined || bpm === '') return null;

    const numericBpm = Number(bpm);
    if (!Number.isFinite(numericBpm)) return null;

    const normalizedLabel = String(label).replace(/[:：]\s*$/, '');
    return `${normalizedLabel} ≈ ${Math.round(numericBpm)}`;
  }

  const displayUtils = {
    formatApproximateBpm,
    formatKeyWithRelative
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = displayUtils;
  } else {
    root.AudioKeyDisplay = displayUtils;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this));
