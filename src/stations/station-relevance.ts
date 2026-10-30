import { equalsIgnoringCase, isParameter, matches } from './station-filter';
import { PegelonlineStation } from './station.model';

type Values = (string | undefined)[];

const equal = (values: Values, q: string) =>
  values.some((value) => equalsIgnoringCase(value, q));

const contain = (values: Values, q: string) =>
  values.some((value) => matches(value, q));

/**
 * How well q matches the station, 0 is best. Exact matches come first, by
 * field: name or number, water, city or county, then the other fields
 * including the parameters. Then names starting with q, then parts of name,
 * water, city or county. Any other hit of q gets the last tier, all ignoring
 * case.
 */
export function relevance(st: PegelonlineStation, q: string): number {
  const name = [st.shortname, st.longname];
  const water = [
    st.water.shortname,
    st.water.longname,
    ...(st.water_alternatives ?? []),
  ];
  const place = [
    st.city,
    st.kreis,
    ...(st.city_alternatives ?? []),
    ...(st.kreis_alternatives ?? []),
  ];
  const other = [
    st.agency,
    st.land,
    st.country,
    st.einzugsgebiet,
    ...(st.land_alternatives ?? []),
    ...(st.country_alternatives ?? []),
    ...(st.einzugsgebiet_alternatives ?? []),
  ];
  const tiers = [
    () => equal([...name, st.number, st.uuid], q),
    () => equal(water, q),
    () => equal(place, q),
    () => equal(other, q) || st.timeseries.some((ts) => isParameter(ts, q)),
    () => name.some((value) => value.toLowerCase().startsWith(q.toLowerCase())),
    () => contain(name, q),
    () => contain(water, q),
    () => contain(place, q),
  ];
  const tier = tiers.findIndex((matchesTier) => matchesTier());
  return tier < 0 ? tiers.length : tier;
}

/** The stations by relevance for q, those of the same tier in their given order. */
export function sortByRelevance(
  stations: PegelonlineStation[],
  q: string,
): PegelonlineStation[] {
  return stations
    .map((station) => ({ station, tier: relevance(station, q) }))
    .sort((a, b) => a.tier - b.tier)
    .map(({ station }) => station);
}
