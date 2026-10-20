import { parseBbox, StationQuery } from '../query/station-query';
import { PegelonlineStation } from './station.model';

type StationFilter = (station: PegelonlineStation, term: string) => boolean;

// ignoring case, the term may be any part of the value
function matches(value: string | undefined, term: string): boolean {
  return !!value && value.toLowerCase().includes(term.toLowerCase());
}

function matchesAny(values: string[] | undefined, term: string): boolean {
  return !!values?.some((value) => matches(value, term));
}

function equalsIgnoringCase(value: string | undefined, term: string): boolean {
  return !!value && value.toLowerCase() === term.toLowerCase();
}

// a record, so the compiler reports parameters added to StationQuery but missing here
// TODO: add region filter
const FILTERS: Record<keyof StationQuery, StationFilter> = {
  station: (st, term) => matches(st.shortname, term),
  gewaesser: (st, term) =>
    matches(st.water.shortname, term) ||
    // whole name ignoring case, a substring match would let "Elbe" also find e.g. the Elbe-Havel-Kanal
    equalsIgnoringCase(st.water.longname, term) ||
    matchesAny(st.water_alternatives, term),
  agency: (st, term) => matches(st.agency, term),
  land: (st, term) =>
    matches(st.land, term) || matchesAny(st.land_alternatives, term),
  country: (st, term) =>
    matches(st.country, term) || matchesAny(st.country_alternatives, term),
  einzugsgebiet: (st, term) =>
    matches(st.einzugsgebiet, term) ||
    matchesAny(st.einzugsgebiet_alternatives, term),
  kreis: (st, term) =>
    matches(st.kreis, term) || matchesAny(st.kreis_alternatives, term),
  parameter: (st, term) =>
    st.timeseries.some(
      (ts) =>
        equalsIgnoringCase(ts.longname, term) ||
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
  q: (st, term) =>
    [
      st.uuid,
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
      ...st.timeseries.flatMap((ts) => [ts.shortname, ts.longname]),
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

// a station has to match all given parameters
export function searchStations(
  stations: PegelonlineStation[],
  query: StationQuery,
): PegelonlineStation[] {
  // the query may contain unknown parameters, which are ignored
  const filters = (Object.keys(FILTERS) as (keyof StationQuery)[]).flatMap(
    (key) => {
      const term = query[key];
      return term ? [(st: PegelonlineStation) => FILTERS[key](st, term)] : [];
    },
  );
  return stations.filter((st) => filters.every((filter) => filter(st)));
}
