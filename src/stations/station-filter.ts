import {
  FilterParameter,
  parseBbox,
  StationQuery,
} from '../query/station-query';
import { PegelonlineStation } from './station.model';

type Compare = (value: string | undefined, term: string) => boolean;

/** compare is matches or, with match=exact, equalsIgnoringCase */
type StationFilter = (
  station: PegelonlineStation,
  term: string,
  compare: Compare,
) => boolean;

/** Ignoring case, the term may be any part of the value. */
function matches(value: string | undefined, term: string): boolean {
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

function equalsIgnoringCase(value: string | undefined, term: string): boolean {
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

// a record, so the compiler reports parameters added to StationQuery but missing here
// TODO: add region filter
const FILTERS: Record<FilterParameter, StationFilter> = {
  station: (st, term, compare) => compare(st.shortname, term),
  // the whole number, the numbers consist of digits only
  number: (st, term) => st.number === term,
  gewaesser: (st, term, compare) =>
    compare(st.water.shortname, term) ||
    // whole name ignoring case, a substring match would let "Elbe" also find e.g. the Elbe-Havel-Kanal
    equalsIgnoringCase(st.water.longname, term) ||
    anyOf(st.water_alternatives, term, compare),
  agency: (st, term, compare) => compare(st.agency, term),
  land: (st, term, compare) =>
    compare(st.land, term) || anyOf(st.land_alternatives, term, compare),
  country: (st, term, compare) =>
    compare(st.country, term) || anyOf(st.country_alternatives, term, compare),
  einzugsgebiet: (st, term, compare) =>
    compare(st.einzugsgebiet, term) ||
    anyOf(st.einzugsgebiet_alternatives, term, compare),
  kreis: (st, term, compare) =>
    compare(st.kreis, term) || anyOf(st.kreis_alternatives, term, compare),
  // whole names, a substring match would let "W" also find WT, WG or WR
  parameter: (st, term) =>
    st.timeseries.some(
      (ts) =>
        // upper case turns ß into SS, so "Fließgeschwindigkeit" finds FLIESSGESCHWINDIGKEIT
        parameterName(ts.longname).toUpperCase() ===
          parameterName(term).toUpperCase() ||
        equalsIgnoringCase(ts.shortname, term),
    ),
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
  q: (st, term) =>
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
    [
      st.water_alternatives,
      st.country_alternatives,
      st.land_alternatives,
      st.kreis_alternatives,
      st.city_alternatives,
      st.einzugsgebiet_alternatives,
    ].some((alternatives) => matchesAny(alternatives, term)),
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
      ? [(st: PegelonlineStation) => FILTERS[key](st, term, compare)]
      : [];
  });
  return stations.filter((st) => filters.every((filter) => filter(st)));
}
