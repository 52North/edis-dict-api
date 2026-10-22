import { ConfigService } from '@nestjs/config';

import { STATIONS } from '../../test/fixtures';
import { StationQuery } from '../query/station-query';
import { StationStore } from './station-store';
import { StationsService } from './stations.service';

describe('StationsService', () => {
  let service: StationsService;

  beforeEach(() => {
    const config: Record<string, string> = {
      PEGELONLINE_BASE_URL: 'http://pegelonline',
    };
    service = new StationsService(
      { getAll: () => STATIONS } as unknown as StationStore,
      {
        get: (key: string, defaultValue?: string) =>
          config[key] ?? defaultValue,
      } as ConfigService,
    );
  });

  const search = (query: StationQuery) =>
    service.getStations(query).map((st) => st.uuid);

  it.each<[string, StationQuery, string[]]>([
    [
      'no parameter',
      {},
      ['koeln', 'herbrum', 'genthin', 'dresden', 'rossdorf'],
    ],
    ['station', { station: 'köln' }, ['koeln']],
    ['station without coordinates', { station: 'roßdorf' }, ['rossdorf']],
    ['number', { number: '2730010' }, ['koeln']],
    ['number by part of the number', { number: '2730' }, []],
    ['gewaesser by short name', { gewaesser: 'rhein' }, ['koeln']],
    ['gewaesser by synonym', { gewaesser: 'Rhine' }, ['koeln']],
    [
      'gewaesser by whole long name',
      { gewaesser: 'dortmund-ems-kanal' },
      ['herbrum'],
    ],
    ['gewaesser by part of the long name', { gewaesser: 'Dortmund' }, []],
    [
      'gewaesser without canals named after it',
      { gewaesser: 'Elbe' },
      ['dresden'],
    ],
    [
      'gewaesser including stations without coordinates',
      { gewaesser: 'elbe-havel-kanal' },
      ['genthin', 'rossdorf'],
    ],
    ['land', { land: 'sachsen' }, ['herbrum', 'genthin', 'dresden']],
    ['kreis by alternative', { kreis: 'koeln' }, ['koeln']],
    ['country by alternative', { country: 'germany' }, ['koeln']],
    ['agency', { agency: 'dresden' }, ['dresden']],
    ['einzugsgebiet', { einzugsgebiet: 'rhein' }, ['koeln']],
    ['parameter by short name', { parameter: 'WT' }, ['koeln', 'dresden']],
    [
      'parameter by long name',
      { parameter: 'wassertemperatur' },
      ['koeln', 'dresden'],
    ],
    ['parameter by part of the name', { parameter: 'wasser' }, []],
    [
      'parameter by long name without ROHDATEN',
      { parameter: 'fliessgeschwindigkeit' },
      ['herbrum'],
    ],
    [
      'parameter by whole long name',
      { parameter: 'FLIESSGESCHWINDIGKEIT_ROHDATEN' },
      ['herbrum'],
    ],
    [
      'parameter with space instead of underscore',
      { parameter: 'Fliessgeschwindigkeit Rohdaten' },
      ['herbrum'],
    ],
    ['parameter with ß', { parameter: 'Fließgeschwindigkeit' }, ['herbrum']],
    ['parameter by ROHDATEN only', { parameter: 'rohdaten' }, []],
    ['forecast by short name', { parameter: 'WV' }, ['dresden']],
    [
      'forecast by long name',
      { parameter: 'wasserstandvorhersage' },
      ['dresden'],
    ],
    ['bbox', { bbox: '6,50,8,54' }, ['koeln', 'herbrum']],
    [
      'bbox without stations lacking coordinates',
      { gewaesser: 'elbe-havel-kanal', bbox: '12,52,13,53' },
      ['genthin'],
    ],
    ['q', { q: 'rhein' }, ['koeln']],
    ['q in timeseries', { q: 'wassertemperatur' }, ['koeln', 'dresden']],
    [
      'q in a long name with underscores',
      { q: 'fliessgeschwindigkeit rohdaten' },
      ['herbrum'],
    ],
    ['q in alternatives', { q: 'germany' }, ['koeln']],
    [
      'q in the long name of the water',
      { q: 'havel' },
      ['genthin', 'rossdorf'],
    ],
    ['q in kreis', { q: 'emsland' }, ['herbrum']],
    ['q in number', { q: '2730010' }, ['koeln']],
    ['q in part of the number', { q: '5010' }, ['dresden']],
    ['q and land', { q: 'wassertemperatur', land: 'sachsen' }, ['dresden']],
    ['q and bbox', { q: 'sachsen', bbox: '12,52,13,53' }, ['genthin']],
  ])('filters by %s', (_, query, expected) => {
    expect(search(query)).toEqual(expected);
  });

  it('adds mqtt topics and pegelonline links to the response', () => {
    const response = service.prepareResponse([STATIONS[0]]);

    expect(response.mqtttopics).toEqual(['edis/pegelonline/+/+/+/+/koeln/+']);
    expect(response.pegelonlinelinks).toEqual([
      'http://pegelonline/stations/koeln/W/measurements.json',
      'http://pegelonline/stations/koeln/WT/measurements.json',
    ]);
    expect(response.stations[0].timeseries[1].mqtttopic).toBe(
      'edis/pegelonline/+/+/+/+/koeln/WT',
    );
  });

  it('adds a pegelonline link but no mqtt topic to forecasts', () => {
    const dresden = STATIONS.filter((st) => st.uuid === 'dresden');

    const response = service.prepareResponse(dresden);

    expect(response.pegelonlinelinks).toContain(
      'http://pegelonline/stations/dresden/WV/measurements.json',
    );
    expect(response.stations[0].timeseries[2].shortname).toBe('WV');
    expect(response.stations[0].timeseries[2]).not.toHaveProperty('mqtttopic');
  });
});
