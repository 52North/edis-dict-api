import { HttpService } from '@nestjs/axios';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosResponse } from 'axios';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { firstValueFrom, Observable, of, Subject, throwError } from 'rxjs';

import { createStation, STATIONS } from '../../test/fixtures';
import { AddressData, NominatimService } from '../nominatim/nominatim.service';
import { SearchTermListService } from '../search-term-list/search-term-list';
import {
  PegelonlineStation,
  StationQuery,
  StationsService,
} from './stations.service';

// the cron job of the service would keep jest running
jest.mock('cron');

const square = (
  minLon: number,
  minLat: number,
  maxLon: number,
  maxLat: number,
) => [
  [
    [
      [minLon, minLat],
      [maxLon, minLat],
      [maxLon, maxLat],
      [minLon, maxLat],
      [minLon, minLat],
    ],
  ],
];

const DRAINAGE_AREAS = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { NAME_2500: 'Rhein' },
      geometry: { type: 'MultiPolygon', coordinates: square(6, 50, 8, 52) },
    },
    {
      type: 'Feature',
      properties: { NAME_2500: null, NAME_1000: 'Ems' },
      geometry: { type: 'MultiPolygon', coordinates: square(7, 52.5, 8, 53.5) },
    },
  ],
};

const address = (
  country: string,
  state: string,
  county: string,
  city: string,
): AddressData => ({ id: 'id', country, state, county, city });

const NOT_FOUND = address('', '', '', '');

// fresh pegelonline data of the stations in STATIONS
const fresh = (uuid: string): PegelonlineStation => {
  const {
    shortname,
    longname,
    agency,
    longitude,
    latitude,
    water,
    timeseries,
  } = STATIONS.find((st) => st.uuid === uuid);
  return createStation({
    uuid,
    shortname,
    longname,
    agency,
    longitude,
    latitude,
    water,
    timeseries,
  });
};

