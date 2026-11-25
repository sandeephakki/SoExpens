// dal/migrate.js — schema versioning. Old backups must always open on new app versions.
//
// v1 -> v2: society-wide flatCount/flatRate/roomRate are gone. Every unit (flat, room, shop...)
// now carries its own `rate`, and a month's collection snapshot stores `groups`
// ([{count, rate, label?}]) so past months keep their exact amount and wording.

export const APP_NAME = 'SoExpens';
export const CURRENT_VERSION = 2;

export function emptyDoc() {
  return {
    app: APP_NAME,
    schemaVersion: CURRENT_VERSION,
    settings: { societyName: 'My Society', startingSavings: 0, currency: 'INR' },
    flats: [],
    months: [],
  };
}

function v1ToV2(d) {
  const s = d.settings && typeof d.settings === 'object' ? d.settings : {};
  const flats = Array.isArray(d.flats)
    ? d.flats.map((f) => {
      if (!f || typeof f !== 'object') return f;
      const { type, ...rest } = f;
      const own = rest.rate === undefined ? null : rest.rate;
      return { ...rest, rate: own !== null ? own : (type === 'room' ? s.roomRate : s.flatRate) ?? null };
    })
    : d.flats;
  const months = Array.isArray(d.months)
    ? d.months.map((m) => {
      const c = m && m.collection;
      if (!c || typeof c !== 'object') return m;
      const { flats: n, rate, roomRate, ...keep } = c;
      if (c.source === 'computed' && Number.isInteger(n)) {
        const groups = [{ count: n, rate }];
        if (Number.isInteger(roomRate) && roomRate > 0) groups.push({ count: 1, rate: roomRate, label: 'Top Room' });
        return { ...m, collection: { ...keep, groups } };
      }
      return { ...m, collection: keep };
    })
    : d.months;
  return {
    ...d, schemaVersion: 2, flats, months,
    settings: { societyName: s.societyName, startingSavings: s.startingSavings, currency: s.currency },
  };
}

// Returns a doc at CURRENT_VERSION, or throws an Error with a stable code.
export function migrate(doc) {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) throw new Error('not_object');
  if (doc.app !== APP_NAME) throw new Error('wrong_app');
  const v = doc.schemaVersion;
  if (!Number.isInteger(v) || v < 1) throw new Error('bad_version');
  if (v > CURRENT_VERSION) throw new Error('newer_version');
  let d = doc;
  if (v < 2) d = v1ToV2(d);
  return { ...d, schemaVersion: CURRENT_VERSION };
}
