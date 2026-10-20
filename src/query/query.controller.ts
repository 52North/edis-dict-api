import { Controller, Get, Logger, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { AggregatedStationResponse } from '../stations/station.model';
import { StationsService } from '../stations/stations.service';
import { StationQuery } from './station-query';
import { StationQueryPipe } from './station-query.pipe';

@Controller('search')
@ApiTags('Suche')
export class QueryController {
  private readonly logger = new Logger(QueryController.name);

  constructor(private stationsSrvc: StationsService) {}

  @Get()
  @ApiOperation({
    description:
      'Durchsuchen der Pegelonline-Stationen mit einer Liste an optionalen Suchparametern. Bei Angabe mehrerer Parameter werden diese mit UND verknüpft.',
  })
  @ApiResponse({
    status: 200,
    description: 'Liste von aufbereiteten Stationen',
    type: AggregatedStationResponse,
  })
  @ApiResponse({
    status: 400,
    description:
      'Ungültige Suchparameter, z. B. eine falsch aufgebaute bbox oder ein mehrfach angegebener Parameter',
  })
  search(
    @Query(StationQueryPipe) query: StationQuery,
  ): AggregatedStationResponse {
    this.logger.log(`Search with ${JSON.stringify(query)}`);
    return this.stationsSrvc.prepareResponse(
      this.stationsSrvc.getStations(query),
    );
  }
}
