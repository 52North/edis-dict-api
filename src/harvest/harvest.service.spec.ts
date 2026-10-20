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
import { Observable, of, Subject, throwError } from 'rxjs';

import { createStation, STATIONS } from '../../test/fixtures';
import { AddressData, NominatimService } from '../nominatim/nominatim.service';
import { SearchTermListService } from '../search-term-list/search-term-list';
import { StationStore } from '../stations/station-store';
import { PegelonlineStation } from '../stations/station.model';
import { DrainageAreasService } from './drainage-areas.service';
import { GeocodingService } from './geocoding.service';
import { HarvestService } from './harvest.service';

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
  country: string | undefined,
  state: string | undefined,
  county: string | undefined,
  city: string | undefined,
): AddressData => ({ id: 'id', country, state, county, city });

const NOT_FOUND = address('', '', '', '');

// fresh pegelonline data of the stations in STATIONS
const fresh = (uuid: string): PegelonlineStation => {
  const station = STATIONS.find((st) => st.uuid === uuid);
  if (!station) {
    throw new Error(`no station ${uuid} in STATIONS`);
  }
  const {
    shortname,
    longname,
    agency,
    longitude,
    latitude,
    water,
    timeseries,
  } = station;
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

describe('HarvestService', () => {
  let dir: string;
  let store: StationStore;
  let service: HarvestService;
  let replace: jest.SpyInstance<Promise<void>>;
  const httpService = { get: jest.fn() };
  const nominatimService = { getAdressData: jest.fn() };
  const searchTermListService = {
    getAlternativeGewaesser: jest.fn(),
    getAlternativeKreise: jest.fn(),
    getAlternativeEinzugsgebiete: jest.fn(),
  };

  const stationsFile = () => join(dir, 'stations.json');

  // geocoding, drainage areas and store are real, only the external sources are mocked
  const createService = (overrides: Record<string, string> = {}) => {
    const config: Record<string, string> = {
      STATIONS_FILE_PATH: stationsFile(),
      EINZUGSGEBIETE_FILE_PATH: join(dir, 'einzugsgebiete.geojson'),
      PEGELONLINE_BASE_URL: 'http://pegelonline',
      ADDITIONAL_HARVEST_LANGUAGE_LIST: 'en,fr',
      RUN_DATA_ENLARGING_ON_INIT: 'false',
      ...overrides,
    };
    const configService = {
      get: (key: string, defaultValue?: string) => config[key] ?? defaultValue,
    } as ConfigService;
    store = new StationStore(configService);
    replace = jest.spyOn(store, 'replace');
    service = new HarvestService(
      httpService as unknown as HttpService,
      new GeocodingService(
        nominatimService as unknown as NominatimService,
        configService,
      ),
      new DrainageAreasService(configService),
      searchTermListService as unknown as SearchTermListService,
      store,
      configService,
    );
  };

  const storedStations = (): PegelonlineStation[] => store.getAll();

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
    dir = mkdtempSync(join(tmpdir(), 'harvest-service-'));
    writeFileSync(
      join(dir, 'einzugsgebiete.geojson'),
      JSON.stringify(DRAINAGE_AREAS),
    );
    createService();
  });

  // stations.json is saved in the background, the directory must not be removed while writing
  afterEach(async () => {
    await Promise.all(replace.mock.results.map((result) => result.value));
    rmSync(dir, { recursive: true, force: true });
  });

  it('enriches the stations with address, synonyms and drainage area', () => {
    searchTermListService.getAlternativeGewaesser.mockReturnValue(['Rhine']);
    searchTermListService.getAlternativeKreise.mockReturnValue(['K']);

    harvest([fresh('koeln')], (lang) =>
      of(
        lang === 'de'
          ? address('Deutschland', 'Nordrhein-Westfalen', undefined, 'Köln')
          : address('Germany', 'North Rhine-Westphalia', undefined, 'Cologne'),
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
    expect(searchTermListService.getAlternativeGewaesser).toHaveBeenCalledWith(
      'RHEIN',
    );
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
    ['all requests fail', () => throwError(() => new Error('Request failed'))],
  ])('keeps the previous address if %s', (_, geocode) => {
    store['stations'] = structuredClone(STATIONS.slice(0, 1));
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
    store['stations'] = structuredClone(STATIONS.slice(0, 1));

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

  it('reports the stations without address at the end of the harvest', () => {
    const warn = jest.spyOn(Logger.prototype, 'warn');

    harvest([fresh('koeln'), fresh('dresden')], (lang, uuid) =>
      of(
        uuid === 'koeln'
          ? address('Deutschland', 'Nordrhein-Westfalen', undefined, 'Köln')
          : NOT_FOUND,
      ),
    );

    expect(warn).toHaveBeenCalledWith(
      'Finished enlarging 2 stations, geocoding failed for 1 of them',
    );
  });

  it('reports no failed geocoding if all stations get an address', () => {
    const warn = jest.spyOn(Logger.prototype, 'warn');
    const log = jest.spyOn(Logger.prototype, 'log');

    harvest([fresh('koeln')], () =>
      of(address('Deutschland', 'Nordrhein-Westfalen', undefined, 'Köln')),
    );

    expect(log).toHaveBeenCalledWith('Finished enlarging 1 stations');
    expect(warn).not.toHaveBeenCalled();
  });

  it('removes stations which pegelonline no longer delivers', () => {
    store['stations'] = structuredClone(STATIONS);

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

  it('finishes the harvest if enriching a station fails', () => {
    searchTermListService.getAlternativeGewaesser.mockImplementation(
      (water: string) => {
        if (water === 'RHEIN') {
          throw new Error('broken');
        }
      },
    );

    harvest([fresh('koeln'), fresh('herbrum')], () => of(NOT_FOUND));

    expect(storedStations().map((st) => st.uuid)).toEqual(['koeln', 'herbrum']);
    service['fetchStations']();
    expect(httpService.get).toHaveBeenCalledTimes(2);
  });

  it('serves the previous stations until the harvest is finished', () => {
    store['stations'] = structuredClone(STATIONS);
    const pending = new Subject<AddressData>();

    harvest([fresh('koeln')], (lang) =>
      lang === 'de' ? pending : of(NOT_FOUND),
    );

    expect(storedStations()).toEqual(STATIONS);
    pending.next(NOT_FOUND);
    pending.complete();
    expect(storedStations().map((st) => st.uuid)).toEqual(['koeln']);
  });

  it('keeps the stations if pegelonline delivers none', () => {
    store['stations'] = structuredClone(STATIONS);

    harvest([], () => of(NOT_FOUND));

    expect(storedStations()).toEqual(STATIONS);
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
    ['pegelonline fails', () => throwError(() => new Error('Request failed'))],
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

  it('saves the stations once at the end of the harvest', async () => {
    harvest([fresh('koeln'), fresh('herbrum')], () => of(NOT_FOUND));

    expect(replace).toHaveBeenCalledTimes(1);
    await replace.mock.results[0].value;
    const saved = JSON.parse(readFileSync(stationsFile(), 'utf-8'));
    expect(saved.map((st: PegelonlineStation) => st.uuid)).toEqual([
      'koeln',
      'herbrum',
    ]);
    expect(existsSync(`${stationsFile()}.tmp`)).toBe(false);
  });

  describe('lifecycle', () => {
    afterEach(() => service.onModuleDestroy());

    it('loads the stored stations before the first harvest', async () => {
      writeFileSync(stationsFile(), JSON.stringify(STATIONS.slice(0, 1)));
      createService({ RUN_DATA_ENLARGING_ON_INIT: 'true' });
      httpService.get.mockReturnValue(
        of({
          data: [{ ...fresh('koeln'), longname: 'KÖLN NEU' }],
        } as AxiosResponse),
      );
      nominatimService.getAdressData.mockReturnValue(of(NOT_FOUND));

      await service.onModuleInit();
      await waitFor(() => storedStations()[0]?.longname === 'KÖLN NEU');

      // the failed geocoding keeps the address from stations.json
      expect(storedStations()[0].country).toBe('Deutschland');
    });

    it('starts no harvest on init if disabled', async () => {
      await service.onModuleInit();

      expect(httpService.get).not.toHaveBeenCalled();
    });

    it('stops the cron job when the module is destroyed', async () => {
      await service.onModuleInit();
      expect(service['cronJob']?.isActive).toBe(true);

      await service.onModuleDestroy();

      expect(service['cronJob']?.isActive).toBe(false);
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
