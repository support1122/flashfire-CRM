/** Time zone options and wall-clock conversion, built on Intl only (no date library needed). */

export interface ZoneOption {
  id: string;
  city: string;
}

export interface ZoneGroup {
  region: string;
  zones: ZoneOption[];
}

const z = (id: string, city: string): ZoneOption => ({ id, city });

export const ZONE_GROUPS: ZoneGroup[] = [
  {
    region: 'United States',
    zones: [
      z('America/New_York', 'New York (Eastern)'),
      z('America/Chicago', 'Chicago (Central)'),
      z('America/Denver', 'Denver (Mountain)'),
      z('America/Phoenix', 'Phoenix (Arizona)'),
      z('America/Los_Angeles', 'Los Angeles (Pacific)'),
      z('America/Anchorage', 'Anchorage (Alaska)'),
      z('Pacific/Honolulu', 'Honolulu (Hawaii)'),
    ],
  },
  {
    region: 'Canada',
    zones: [
      z('America/Toronto', 'Toronto (Eastern)'),
      z('America/Vancouver', 'Vancouver (Pacific)'),
      z('America/Edmonton', 'Edmonton (Mountain)'),
      z('America/Winnipeg', 'Winnipeg (Central)'),
      z('America/Halifax', 'Halifax (Atlantic)'),
      z('America/St_Johns', "St. John's (Newfoundland)"),
    ],
  },
  {
    region: 'UK and Europe',
    zones: [
      z('Europe/London', 'London'),
      z('Europe/Dublin', 'Dublin'),
      z('Europe/Paris', 'Paris'),
      z('Europe/Berlin', 'Berlin'),
      z('Europe/Madrid', 'Madrid'),
      z('Europe/Rome', 'Rome'),
      z('Europe/Amsterdam', 'Amsterdam'),
      z('Europe/Zurich', 'Zurich'),
      z('Europe/Stockholm', 'Stockholm'),
      z('Europe/Athens', 'Athens'),
    ],
  },
  {
    region: 'Middle East',
    zones: [z('Asia/Dubai', 'Dubai'), z('Asia/Riyadh', 'Riyadh'), z('Asia/Qatar', 'Doha')],
  },
  {
    region: 'Asia',
    zones: [
      z('Asia/Kolkata', 'India (Kolkata)'),
      z('Asia/Singapore', 'Singapore'),
      z('Asia/Hong_Kong', 'Hong Kong'),
      z('Asia/Tokyo', 'Tokyo'),
      z('Asia/Seoul', 'Seoul'),
      z('Asia/Manila', 'Manila'),
      z('Asia/Karachi', 'Karachi'),
      z('Asia/Dhaka', 'Dhaka'),
    ],
  },
  {
    region: 'Australia and New Zealand',
    zones: [
      z('Australia/Sydney', 'Sydney'),
      z('Australia/Melbourne', 'Melbourne'),
      z('Australia/Brisbane', 'Brisbane'),
      z('Australia/Perth', 'Perth'),
      z('Australia/Adelaide', 'Adelaide'),
      z('Pacific/Auckland', 'Auckland'),
    ],
  },
  {
    region: 'Africa',
    zones: [
      z('Africa/Lagos', 'Lagos'),
      z('Africa/Nairobi', 'Nairobi'),
      z('Africa/Johannesburg', 'Johannesburg'),
      z('Africa/Cairo', 'Cairo'),
    ],
  },
  {
    region: 'Latin America',
    zones: [
      z('America/Mexico_City', 'Mexico City'),
      z('America/Sao_Paulo', 'Sao Paulo'),
      z('America/Bogota', 'Bogota'),
      z('America/Argentina/Buenos_Aires', 'Buenos Aires'),
    ],
  },
];

export const INDIA_ZONE = 'Asia/Kolkata';

const ALL_ZONES = ZONE_GROUPS.flatMap((g) => g.zones);

export function isKnownZone(id: string | null | undefined): id is string {
  return Boolean(id && ALL_ZONES.some((zone) => zone.id === id));
}

