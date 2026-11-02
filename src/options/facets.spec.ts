import { createStation, STATIONS, WATER_LEVEL } from '../../test/fixtures';
import { StationQuery } from '../query/station-query';
import { searchStations } from '../stations/station-filter';
import { PegelonlineTimeseries } from '../stations/station.model';
import { facets } from './facets';

describe('facets', () => {
  const values = (
    query: StationQuery,
    field: Parameters<typeof facets>[2][number],
  ) =>
    facets(STATIONS, query, [field]).facets[field]?.values.map(
      ({ value, count }) => [value, count],
    );

  it('counts the hits of all filters like the search', () => {
    for (const query of [
      {},
      { land: 'sachsen' },
      { land: 'Sachsen', match: 'exact' as const },
      { parameter: 'WT' },
      { q: 'elbe', gewaesser: 'EHK' },
    ]) {
      expect(facets(STATIONS, query, ['land']).count).toBe(
        searchStations(STATIONS, query).length,
      );
    }
  });

  it('lists the values of all stations without filter, with the hits without one', () => {
    expect(facets(STATIONS, {}, ['land']).facets.land).toEqual({
      values: [
        expect.objectContaining({ value: 'Niedersachsen', count: 1 }),
        expect.objectContaining({ value: 'Nordrhein-Westfalen', count: 1 }),
        expect.objectContaining({ value: 'Sachsen', count: 1 }),
        expect.objectContaining({ value: 'Sachsen-Anhalt', count: 1 }),
      ],
      // Roßdorf has no coordinates and therefore no land
      missing: 1,
    });
  });

  it('counts a field without the filter on itself, the others with it', () => {
    const result = facets(STATIONS, { land: 'Sachsen', match: 'exact' }, [
      'land',
      'kreis',
    ]);

    expect(result.count).toBe(1);
    expect(result.facets.land?.values).toHaveLength(4);
    expect(result.facets.kreis).toEqual({
      values: [{ value: 'Dresden', count: 1, alternatives: [], names: {} }],
      missing: 0,
    });
  });

  it('narrows the other fields by a filter of parts of names', () => {
    expect(values({ land: 'sachsen' }, 'kreis')).toEqual([
      ['Dresden', 1],
      ['Landkreis Emsland', 1],
    ]);
    // Genthin in Sachsen-Anhalt has no kreis
    expect(
      facets(STATIONS, { land: 'sachsen' }, ['kreis']).facets.kreis?.missing,
    ).toBe(1);
  });

  it('sorts by count, then by name', () => {
    expect(values({ gewaesser: 'EHK' }, 'gewaesser')).toEqual([
      ['EHK', 2],
      ['DEK', 1],
      ['ELBE', 1],
      ['RHEIN', 1],
    ]);
    expect(values({}, 'parameter')).toEqual([
      ['WASSERSTAND', 5],
      ['WASSERTEMPERATUR', 2],
      ['FLIESSGESCHWINDIGKEIT', 1],
      ['WASSERSTANDVORHERSAGE', 1],
    ]);
  });

  it('sorts names in German order', () => {
    const stations = [
      createStation({ uuid: 'konstanz', shortname: 'KONSTANZ' }),
      createStation({ uuid: 'koeln', shortname: 'KÖLN' }),
    ];

    expect(
      facets(stations, {}, ['station']).facets.station?.values.map(
        (v) => v.value,
      ),
    ).toEqual(['KÖLN', 'KONSTANZ']);
  });

  it('counts a station once per value, with the alternatives of all', () => {
    const raw = {
      shortname: 'WR',
      longname: 'WASSERSTAND_ROHDATEN',
    } as PegelonlineTimeseries;
    const stations = [
      createStation({ timeseries: [WATER_LEVEL, raw] }),
      createStation({ uuid: 'other' }),
    ];

    expect(
      facets(stations, {}, ['parameter']).facets.parameter?.values,
    ).toEqual([
      { value: 'WASSERSTAND', count: 2, alternatives: ['W', 'WR'], names: {} },
    ]);
  });

  it('limits alternatives and names to the language', () => {
    const stations = [
      createStation({
        land: 'Bayern',
        land_alternatives: ['BY', 'Bavaria', 'Bawaria'],
        land_names: { en: 'Bavaria', pl: 'Bawaria' },
      }),
    ];

    expect(
      facets(stations, { lang: 'en' }, ['land']).facets.land?.values,
    ).toEqual([
      {
        value: 'Bayern',
        count: 1,
        alternatives: ['BY', 'Bavaria'],
        names: { en: 'Bavaria' },
      },
    ]);
  });

  it('lists the places among the hits', () => {
    const result = facets(
      STATIONS,
      { land: 'Nordrhein-Westfalen', match: 'exact' },
      ['ort'],
    );

    expect(result.facets.ort).toEqual({
      values: [{ value: 'Köln', count: 1, alternatives: ['Koeln'], names: {} }],
      missing: 0,
    });
  });

  it('lists only the requested fields', () => {
    expect(Object.keys(facets(STATIONS, {}, ['kreis', 'land']).facets)).toEqual(
      ['kreis', 'land'],
    );
  });
});
