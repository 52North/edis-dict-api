import { StationQuery } from '../query/station-query';
import { searchStations } from '../stations/station-filter';
import { PegelonlineStation } from '../stations/station.model';
import {
  collectOptions,
  CollectedOption,
  OPTION_GROUPS,
  OptionParameter,
} from './option-values';

/** The values of a field among the hits, see facets. */
export interface FieldFacet {
  values: CollectedOption[];
  /** the number of hits without a value */
  missing: number;
}

export interface Facets {
  /** the number of hits of all filters */
  count: number;
  facets: Partial<Record<OptionParameter, FieldFacet>>;
}

// German order, e.g. KÖLN before KONSTANZ instead of after all ASCII names
const collator = new Intl.Collator('de', { numeric: true });

/**
 * The values of the fields among the stations matching the query, each field
 * counted without the filter on itself, so that a chosen value can be swapped
 * for another one. The values come with the number of stations having them,
 * the most frequent first, then by name, and with their alternatives and
 * names, limited to the language of the query like for /search.
 */
export function facets(
  stations: PegelonlineStation[],
  query: StationQuery,
  fields: OptionParameter[],
): Facets {
  const hits = searchStations(stations, query);
  const result: Facets = { count: hits.length, facets: {} };
  for (const field of fields) {
    const fieldHits = query[field]
      ? searchStations(stations, { ...query, [field]: undefined })
      : hits;
    const optionsByStation = fieldHits.map((st) =>
      OPTION_GROUPS[field](st, query.lang || undefined),
    );
    result.facets[field] = {
      values: collectOptions(optionsByStation).sort(
        (a, b) => b.count - a.count || collator.compare(a.value, b.value),
      ),
      missing: optionsByStation.filter(
        (options) => !options.some((option) => option.value),
      ).length,
    };
  }
  return result;
}
