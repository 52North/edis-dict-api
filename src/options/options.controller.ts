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
  ApiQuery,
  ApiResponse,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';

import { LANGUAGE_TAG } from '../query/station-query';
import { StationsService } from '../stations/stations.service';
import {
  flatOptions,
  groupOptions,
  OPTION_GROUPS,
  OPTION_PARAMETERS,
  OptionGroup,
  OptionParameter,
} from './option-values';

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
    const optionsByStation = this.stationsSrvc
      .getStations()
      .map((st) =>
        OPTION_GROUPS[query.parameter as OptionParameter](
          st,
          query.lang || undefined,
        ),
      );
    return query.grouped === 'true'
      ? groupOptions(optionsByStation)
      : flatOptions(optionsByStation.flat());
  }
}
