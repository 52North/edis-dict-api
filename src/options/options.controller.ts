import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Logger,
  Query,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';

import { StationQuery } from '../query/station-query';
import { PegelonlineStation } from '../stations/station.model';
import { StationsService } from '../stations/stations.service';

type OptionParameter = Exclude<keyof StationQuery, 'q' | 'bbox'>;

// the values of a search parameter, with the alternative names the search also finds
const OPTION_VALUES: Record<
  OptionParameter,
  (station: PegelonlineStation) => string[]
> = {
  station: (st) => [st.shortname],
  agency: (st) => [st.agency],
  gewaesser: (st) => [st.water.shortname, ...(st.water_alternatives ?? [])],
  kreis: (st) => [st.kreis, ...(st.kreis_alternatives ?? [])],
  land: (st) => [st.land, ...(st.land_alternatives ?? [])],
  country: (st) => [st.country, ...(st.country_alternatives ?? [])],
  einzugsgebiet: (st) => [
    st.einzugsgebiet,
    ...(st.einzugsgebiet_alternatives ?? []),
  ],
  parameter: (st) => st.timeseries.flatMap((ts) => [ts.longname, ts.shortname]),
};
// a set, so names of the object prototype like "constructor" are no parameters
const OPTION_PARAMETERS = new Set(Object.keys(OPTION_VALUES));

@Controller('options')
@ApiExcludeController()
export class OptionsController {
  private readonly logger = new Logger(OptionsController.name);

  constructor(private stationsSrvc: StationsService) {}

  @Get()
  findAll(@Query() query: { parameter: string }) {
    if (!query.parameter) {
      throw new HttpException('missing parameter', HttpStatus.BAD_REQUEST);
    }
    this.logger.log(query.parameter);
    if (!OPTION_PARAMETERS.has(query.parameter)) {
      throw new HttpException('unsupported parameter', HttpStatus.BAD_REQUEST);
    }
    const values = OPTION_VALUES[query.parameter as OptionParameter];
    const all = this.stationsSrvc.getStations().flatMap(values);
    return Array.from(new Set(all.filter((value) => value))).sort();
  }
}
