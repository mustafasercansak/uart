/**
 * Resolves a CAN node or profile name to a human-readable, translated string.
 *
 * Priority:
 *   1. Exact i18n key match  →  t('can.bed1Monitor') already exists → use it
 *   2. Pattern match         →  can.bed{N}{Suffix} → "Bed N · {device}"
 *   3. Raw string fallback   →  user-created names with plain text
 *
 * Adding a new bed node (e.g. can.bed9IVPump) requires no new translation keys.
 */

/** Maps the camelCase suffix of a bedN* key to its MEDICAL_PROFILE_LABELS i18n key. */
const SUFFIX_TO_I18N_KEY: Record<string, string> = {
  Monitor:    'can.vitalMonitor',
  IVPump:     'can.iVPump',
  Vent:       'can.ventilator',
  ECGMonitor: 'can.eCGMonitor',
  PulseOx:    'can.pulseOximeter',
  Defib:      'can.defibrillator',
  Pump:       'can.infusionPump',
};

/**
 * Resolves `name` to a display string using `t` for translation.
 *
 * @param name - Raw node/profile name (may be an i18n key or plain text)
 * @param t    - Translation function from useTranslation()
 */
export function resolveNodeName(
  name: string,
  t: (key: string) => string,
): string {
  // 1. Exact key — only attempt for strings that look like i18n keys
  //    (no spaces, contains a dot, starts lowercase). User-created names
  //    like "My Device" or "Bed 3" are never candidates.
  if (!name.includes(' ') && name.includes('.') && /^[a-z]/.test(name)) {
    const exact = t(name);
    if (exact !== name) return exact;
  }

  // 2. Pattern: can.bed{N}{Suffix}
  //    e.g. can.bed3IVPump → "Bed 3 · IV Pump"
  const bedMatch = name.match(/^can\.bed(\d+)([A-Z][a-zA-Z]*)$/);
  if (bedMatch) {
    const [, num, suffix] = bedMatch;
    const deviceKey = SUFFIX_TO_I18N_KEY[suffix];
    const device = deviceKey ? t(deviceKey) : suffix;
    return `${t('can.bed')} ${num} · ${device}`;
  }

  // 3. Plain string (user-created profile/node name)
  return name;
}
