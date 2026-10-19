import { Controller, Get, Logger, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { map, Observable } from 'rxjs';

import {
  AggregatedStationResponse,
  StationQuery,
  StationsService,
} from '../stations/stations.service';
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
  ): Observable<AggregatedStationResponse> {
    return this.stationsSrvc
      .getStations(query)
      .pipe(map((st) => this.stationsSrvc.prepareResponse(st)));
  }
}
