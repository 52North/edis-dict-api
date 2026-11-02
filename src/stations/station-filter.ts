import {
  FilterParameter,
  parseBbox,
  StationQuery,
} from '../query/station-query';
import { PegelonlineStation, PegelonlineTimeseries } from './station.model';

type Compare = (value: string | undefined, term: string) => boolean;

/** compare is matches or, with match=exact, equalsIgnoringCase */
type StationFilter = (
  station: PegelonlineStation,
  term: string,
  compare: Compare,
  lang: string | undefined,
) => boolean;

/** The fields with alternative names, stored as <field>_alternatives and <field>_names. */
export type NamedField =
  'water' | 'country' | 'land' | 'kreis' | 'city' | 'einzugsgebiet';

// the language without region, e.g. de for de-CH
const baseLanguage = (lang: string) => lang.split('-')[0].toLowerCase();

/**
 * The alternatives that count for the language: the names of the language
 * (without region, de also takes de-AT and de-CH) and those that are under no
 * language in names, like transcriptions and abbreviations. Without names all
 * of them have no language, without lang all count.
 */
export function alternativesIn(
  alternatives: string[] | undefined,
  names: Record<string, string> | undefined,
  lang: string | undefined,
): string[] | undefined {
  if (!lang || !alternatives) {
    return alternatives;
  }
  const named = Object.entries(names ?? {});
  const base = baseLanguage(lang);
  const inLanguage = new Set(
    named.filter(([l]) => baseLanguage(l) === base).map(([, name]) => name),
  );
  const withLanguage = new Set(named.map(([, name]) => name));
  return alternatives.filter(
    (alternative) =>
      inLanguage.has(alternative) || !withLanguage.has(alternative),
  );
}

/** The alternatives of the field that count for the language, see alternativesIn. */
export function alternatives(
  station: PegelonlineStation,
  field: NamedField,
  lang: string | undefined,
): string[] | undefined {
  return alternativesIn(
    station[`${field}_alternatives`],
    station[`${field}_names`],
    lang,
  );
}

/** Ignoring case, the term may be any part of the value. */
export function matches(value: string | undefined, term: string): boolean {
  return !!value && value.toLowerCase().includes(term.toLowerCase());
}

function matchesAny(values: string[] | undefined, term: string): boolean {
  return !!values?.some((value) => matches(value, term));
}

function anyOf(
  values: string[] | undefined,
  term: string,
  compare: Compare,
): boolean {
  return !!values?.some((value) => compare(value, term));
}

export function equalsIgnoringCase(
  value: string | undefined,
  term: string,
): boolean {
  return !!value && value.toLowerCase() === term.toLowerCase();
}

/**
 * The long name of a timeseries with spaces instead of underscores and without
 * a final ROHDATEN, e.g. ABFLUSS for ABFLUSS_ROHDATEN. Pegelonline adds it to
 * most long names, but not to all of the same parameter.
 */
export function parameterName(longname: string): string {
  return longname
    .replaceAll('_', ' ')
    .trim()
    .replace(/\s+ROHDATEN$/i, '');
}

/**
 * Whether the timeseries measures the parameter, given as short name or whole
 * long name. A substring match would let "W" also find WT, WG or WR.
 */
export function isParameter(ts: PegelonlineTimeseries, term: string): boolean {
  return (
    // upper case turns ß into SS, so "Fließgeschwindigkeit" finds FLIESSGESCHWINDIGKEIT
    parameterName(ts.longname).toUpperCase() ===
      parameterName(term).toUpperCase() ||
    equalsIgnoringCase(ts.shortname, term)
  );
}

const NAMED_FIELDS: NamedField[] = [
  'water',
  'country',
  'land',
  'kreis',
  'city',
  'einzugsgebiet',
];

// a record, so the compiler reports parameters added to StationQuery but missing here
// TODO: add region filter
const FILTERS: Record<FilterParameter, StationFilter> = {
  station: (st, term, compare) => compare(st.shortname, term),
  // the whole number, the numbers consist of digits only
  number: (st, term) => st.number === term,
  gewaesser: (st, term, compare, lang) =>
    compare(st.water.shortname, term) ||
    // whole name ignoring case, a substring match would let "Elbe" also find e.g. the Elbe-Havel-Kanal
    equalsIgnoringCase(st.water.longname, term) ||
    anyOf(alternatives(st, 'water', lang), term, compare),
  agency: (st, term, compare) => compare(st.agency, term),
  land: (st, term, compare, lang) =>
    compare(st.land, term) ||
    anyOf(alternatives(st, 'land', lang), term, compare),
  country: (st, term, compare, lang) =>
    compare(st.country, term) ||
    anyOf(alternatives(st, 'country', lang), term, compare),
  einzugsgebiet: (st, term, compare, lang) =>
    compare(st.einzugsgebiet, term) ||
    anyOf(alternatives(st, 'einzugsgebiet', lang), term, compare),
  kreis: (st, term, compare, lang) =>
    compare(st.kreis, term) ||
    anyOf(alternatives(st, 'kreis', lang), term, compare),
  parameter: (st, term) => st.timeseries.some((ts) => isParameter(ts, term)),
  bbox: (st, term) => {
    const bbox = parseBbox(term);
    // StationQueryPipe rejects invalid bboxes, a remaining one does not filter
    if (!bbox) {
      return true;
    }
    const [minLon, minLat, maxLon, maxLat] = bbox;
    return (
      st.longitude !== undefined &&
      st.latitude !== undefined &&
      st.longitude >= minLon &&
      st.longitude <= maxLon &&
      st.latitude >= minLat &&
      st.latitude <= maxLat
    );
  },
  // the fields of all other parameters except bbox, plus uuid, longname and city, all as substrings, also with match=exact
  q: (st, term, _, lang) =>
    [
      st.uuid,
      st.number,
      st.shortname,
      st.longname,
      st.agency,
      st.water.shortname,
      st.water.longname,
      st.country,
      st.land,
      st.kreis,
      st.city,
      st.einzugsgebiet,
      // with spaces, so "elektrische leitfähigkeit" finds ELEKTRISCHE_LEITFÄHIGKEIT_ROHDATEN
      ...st.timeseries.flatMap((ts) => [
        ts.shortname,
        ts.longname.replaceAll('_', ' '),
      ]),
    ].some((value) => matches(value, term)) ||
    NAMED_FIELDS.some((field) =>
      matchesAny(alternatives(st, field, lang), term),
    ),
};

/** The stations matching all given parameters, in their stored order. */
export function searchStations(
  stations: PegelonlineStation[],
  query: StationQuery,
): PegelonlineStation[] {
  const compare = query.match === 'exact' ? equalsIgnoringCase : matches;
  // the query may contain unknown parameters, which are ignored
  const filters = (Object.keys(FILTERS) as FilterParameter[]).flatMap((key) => {
    const term = query[key];
    return term
      ? [
          (st: PegelonlineStation) =>
            FILTERS[key](st, term, compare, query.lang),
        ]
      : [];
  });
  return stations.filter((st) => filters.every((filter) => filter(st)));
}
