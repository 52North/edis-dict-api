import { HttpModule, HttpService } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { DrainageAreasService } from './harvest/drainage-areas.service';
import { GeocodingService } from './harvest/geocoding.service';
import { HarvestService } from './harvest/harvest.service';
import { SensorWebService } from './harvest/sensorweb.service';
import { NominatimService } from './nominatim/nominatim.service';
import { FacetsController } from './options/facets.controller';
import { OptionsController } from './options/options.controller';
import { QueryController } from './query/query.controller';
import { limitConcurrentRequests } from './request-limiter';
import { SearchTermListService } from './search-term-list/search-term-list';
import { StationStore } from './stations/station-store';
import { StationsService } from './stations/stations.service';
import { validateConfig } from './validate-config';

/**
 * Limits the concurrent outgoing requests of the shared HttpService, which the
 * harvest uses for pegelonline, nominatim and the Sensor Web API, to MAX_REQUESTS_COUNT (99 if
 * unset, .env.example sets 5).
 */
@Module({
  imports: [
    HttpModule.register({
      maxRedirects: 5,
    }),
    ConfigModule.forRoot({ validate: validateConfig }),
  ],
  controllers: [QueryController, OptionsController, FacetsController],
  providers: [
    StationsService,
    StationStore,
    HarvestService,
    GeocodingService,
    DrainageAreasService,
    SensorWebService,
    NominatimService,
    SearchTermListService,
  ],
})
export class AppModule {
  constructor(configService: ConfigService, httpService: HttpService) {
    limitConcurrentRequests(
      httpService.axiosRef,
      Number(configService.get('MAX_REQUESTS_COUNT', 99)),
    );
  }
}
