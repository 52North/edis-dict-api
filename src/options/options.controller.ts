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

import { StationQuery } from '../query/station-query';
import { parameterName } from '../stations/station-filter';
import { PegelonlineStation } from '../stations/station.model';
import { StationsService } from '../stations/stations.service';

// q and bbox have no fixed values to list
type OptionParameter = Exclude<keyof StationQuery, 'q' | 'bbox'>;

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
}

// a value of a search parameter at one station, missing if the station has none
type StationOption = { value?: string; alternatives?: string[] };

// the values of a search parameter, with the alternative names the search also finds
const OPTION_GROUPS: Record<
  OptionParameter,
  (station: PegelonlineStation) => StationOption[]
> = {
  station: (st) => [{ value: st.shortname }],
  number: (st) => [{ value: st.number }],
  agency: (st) => [{ value: st.agency }],
  gewaesser: (st) => [
    { value: st.water.shortname, alternatives: st.water_alternatives },
  ],
  kreis: (st) => [{ value: st.kreis, alternatives: st.kreis_alternatives }],
  land: (st) => [{ value: st.land, alternatives: st.land_alternatives }],
  country: (st) => [
    { value: st.country, alternatives: st.country_alternatives },
  ],
  einzugsgebiet: (st) => [
    { value: st.einzugsgebiet, alternatives: st.einzugsgebiet_alternatives },
  ],
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
 * The values sorted, each with the alternatives of all its stations. Stations
 * without the value are left out, also with alternatives.
 */
function groupOptions(options: StationOption[]): OptionGroup[] {
  const groups = new Map<string, Set<string>>();
  for (const { value, alternatives } of options) {
    if (!value) {
      continue;
    }
    const group = groups.get(value) ?? new Set<string>();
    for (const alternative of alternatives ?? []) {
      if (alternative && alternative !== value) {
        group.add(alternative);
      }
    }
    groups.set(value, group);
  }
  return Array.from(groups.keys())
    .sort()
    .map((value) => ({
      value,
      alternatives: Array.from(groups.get(value) ?? []).sort(),
    }));
}

/**
 * GET /options?parameter=…, the sorted distinct values of a search parameter
 * over all stations, including the alternative names. With grouped=true each
 * value comes with its alternatives.
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
      'Ohne <code>grouped</code> eine flache Liste aus Werten und Alternativen, mit <code>grouped=true</code> die Werte mit ihren Alternativen',
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
      'Fehlender oder nicht unterstützter Suchparameter oder ein anderer Wert für <code>grouped</code> als <code>true</code> oder <code>false</code>',
  })
  findAll(
    @Query() query: { parameter?: string; grouped?: string },
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
    const options = this.stationsSrvc
      .getStations()
      .flatMap(OPTION_GROUPS[query.parameter as OptionParameter]);
    return query.grouped === 'true'
      ? groupOptions(options)
      : flatOptions(options);
  }
}
