import { ApiProperty } from '@nestjs/swagger';

import { FilterParameter } from '../query/station-query';
import {
  alternatives,
  NamedField,
  namesIn,
  parameterName,
} from '../stations/station-filter';
import { PegelonlineStation } from '../stations/station.model';

// q and bbox have no fixed values to list
export type OptionParameter = Exclude<FilterParameter, 'q' | 'bbox'>;

/** A value of a search parameter with its alternative names, for grouped=true. */
export class OptionGroup {
  @ApiProperty({
    description: 'Wert des Suchparameters (z.B. <code>Niedersachsen</code>)',
  })
  value: string;

  @ApiProperty({
    description:
      'Alternative Benennungen, die die Suche ebenfalls findet (z.B. <code>Lower Saxony</code>)',
    type: [String],
  })
  alternatives: string[];

  @ApiProperty({
    description:
      'Namen des Werts je Sprache (z.B. <code>{ "en": "Lower Saxony", "fr": "Basse-Saxe" }</code>), mit <code>lang</code> nur die dieser Sprache, leer ohne Namen',
    type: Object,
    additionalProperties: { type: 'string' },
    example: { en: 'Lower Saxony', fr: 'Basse-Saxe' },
  })
  names: Record<string, string>;
}

// a value of a search parameter at one station, missing if the station has none
export type StationOption = {
  value?: string;
  alternatives?: string[];
  names?: Record<string, string>;
};

// the value of a field with alternative names, those of the language with lang
const named = (
  st: PegelonlineStation,
  value: string | undefined,
  field: NamedField,
  lang: string | undefined,
): StationOption[] => [
  {
    value,
    alternatives: alternatives(st, field, lang),
    names: namesIn(st[`${field}_names`], lang),
  },
];

// the values of a search parameter, with the alternative names the search also finds
export const OPTION_GROUPS: Record<
  OptionParameter,
  (station: PegelonlineStation, lang: string | undefined) => StationOption[]
> = {
  station: (st) => [{ value: st.shortname }],
  number: (st) => [{ value: st.number }],
  agency: (st) => [{ value: st.agency }],
  gewaesser: (st, lang) => named(st, st.water.shortname, 'water', lang),
  kreis: (st, lang) => named(st, st.kreis, 'kreis', lang),
  ort: (st, lang) => named(st, st.city, 'city', lang),
  land: (st, lang) => named(st, st.land, 'land', lang),
  country: (st, lang) => named(st, st.country, 'country', lang),
  einzugsgebiet: (st, lang) =>
    named(st, st.einzugsgebiet, 'einzugsgebiet', lang),
  parameter: (st) =>
    st.timeseries.map((ts) => ({
      value: parameterName(ts.longname),
      alternatives: [ts.shortname],
    })),
};
// a set, so names of the object prototype like "constructor" are no parameters
export const OPTION_PARAMETERS = new Set(Object.keys(OPTION_GROUPS));

/** The values and alternatives in one sorted list, as before grouped=true. */
export function flatOptions(options: StationOption[]): string[] {
  const all = options.flatMap((o) => [o.value, ...(o.alternatives ?? [])]);
  return Array.from(
    new Set(all.filter((value): value is string => !!value)),
  ).sort();
}

/** A value collected over stations, see collectOptions. */
export interface CollectedOption extends OptionGroup {
  /** the number of stations with the value */
  count: number;
}

/**
 * The values of the stations, given as the options of each station, each with
 * the alternatives and names of all its stations and the number of stations
 * having it. For a language named differently by two stations the first name
 * counts. Options without value are left out, also with alternatives.
 */
export function collectOptions(
  optionsByStation: StationOption[][],
): CollectedOption[] {
  const collected = new Map<
    string,
    { alternatives: Set<string>; names: Record<string, string>; count: number }
  >();
  for (const options of optionsByStation) {
    // a station counts once per value, e.g. for two timeseries of one parameter
    const counted = new Set<string>();
    for (const { value, alternatives, names } of options) {
      if (!value) {
        continue;
      }
      const option = collected.get(value) ?? {
        alternatives: new Set<string>(),
        names: {},
        count: 0,
      };
      for (const alternative of alternatives ?? []) {
        if (alternative && alternative !== value) {
          option.alternatives.add(alternative);
        }
      }
      option.names = { ...names, ...option.names };
      if (!counted.has(value)) {
        counted.add(value);
        option.count++;
      }
      collected.set(value, option);
    }
  }
  return Array.from(collected, ([value, { alternatives, names, count }]) => ({
    value,
    alternatives: Array.from(alternatives).sort(),
    names,
    count,
  }));
}

/** The values sorted, each with the alternatives and names of all its stations. */
export function groupOptions(
  optionsByStation: StationOption[][],
): OptionGroup[] {
  return collectOptions(optionsByStation)
    .sort((a, b) => (a.value < b.value ? -1 : a.value > b.value ? 1 : 0))
    .map(({ value, alternatives, names }) => ({ value, alternatives, names }));
}
