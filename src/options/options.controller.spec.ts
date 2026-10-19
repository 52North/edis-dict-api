import { HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { firstValueFrom, of } from 'rxjs';

import { STATIONS } from '../../test/fixtures';
import { StationsService } from '../stations/stations.service';
import { OptionsController } from './options.controller';

describe('OptionsController', () => {
  let controller: OptionsController;
  const stationsService = { getStations: jest.fn(() => of(STATIONS)) };

  const options = (parameter: string) =>
    firstValueFrom(controller.findAll({ parameter }));

  beforeAll(() => Logger.overrideLogger(false));

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OptionsController],
      providers: [{ provide: StationsService, useValue: stationsService }],
    }).compile();

    controller = module.get<OptionsController>(OptionsController);
  });

  it.each([
    ['gewaesser', ['DEK', 'EHK', 'ELBE', 'Elb', 'RHEIN', 'Rhine']],
    ['kreis', ['Dresden', 'Koeln', 'Köln', 'Landkreis Emsland']],
    ['country', ['Deutschland', 'Germany']],
    ['parameter', ['W', 'WASSERSTAND ROHDATEN', 'WASSERTEMPERATUR', 'WT']],
  ])(
    'lists the sorted values and alternatives for %s',
    async (parameter, expected) => {
      expect(await options(parameter)).toEqual(expected);
    },
  );

  it('rejects a missing parameter', () => {
    expect(() => controller.findAll({ parameter: undefined })).toThrow(
      new HttpException('missing parameter', HttpStatus.BAD_REQUEST),
    );
  });

  it('rejects an unsupported parameter', async () => {
    await expect(options('unknown')).rejects.toThrow(
      new HttpException('unsupported parameter', HttpStatus.BAD_REQUEST),
    );
  });
});
