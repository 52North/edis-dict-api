import { Test, TestingModule } from '@nestjs/testing';
import { firstValueFrom, of } from 'rxjs';

import { STATIONS } from '../../test/fixtures';
import {
  AggregatedStationResponse,
  StationsService,
} from '../stations/stations.service';
import { QueryController } from './query.controller';

describe('QueryController', () => {
  let controller: QueryController;
  const stationsService = {
    getStations: jest.fn(),
    prepareResponse: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [QueryController],
      providers: [{ provide: StationsService, useValue: stationsService }],
    }).compile();

    controller = module.get<QueryController>(QueryController);
  });

  it('searches with the query and returns the prepared response', async () => {
    const response = { stations: STATIONS } as AggregatedStationResponse;
    stationsService.getStations.mockReturnValue(of(STATIONS));
    stationsService.prepareResponse.mockReturnValue(response);

    expect(await firstValueFrom(controller.search({ q: 'köln' }))).toBe(
      response,
    );
    expect(stationsService.getStations).toHaveBeenCalledWith({ q: 'köln' });
    expect(stationsService.prepareResponse).toHaveBeenCalledWith(STATIONS);
  });
});