describe('StationsService', () => {
  let dir: string;
  let service: StationsService;
  const httpService = { get: jest.fn() };
  const nominatimService = { getAdressData: jest.fn() };
  const searchTermListService = {
    getAlternativeGewaesser: jest.fn(),
    getAlternativeKreise: jest.fn(),
    getAlternativeEinzugsgebiete: jest.fn(),
  };

  const stationsFile = () => join(dir, 'stations.json');

  const createService = () => {
    const config: Record<string, string> = {
      STATIONS_FILE_PATH: stationsFile(),
      EINZUGSGEBIETE_FILE_PATH: join(dir, 'einzugsgebiete.geojson'),
      PEGELONLINE_BASE_URL: 'http://pegelonline',
      ADDITIONAL_HARVEST_LANGUAGE_LIST: 'en,fr',
      RUN_DATA_ENLARGING_ON_INIT: 'false',
    };
    service = new StationsService(
      httpService as unknown as HttpService,
      nominatimService as unknown as NominatimService,
      {
        get: (key: string, defaultValue?: string) =>
          config[key] ?? defaultValue,
      } as ConfigService,
      searchTermListService as unknown as SearchTermListService,
    );
  };

  const storedStations = (): PegelonlineStation[] => service['stations'];

  const harvest = (
    stations: PegelonlineStation[],
    geocode: (lang: string, uuid: string) => Observable<AddressData>,
  ) => {
    httpService.get.mockReturnValue(of({ data: stations } as AxiosResponse));
    nominatimService.getAdressData.mockImplementation(
      (uuid: string, lat: number, lon: number, lang: string) =>
        geocode(lang, uuid),
    );
    service['fetchStations']();
  };

  beforeAll(() => Logger.overrideLogger(false));

  beforeEach(() => {
    jest.clearAllMocks();
    searchTermListService.getAlternativeGewaesser.mockReturnValue(undefined);
    searchTermListService.getAlternativeKreise.mockReturnValue(undefined);
    searchTermListService.getAlternativeEinzugsgebiete.mockReturnValue(
      undefined,
    );
    dir = mkdtempSync(join(tmpdir(), 'stations-service-'));
    writeFileSync(
      join(dir, 'einzugsgebiete.geojson'),
      JSON.stringify(DRAINAGE_AREAS),
    );
    createService();
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  describe('search', () => {
    const search = async (query: StationQuery) =>
      (await firstValueFrom(service.getStations(query))).map((st) => st.uuid);

    beforeEach(() => (service['stations'] = structuredClone(STATIONS)));

    it.each<[string, StationQuery, string[]]>([
      ['no parameter', {}, ['koeln', 'herbrum', 'genthin', 'dresden']],
      ['station', { station: 'köln' }, ['koeln']],
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
      ['bbox', { bbox: '6,50,8,54' }, ['koeln', 'herbrum']],
      ['q', { q: 'rhein' }, ['koeln']],
      ['q in timeseries', { q: 'wassertemperatur' }, ['koeln', 'dresden']],
      ['q and land', { q: 'wassertemperatur', land: 'sachsen' }, ['dresden']],
      ['q and bbox', { q: 'sachsen', bbox: '12,52,13,53' }, ['genthin']],
    ])('filters by %s', async (_, query, expected) => {
      expect(await search(query)).toEqual(expected);
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
  });

  describe('harvest', () => {
    it('enriches the stations with address, synonyms and drainage area', () => {
      searchTermListService.getAlternativeGewaesser.mockReturnValue(['Rhine']);
      searchTermListService.getAlternativeKreise.mockReturnValue(['K']);

      harvest([fresh('koeln')], (lang) =>
        of(
          lang === 'de'
            ? address('Deutschland', 'Nordrhein-Westfalen', undefined, 'Köln')
            : address(
                'Germany',
                'North Rhine-Westphalia',
                undefined,
                'Cologne',
              ),
        ),
      );

      expect(storedStations()).toEqual([
        expect.objectContaining({
          uuid: 'koeln',
          country: 'Deutschland',
          country_alternatives: ['Germany'],
          land: 'Nordrhein-Westfalen',
          land_alternatives: ['North Rhine-Westphalia'],
          kreis: 'Köln',
          kreis_alternatives: ['Koeln', 'Cologne', 'K'],
          city: 'Köln',
          city_alternatives: ['Koeln', 'Cologne'],
          water_alternatives: ['Rhine'],
          einzugsgebiet: 'Rhein',
        }),
      ]);
      expect(
        searchTermListService.getAlternativeGewaesser,
      ).toHaveBeenCalledWith('RHEIN');
      expect(searchTermListService.getAlternativeKreise).toHaveBeenCalledWith(
        'Köln',
      );
    });

    it.each([
      [
        'in the smaller drainage area if the larger has no name',
        'herbrum',
        'Ems',
      ],
      ['outside of all drainage areas', 'dresden', undefined],
    ])('finds the drainage area %s', (_, uuid, expected) => {
      harvest([fresh(uuid)], () => of(NOT_FOUND));

      expect(storedStations()[0].einzugsgebiet).toBe(expected);
    });

    it.each<[string, () => Observable<AddressData>]>([
      ['nothing was found', () => of(NOT_FOUND)],
      [
        'the response has no country',
        () => of(address(undefined, 'Nordrhein-Westfalen', undefined, 'Köln')),
      ],
      [
        'all requests fail',
        () => throwError(() => new Error('Request failed')),
      ],
    ])('keeps the previous address if %s', (_, geocode) => {
      service['stations'] = structuredClone(STATIONS.slice(0, 1));
      searchTermListService.getAlternativeGewaesser.mockReturnValue(['Rhine']);

      harvest([{ ...fresh('koeln'), longname: 'KÖLN NEU' }], geocode);

      expect(storedStations()).toEqual([
        expect.objectContaining({
          longname: 'KÖLN NEU',
          country: 'Deutschland',
          country_alternatives: ['Germany'],
          land: 'Nordrhein-Westfalen',
          kreis: 'Köln',
          kreis_alternatives: ['Koeln'],
          city: 'Köln',
          water_alternatives: ['Rhine'],
          einzugsgebiet: 'Rhein',
        }),
      ]);
    });

    it('updates the address if only an additional language fails', () => {
      service['stations'] = structuredClone(STATIONS.slice(0, 1));

      harvest([fresh('koeln')], (lang) => {
        if (lang === 'en') {
          return throwError(() => new Error('Request failed'));
        }
        return of(
          lang === 'de'
            ? address('Deutschland', 'Nordrhein-Westfalen', undefined, 'Köln')
            : address(
                'Allemagne',
                'Rhénanie-du-Nord-Westphalie',
                undefined,
                'Cologne',
              ),
        );
      });

      expect(storedStations()).toEqual([
        expect.objectContaining({
          country: 'Deutschland',
          country_alternatives: ['Allemagne'],
          land_alternatives: ['Rhénanie-du-Nord-Westphalie'],
          kreis_alternatives: ['Koeln', 'Cologne'],
          city_alternatives: ['Koeln', 'Cologne'],
        }),
      ]);
    });

    it('adds a new station without address if the geocoding fails', () => {
      harvest([fresh('koeln')], () => of(NOT_FOUND));

      expect(storedStations()).toEqual([
        expect.objectContaining({ uuid: 'koeln', einzugsgebiet: 'Rhein' }),
      ]);
      expect(storedStations()[0].country).toBeUndefined();
    });

    it('removes stations which pegelonline no longer delivers', () => {
      service['stations'] = structuredClone(STATIONS);

      harvest([fresh('koeln')], () => of(NOT_FOUND));

      expect(storedStations().map((st) => st.uuid)).toEqual(['koeln']);
    });

    it('skips stations without coordinates', () => {
      const withoutCoordinates = createStation({
        uuid: 'nowhere',
        latitude: undefined,
        longitude: undefined,
      });

      harvest([fresh('koeln'), withoutCoordinates], () => of(NOT_FOUND));

      expect(storedStations().map((st) => st.uuid)).toEqual(['koeln']);
      expect(nominatimService.getAdressData).not.toHaveBeenCalledWith(
        'nowhere',
        expect.anything(),
        expect.anything(),
        expect.anything(),
      );
    });

    it('requests the stations from pegelonline with a timeout', () => {
      harvest([], () => of(NOT_FOUND));

      expect(httpService.get).toHaveBeenCalledWith(
        'http://pegelonline/stations.json?includeTimeseries=true',
        { timeout: 60000 },
      );
    });

    it('skips a harvest while another one is running', () => {
      const pending = new Subject<AddressData>();
      harvest([fresh('koeln')], (lang) =>
        lang === 'de' ? pending : of(NOT_FOUND),
      );

      service['fetchStations']();
      expect(httpService.get).toHaveBeenCalledTimes(1);

      pending.next(NOT_FOUND);
      pending.complete();
      service['fetchStations']();
      expect(httpService.get).toHaveBeenCalledTimes(2);
    });

    it.each<[string, () => Observable<AxiosResponse>]>([
      [
        'pegelonline fails',
        () => throwError(() => new Error('Request failed')),
      ],
      [
        'pegelonline delivers no stations',
        () => of({ data: [] } as AxiosResponse),
      ],
    ])('allows the next harvest if %s', (_, response) => {
      httpService.get.mockImplementation(response);

      service['fetchStations']();
      service['fetchStations']();

      expect(httpService.get).toHaveBeenCalledTimes(2);
    });

    it('writes stations.json once at the end of the harvest', async () => {
      const save = jest.spyOn(service as any, 'saveFetchedStations');

      harvest([fresh('koeln'), fresh('herbrum')], () => of(NOT_FOUND));

      expect(save).toHaveBeenCalledTimes(1);
      await waitFor(() => existsSync(stationsFile()));
      const saved = JSON.parse(readFileSync(stationsFile(), 'utf-8'));
      expect(saved.map((st: PegelonlineStation) => st.uuid)).toEqual([
        'koeln',
        'herbrum',
      ]);
      expect(existsSync(`${stationsFile()}.tmp`)).toBe(false);
    });
  });

  describe('loading stations.json', () => {
    it('removes empty entries stored by older harvests', async () => {
      const pellworm = createStation({
        uuid: 'pellworm',
        kreis: 'Nordfriesland',
        kreis_alternatives: [null, 'NF', ''],
      });
      writeFileSync(stationsFile(), JSON.stringify([pellworm]));

      await service['loadStations']();

      expect(storedStations()[0].kreis_alternatives).toEqual(['NF']);
      const found = await firstValueFrom(service.getStations({ q: 'nf' }));
      expect(found.map((st) => st.uuid)).toEqual(['pellworm']);
    });

    it.each([
      ['the file is missing', undefined],
      ['the file is invalid', '{ invalid'],
    ])('starts without stations if %s', async (_, content) => {
      if (content) {
        writeFileSync(stationsFile(), content);
      }

      await service['loadStations']();

      expect(storedStations()).toEqual([]);
    });
  });

  describe('transcriptions', () => {
    it.each([
      ['Lüneburg-Böhme', ['Lueneburg-Boehme']],
      ['Größenhain', ['Groessenhain']],
      ['Österreich', ['Oesterreich']],
      ['Mecklenburg-Vorpommern', undefined],
      [undefined, undefined],
    ])('transcribes %s', (text, expected) => {
      expect(service['getTranscriptions'](text)).toEqual(expected);
    });
  });
});

async function waitFor(condition: () => boolean, timeoutMs = 2000) {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('condition not met in time');
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
