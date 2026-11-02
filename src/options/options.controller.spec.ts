import { HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { createStation, STATIONS } from '../../test/fixtures';
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
    ['ort', ['Koeln', 'Köln']],
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
        { value: 'Dresden', alternatives: [], names: {} },
        { value: 'Köln', alternatives: ['Koeln'], names: {} },
        { value: 'Landkreis Emsland', alternatives: [], names: {} },
      ],
    ],
    [
      'gewaesser',
      [
        // the alternative DEK equals the value and is left out
        { value: 'DEK', alternatives: [], names: {} },
        { value: 'EHK', alternatives: [], names: {} },
        { value: 'ELBE', alternatives: ['Elb'], names: {} },
        { value: 'RHEIN', alternatives: ['Rhine'], names: {} },
      ],
    ],
    [
      'parameter',
      [
        { value: 'FLIESSGESCHWINDIGKEIT', alternatives: ['VA'], names: {} },
        { value: 'WASSERSTAND', alternatives: ['W'], names: {} },
        { value: 'WASSERSTANDVORHERSAGE', alternatives: ['WV'], names: {} },
        { value: 'WASSERTEMPERATUR', alternatives: ['WT'], names: {} },
      ],
    ],
    [
      // Roßdorf has no coordinates and therefore no land
      'land',
      [
        { value: 'Niedersachsen', alternatives: [], names: {} },
        { value: 'Nordrhein-Westfalen', alternatives: [], names: {} },
        { value: 'Sachsen', alternatives: [], names: {} },
        { value: 'Sachsen-Anhalt', alternatives: [], names: {} },
      ],
    ],
  ])('groups the alternatives by value for %s', (parameter, expected) => {
    expect(grouped(parameter)).toEqual(expected);
  });

  describe('names and lang', () => {
    // two stations in Bayern, the second names it differently in Polish
    const NAMED = [
      createStation({
        land: 'Bayern',
        land_alternatives: ['BY', 'Bavaria', 'Bawaria'],
        land_names: { en: 'Bavaria', pl: 'Bawaria' },
        water: { shortname: 'DONAU', longname: 'DONAU' },
        water_alternatives: ['Danube'],
        water_names: { en: 'Danube' },
      }),
      createStation({
        land: 'Bayern',
        land_alternatives: ['Bawarii'],
        land_names: { pl: 'Bawarii', 'de-AT': 'Bayern (AT)' },
      }),
      createStation({ land: 'Hessen' }),
    ];

    beforeEach(() => stationsService.getStations.mockReturnValue(NAMED));

    afterEach(() =>
      stationsService.getStations.mockImplementation(() => STATIONS),
    );

    const withLang = (parameter: string, lang: string, grouped?: string) =>
      controller.findAll({ parameter, grouped, lang });

    it('groups the names by language of all stations, the first one winning', () => {
      expect(grouped('land')).toEqual([
        {
          value: 'Bayern',
          alternatives: ['BY', 'Bavaria', 'Bawaria', 'Bawarii'],
          names: { en: 'Bavaria', pl: 'Bawaria', 'de-AT': 'Bayern (AT)' },
        },
        { value: 'Hessen', alternatives: [], names: {} },
      ]);
    });

    it('lists the names of the water', () => {
      expect(grouped('gewaesser')).toContainEqual({
        value: 'DONAU',
        alternatives: ['Danube'],
        names: { en: 'Danube' },
      });
    });

    it('limits alternatives and names to the language', () => {
      expect(withLang('land', 'en', 'true')).toEqual([
        {
          value: 'Bayern',
          alternatives: ['BY', 'Bavaria'],
          names: { en: 'Bavaria' },
        },
        { value: 'Hessen', alternatives: [], names: {} },
      ]);
    });

    it('takes the language without region', () => {
      expect(withLang('land', 'de-CH', 'true')[0]).toEqual({
        value: 'Bayern',
        alternatives: ['BY'],
        names: { 'de-AT': 'Bayern (AT)' },
      });
    });

    it('limits the flat list to the language', () => {
      expect(withLang('land', 'en')).toEqual([
        'BY',
        'Bavaria',
        'Bayern',
        'Hessen',
      ]);
    });

    it('takes an empty lang as not set', () => {
      expect(withLang('land', '', 'true')).toEqual(grouped('land'));
    });

    it.each<[string, unknown]>([
      ['a language name', 'english'],
      ['an underscore', 'de_CH'],
      ['a repeated lang', ['en', 'de']],
    ])('rejects %s as lang', (_, lang) => {
      expect(() =>
        controller.findAll({ parameter: 'land', lang: lang as string }),
      ).toThrow(
        new HttpException(
          'lang must be a language like en or de-CH',
          HttpStatus.BAD_REQUEST,
        ),
      );
    });
  });

  it('groups the places with their alternatives', () => {
    expect(grouped('ort')).toEqual([
      { value: 'Köln', alternatives: ['Koeln'], names: {} },
    ]);
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