/** A readable name for any zone id, including ones outside the list. */
export function zoneCity(id: string): string {
  return ALL_ZONES.find((zone) => zone.id === id)?.city ?? id.split('/').pop()?.replace(/_/g, ' ') ?? id;
}

const partsCache = new Map<string, Intl.DateTimeFormat>();

function numericFormatter(zone: string): Intl.DateTimeFormat {
  let f = partsCache.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    partsCache.set(zone, f);
  }
  return f;
}

/** Minutes the zone is ahead of UTC at this instant (negative when behind). DST-aware. */
export function zoneOffsetMinutes(zone: string, instant: Date): number {
  const get: Record<string, number> = {};
  for (const p of numericFormatter(zone).formatToParts(instant)) {
    if (p.type !== 'literal') get[p.type] = Number(p.value);
  }
  const asUtc = Date.UTC(get.year, get.month - 1, get.day, get.hour % 24, get.minute, get.second);
  // Drop sub-second noise so the difference is a whole number of minutes.
  const real = Math.floor(instant.getTime() / 1000) * 1000;
  return Math.round((asUtc - real) / 60_000);
}

/** "UTC-4", "UTC+5:30". */
export function formatOffset(minutes: number): string {
  const sign = minutes < 0 ? '-' : '+';
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `UTC${sign}${h}${m ? `:${String(m).padStart(2, '0')}` : ''}`;
}

/** "New York (Eastern, UTC-4)" for the offset in force at `at`. */
export function zoneLabel(zone: ZoneOption, at: Date): string {
  const off = formatOffset(zoneOffsetMinutes(zone.id, at));
  const open = zone.city.indexOf('(');
  if (open === -1) return `${zone.city} (${off})`;
  return `${zone.city.slice(0, open)}(${zone.city.slice(open + 1, zone.city.indexOf(')'))}, ${off})`;
}

const WALL_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/**
 * Turns a wall-clock time typed for `zone` ("2026-10-15T12:30", the datetime-local format) into the
 * real UTC instant. Handles DST: the offset is looked up at the answer, not at the guess, and refined
 * once. A time that does not exist (spring-forward gap) lands on the first valid minute after it.
 * Returns null for unparseable input.
 */
export function zonedWallToUtc(wall: string, zone: string): Date | null {
  const m = WALL_RE.exec(wall);
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  if (Number.isNaN(guess)) return null;
  const off1 = zoneOffsetMinutes(zone, new Date(guess));
  let result = guess - off1 * 60_000;
  const off2 = zoneOffsetMinutes(zone, new Date(result));
  if (off2 !== off1) result = guess - off2 * 60_000;
  return new Date(result);
}

/** "Thu, Oct 15, 12:30 PM EDT". India prints IST because en-US would say GMT+5:30. */
export function formatInZone(instant: Date, zone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).formatToParts(instant);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const tz = zone === INDIA_ZONE ? 'IST' : get('timeZoneName');
  return `${get('weekday')}, ${get('month')} ${get('day')}, ${get('hour')}:${get('minute')} ${get('dayPeriod')} ${tz}`;
}

/** "in 42 min", "in 3 h 5 min", "in 2 days", "12 min ago". */
export function countdownLabel(target: Date, now: Date): string {
  const diffMin = Math.round((target.getTime() - now.getTime()) / 60_000);
  const abs = Math.abs(diffMin);
  let text: string;
  if (abs < 1) return 'now';
  if (abs < 60) text = `${abs} min`;
  else if (abs < 24 * 60) {
    const h = Math.floor(abs / 60);
    const m = abs % 60;
    text = m ? `${h} h ${m} min` : `${h} h`;
  } else {
    const days = Math.floor(abs / (24 * 60));
    text = `${days} day${days === 1 ? '' : 's'}`;
  }
  return diffMin > 0 ? `in ${text}` : `${text} ago`;
}

/** 'YYYY-MM-DD' of an instant as seen in a zone, for grouping into Today / Upcoming. */
export function dayKeyInZone(instant: Date, zone: string): string {
  const get: Record<string, string> = {};
  for (const p of numericFormatter(zone).formatToParts(instant)) get[p.type] = p.value;
  return `${get.year}-${get.month}-${get.day}`;
}
