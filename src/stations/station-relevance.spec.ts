import {
  createStation,
  WATER_LEVEL,
  WATER_TEMPERATURE,
} from '../../test/fixtures';
import { relevance, sortByRelevance } from './station-relevance';
import { PegelonlineStation } from './station.model';

describe('relevance', () => {
  it.each<[string, Partial<PegelonlineStation>, string, number]>([
    ['the exact name', { shortname: 'KÖLN' }, 'köln', 0],
    ['the exact long name', { longname: 'ROSSDORF' }, 'rossdorf', 0],
    ['the number', { number: '2730010' }, '2730010', 0],
    ['the exact water', { water_alternatives: ['Rhine'] }, 'rhine', 1],
    ['the exact county', { kreis: 'Köln' }, 'köln', 2],
    [
      'the exact city by alternative',
      { city_alternatives: ['Koeln'] },
      'koeln',
      2,
    ],
    ['the exact land', { land: 'Sachsen' }, 'sachsen', 3],
    ['the exact agency', { agency: 'DRESDEN' }, 'dresden', 3],
    [
      'a parameter by long name',
      { timeseries: [WATER_TEMPERATURE] },
      'Wassertemperatur',
      3,
    ],
    [
      'a parameter without ROHDATEN',
      { timeseries: [WATER_LEVEL] },
      'wasserstand',
      3,
    ],
    ['a parameter by short name', { timeseries: [WATER_TEMPERATURE] }, 'wt', 3],
    ['the start of the name', { shortname: 'MAINZ' }, 'main', 4],
    ['a part of the name', { shortname: 'FRANKFURT OSTHAFEN' }, 'hafen', 5],
    [
      'a part of the water',
      { water: { shortname: 'EHK', longname: 'ELBE-HAVEL-KANAL' } },
      'elbe',
      6,
    ],
    ['a part of the county', { kreis: 'Landkreis Mainz-Bingen' }, 'mainz', 7],
    ['a part of the land', { land: 'Niedersachsen' }, 'sachsen', 8],
    ['a part of the agency', { agency: 'STANDORT KÖLN' }, 'köln', 8],
  ])('ranks %s', (_, station, q, tier) => {
    expect(relevance(createStation(station), q)).toBe(tier);
  });

  it('takes the best tier of a station', () => {
    const station = createStation({
      shortname: 'MAINFLINGEN',
      water: { shortname: 'MAIN', longname: 'MAIN' },
    });

    expect(relevance(station, 'main')).toBe(1);
  });
});

describe('sortByRelevance', () => {
  it('keeps the order of stations of the same tier', () => {
    const stations = [
      createStation({ uuid: 'niedersachsen', land: 'Niedersachsen' }),
      createStation({ uuid: 'sachsen', land: 'Sachsen' }),
      createStation({ uuid: 'sachsen-anhalt', land: 'Sachsen-Anhalt' }),
      createStation({ uuid: 'dresden', land: 'sachsen' }),
    ];

    expect(sortByRelevance(stations, 'sachsen').map((st) => st.uuid)).toEqual([
      'sachsen',
      'dresden',
      'niedersachsen',
      'sachsen-anhalt',
    ]);
  });
});
