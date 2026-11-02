import {
  BadRequestException,
  Controller,
  Get,
  Injectable,
  Logger,
  PipeTransform,
  Query,
} from '@nestjs/common';
import {
  ApiExtraModels,
  ApiOperation,
  ApiProperty,
  ApiResponse,
  ApiTags,
  getSchemaPath,
  OmitType,
} from '@nestjs/swagger';

import { StationQuery } from '../query/station-query';
import { StationQueryPipe } from '../query/station-query.pipe';
import { StationStore } from '../stations/station-store';
import { facets } from './facets';
import {
  OPTION_GROUPS,
  OPTION_PARAMETERS,
  OptionGroup,
  OptionParameter,
} from './option-values';

/** The parameters of /facets: the fields and the filters of /search. */
export class FacetsQuery extends OmitType(StationQuery, ['sort'] as const) {
  @ApiProperty({
    required: true,
    description: `Kommagetrennt die Felder, deren Werte geliefert werden, möglich sind ${Object.keys(
      OPTION_GROUPS,
    )
      .map((field) => `<code>${field}</code>`)
      .join(', ')} (z.B. <code>land,kreis</code>)`,
  })
  fields: string;
}

/** A value of a field with the number of hits having it. */
export class FacetValue extends OptionGroup {
  @ApiProperty({
    description:
      'Anzahl der Treffer mit diesem Wert, ohne den Filter auf das Feld selbst',
  })
  count: number;
}

/** The values of a field among the hits. */
export class Facet {
  @ApiProperty({
    description:
      'Die Werte des Felds unter den Treffern, die häufigsten zuerst, bei gleicher Anzahl nach Name',
    type: [FacetValue],
  })
  values: FacetValue[];

  @ApiProperty({
    description: 'Anzahl der Treffer ohne Wert in diesem Feld',
  })
  missing: number;
}

/** The response of /facets. */
export class FacetsResponse {
  @ApiProperty({
    description: 'Anzahl der Treffer mit allen Filtern, wie bei /search',
  })
  count: number;

  @ApiProperty({
    description: 'Die Werte je angefragtem Feld',
    type: 'object',
    additionalProperties: { $ref: getSchemaPath(Facet) },
  })
  facets: Record<string, Facet>;
}

/** The fields of the comma separated list, without empty and repeated ones. */
export function fieldList(fields: string | undefined): string[] {
  return Array.from(
    new Set(
      (fields ?? '')
        .split(',')
        .map((field) => field.trim())
        .filter((field) => field),
    ),
  );
}

/**
 * Checks fields and passes the other parameters to the checks of /search, see
 * StationQueryPipe.
 */
@Injectable()
export class FacetsQueryPipe implements PipeTransform<
  Record<string, unknown>,
  FacetsQuery
> {
  private readonly stationQueryPipe = new StationQueryPipe();

  transform(query: Record<string, unknown>): FacetsQuery {
    const { fields, ...filters } = query;
    if (fields !== undefined && typeof fields !== 'string') {
      throw new BadRequestException('Parameter fields must be a single value');
    }
    const list = fieldList(fields);
    if (!list.length) {
      throw new BadRequestException('missing fields');
    }
    const unsupported = list.find((field) => !OPTION_PARAMETERS.has(field));
    if (unsupported) {
      throw new BadRequestException(`unsupported field ${unsupported}`);
    }
    this.stationQueryPipe.transform(filters);
    return query as unknown as FacetsQuery;
  }
}

/** GET /facets, the values of fields among the hits of the filters of /search. */
@Controller('facets')
@ApiTags('Facetten')
@ApiExtraModels(Facet)
export class FacetsController {
  private readonly logger = new Logger(FacetsController.name);

  constructor(private readonly stationStore: StationStore) {}

  @Get()
  @ApiOperation({
    description:
      'Die Werte der angefragten Felder unter den Treffern der Filter von /search, mit der Anzahl der Treffer je Wert, für eine Facettensuche. Jedes Feld zählt ohne den Filter auf sich selbst, so lässt sich ein gewählter Wert gegen einen anderen tauschen (z.B. listet <code>fields=land,kreis&land=Bayern&match=exact</code> alle Bundesländer, aber nur die Kreise in Bayern).',
  })
  @ApiResponse({
    status: 200,
    description: 'Die Anzahl der Treffer und die Werte je Feld',
    type: FacetsResponse,
  })
  @ApiResponse({
    status: 400,
    description:
      'Fehlende oder nicht unterstützte Felder oder ungültige Suchparameter wie bei /search',
  })
  findAll(@Query(FacetsQueryPipe) query: FacetsQuery): FacetsResponse {
    this.logger.log(`Facets with ${JSON.stringify(query)}`);
    const { fields, ...filters } = query;
    return facets(
      this.stationStore.getAll(),
      filters,
      fieldList(fields) as OptionParameter[],
    );
  }
}
