import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Logger,
  Query,
} from '@nestjs/common';
import {
  ApiExtraModels,
  ApiOperation,
  ApiProperty,
  ApiQuery,
  ApiResponse,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';

import { FilterParameter } from '../query/station-query';
import { LANGUAGE_TAG } from '../query/station-query';
import {
  alternatives,
  NamedField,
  namesIn,
  parameterName,
} from '../stations/station-filter';
import { PegelonlineStation } from '../stations/station.model';
import { StationsService } from '../stations/stations.service';

// q and bbox have no fixed values to list
type OptionParameter = Exclude<FilterParameter, 'q' | 'bbox'>;

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
type StationOption = {
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
const OPTION_GROUPS: Record<
  OptionParameter,
  (station: PegelonlineStation, lang: string | undefined) => StationOption[]
> = {
  station: (st) => [{ value: st.shortname }],
  number: (st) => [{ value: st.number }],
  agency: (st) => [{ value: st.agency }],
  gewaesser: (st, lang) => named(st, st.water.shortname, 'water', lang),
  kreis: (st, lang) => named(st, st.kreis, 'kreis', lang),
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
const OPTION_PARAMETERS = new Set(Object.keys(OPTION_GROUPS));

/** The values and alternatives in one sorted list, as before grouped=true. */
function flatOptions(options: StationOption[]): string[] {
  const all = options.flatMap((o) => [o.value, ...(o.alternatives ?? [])]);
  return Array.from(
    new Set(all.filter((value): value is string => !!value)),
  ).sort();
}

/**
 * The values sorted, each with the alternatives and names of all its stations,
 * for a language named differently by two stations the first name. Stations
 * without the value are left out, also with alternatives.
 */
function groupOptions(options: StationOption[]): OptionGroup[] {
  const groups = new Map<
    string,
    { alternatives: Set<string>; names: Record<string, string> }
  >();
  for (const { value, alternatives, names } of options) {
    if (!value) {
      continue;
    }
    const group = groups.get(value) ?? { alternatives: new Set(), names: {} };
    for (const alternative of alternatives ?? []) {
      if (alternative && alternative !== value) {
        group.alternatives.add(alternative);
      }
    }
    group.names = { ...names, ...group.names };
    groups.set(value, group);
  }
  return Array.from(groups.keys())
    .sort()
    .map((value) => {
      const group = groups.get(value);
      return {
        value,
        alternatives: Array.from(group?.alternatives ?? []).sort(),
        names: group?.names ?? {},
      };
    });
}

/**
 * GET /options?parameter=…, the sorted distinct values of a search parameter
 * over all stations, including the alternative names. With grouped=true each
 * value comes with its alternatives and names by language, lang limits both to
 * a language like for /search.
 */
@Controller('options')
@ApiTags('Optionen')
@ApiExtraModels(OptionGroup)
export class OptionsController {
  private readonly logger = new Logger(OptionsController.name);

  constructor(private stationsSrvc: StationsService) {}

  @Get()
  @ApiOperation({
    description:
      'Die sortierten Werte eines Suchparameters über alle Stationen, einschließlich der alternativen Benennungen, die die Suche ebenfalls findet. Gedacht für Auswahllisten und Autovervollständigung.',
  })
  // decorators apply bottom up, so parameter comes first in the spec
  @ApiQuery({
    name: 'lang',
    required: false,
    description:
      'Nur die alternativen Benennungen dieser Sprache (ohne Region) und die ohne Sprache, wie bei <code>/search</code> (z.B. <code>en</code>)',
  })
  @ApiQuery({
    name: 'grouped',
    required: false,
    type: Boolean,
    description:
      'Mit <code>true</code> je Wert ein Objekt mit seinen alternativen Benennungen statt einer flachen Liste aus Werten und Alternativen',
  })
  @ApiQuery({
    name: 'parameter',
    required: true,
    enum: Object.keys(OPTION_GROUPS),
    description: 'Suchparameter, dessen Werte geliefert werden',
  })
  @ApiResponse({
    status: 200,
    description:
      'Ohne <code>grouped</code> eine flache Liste aus Werten und Alternativen, mit <code>grouped=true</code> die Werte mit ihren Alternativen und Namen je Sprache',
    schema: {
      oneOf: [
        { type: 'array', items: { type: 'string' } },
        { type: 'array', items: { $ref: getSchemaPath(OptionGroup) } },
      ],
    },
  })
  @ApiResponse({
    status: 400,
    description:
      'Fehlender oder nicht unterstützter Suchparameter, ein anderer Wert für <code>grouped</code> als <code>true</code> oder <code>false</code> oder eine Sprache in anderer Form als z.B. <code>en</code> oder <code>de-CH</code>',
  })
  findAll(
    @Query() query: { parameter?: string; grouped?: string; lang?: string },
  ): string[] | OptionGroup[] {
    if (!query.parameter) {
      throw new HttpException('missing parameter', HttpStatus.BAD_REQUEST);
    }
    this.logger.log(query.parameter);
    if (!OPTION_PARAMETERS.has(query.parameter)) {
      throw new HttpException('unsupported parameter', HttpStatus.BAD_REQUEST);
    }
    // repeated parameters arrive as arrays and are rejected like other values
    if (
      query.grouped !== undefined &&
      !['true', 'false'].includes(query.grouped)
    ) {
      throw new HttpException(
        'grouped must be true or false',
        HttpStatus.BAD_REQUEST,
      );
    }
    // an empty lang is not set, like for /search
    if (
      query.lang !== undefined &&
      query.lang !== '' &&
      (typeof query.lang !== 'string' || !LANGUAGE_TAG.test(query.lang))
    ) {
      throw new HttpException(
        'lang must be a language like en or de-CH',
        HttpStatus.BAD_REQUEST,
      );
    }
    const options = this.stationsSrvc
      .getStations()
      .flatMap((st) =>
        OPTION_GROUPS[query.parameter as OptionParameter](
          st,
          query.lang || undefined,
        ),
      );
    return query.grouped === 'true'
      ? groupOptions(options)
      : flatOptions(options);
  }
}
