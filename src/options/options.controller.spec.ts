import { HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { STATIONS } from '../../test/fixtures';
import { StationsService } from '../stations/stations.service';
import { OptionsController } from './options.controller';

describe('OptionsController', () => {
  let controller: OptionsController;
  const stationsService = { getStations: jest.fn(() => STATIONS) };

  const options = (parameter: string) => controller.findAll({ parameter });
  const grouped = (parameter: string) =>
    controller.findAll({ parameter, grouped: 'true' });

  beforeAll(() => Logger.overrideLogger(false));

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OptionsController],
      providers: [{ provide: StationsService, useValue: stationsService }],
    }).compile();

    controller = module.get<OptionsController>(OptionsController);
  });

  it.each([
    ['station', ['DRESDEN', 'GENTHIN', 'HERBRUM', 'KÖLN', 'Roßdorf']],
    ['number', ['2730010', '3770030', '501060', '587535', '587717']],
    [
      'agency',
      ['DRESDEN', 'MAGDEBURG', 'MEPPEN', 'RHEIN', 'STANDORT BRANDENBURG'],
    ],
    ['gewaesser', ['DEK', 'EHK', 'ELBE', 'Elb', 'RHEIN', 'Rhine']],
    ['kreis', ['Dresden', 'Koeln', 'Köln', 'Landkreis Emsland']],
    [
      'land',
      ['Niedersachsen', 'Nordrhein-Westfalen', 'Sachsen', 'Sachsen-Anhalt'],
    ],
    ['country', ['Deutschland', 'Germany']],
    ['einzugsgebiet', ['Rhein']],
    [
      'parameter',
      [
        'FLIESSGESCHWINDIGKEIT',
        'VA',
        'W',
        'WASSERSTAND',
        'WASSERSTANDVORHERSAGE',
        'WASSERTEMPERATUR',
        'WT',
        'WV',
      ],
    ],
  ])(
    'lists the sorted values and alternatives for %s',
    (parameter, expected) => {
      expect(options(parameter)).toEqual(expected);
    },
  );

  it.each([
    [
      'kreis',
      [
        { value: 'Dresden', alternatives: [] },
        { value: 'Köln', alternatives: ['Koeln'] },
        { value: 'Landkreis Emsland', alternatives: [] },
      ],
    ],
    [
      'gewaesser',
      [
        // the alternative DEK equals the value and is left out
        { value: 'DEK', alternatives: [] },
        { value: 'EHK', alternatives: [] },
        { value: 'ELBE', alternatives: ['Elb'] },
        { value: 'RHEIN', alternatives: ['Rhine'] },
      ],
    ],
    [
      'parameter',
      [
        { value: 'FLIESSGESCHWINDIGKEIT', alternatives: ['VA'] },
        { value: 'WASSERSTAND', alternatives: ['W'] },
        { value: 'WASSERSTANDVORHERSAGE', alternatives: ['WV'] },
        { value: 'WASSERTEMPERATUR', alternatives: ['WT'] },
      ],
    ],
    [
      // Roßdorf has no coordinates and therefore no land
      'land',
      [
        { value: 'Niedersachsen', alternatives: [] },
        { value: 'Nordrhein-Westfalen', alternatives: [] },
        { value: 'Sachsen', alternatives: [] },
        { value: 'Sachsen-Anhalt', alternatives: [] },
      ],
    ],
  ])('groups the alternatives by value for %s', (parameter, expected) => {
    expect(grouped(parameter)).toEqual(expected);
  });

  it('lists the flat values with grouped=false', () => {
    expect(
      controller.findAll({ parameter: 'country', grouped: 'false' }),
    ).toEqual(['Deutschland', 'Germany']);
  });

  it.each(['yes', '', 'TRUE'])('rejects grouped=%s', (value) => {
    expect(() =>
      controller.findAll({ parameter: 'country', grouped: value }),
    ).toThrow(
      new HttpException(
        'grouped must be true or false',
        HttpStatus.BAD_REQUEST,
      ),
    );
  });

  it('rejects a missing parameter', () => {
    expect(() => controller.findAll({ parameter: undefined })).toThrow(
      new HttpException('missing parameter', HttpStatus.BAD_REQUEST),
    );
  });

  it.each(['unknown', 'q', 'constructor'])(
    'rejects the unsupported parameter %s',
    (parameter) => {
      expect(() => options(parameter)).toThrow(
        new HttpException('unsupported parameter', HttpStatus.BAD_REQUEST),
      );
    },
  );
});
