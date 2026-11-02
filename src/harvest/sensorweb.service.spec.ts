import { HttpService } from '@nestjs/axios';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosRequestConfig, AxiosResponse } from 'axios';
import { defer, firstValueFrom, Observable, of, throwError } from 'rxjs';

import { BLOCK_SIZE, SensorWebService } from './sensorweb.service';

const URL = 'http://sensorweb/api/';

const feature = (uuid: string, id = `f-${uuid}`) => ({
  id,
  properties: { domainId: uuid },
});

const dataset = (uuid: string, shortname: string) => ({
  id: `d-${uuid}-${shortname}`,
  domainId: `${uuid}_${shortname}`,
});

const response = <T>(data: T) => of({ data } as AxiosResponse<T>);

describe('SensorWebService', () => {
  const httpService = { get: jest.fn() };

  const createService = (config: Record<string, string> = {}) =>
    new SensorWebService(
      httpService as unknown as HttpService,
      {
        get: (key: string, defaultValue?: string) =>
          config[key] ?? defaultValue,
      } as ConfigService,
    );

  // the datasets of a request are those of its features, failing for the given feature ids
  const serve = (
    features: ReturnType<typeof feature>[],
    datasets: ReturnType<typeof dataset>[],
    failing: (featureIds: string[]) => boolean = () => false,
  ) =>
    httpService.get.mockImplementation(
      (url: string, config: AxiosRequestConfig): Observable<unknown> => {
        if (url === `${URL}features`) {
          return response(features);
        }
        const featureIds: string[] = config.params.features.split(',');
        // like a request, every subscription asks again
        return defer(() => {
          if (failing(featureIds)) {
            return throwError(() => new Error('500'));
          }
          const uuids = features
            .filter((f) => featureIds.includes(f.id))
            .map((f) => f.properties.domainId);
          return response(
            datasets.filter((d) => uuids.includes(d.domainId.split('_')[0])),
          );
        });
      },
    );

  const datasetRequests = () =>
    httpService.get.mock.calls.filter(([url]) => url === `${URL}datasets`);

  beforeAll(() => Logger.overrideLogger(false));

  beforeEach(() => jest.clearAllMocks());

  it('is enabled only with SENSORWEB_API_URL', () => {
    expect(createService().isEnabled()).toBe(false);
    expect(createService({ SENSORWEB_API_URL: URL }).isEnabled()).toBe(true);
  });

  it('tells links to the configured api from others', () => {
    const service = createService({ SENSORWEB_API_URL: URL });

    expect(service.isOwnLink(`${URL}datasets/1/data.csv`)).toBe(true);
    expect(service.isOwnLink('http://other/api/datasets/1/data.csv')).toBe(
      false,
    );
  });

  it('links the timeseries to the csv of their datasets', async () => {
    serve(
      [feature('a'), feature('b')],
      [dataset('a', 'W'), dataset('a', 'WV'), dataset('b', 'Q')],
    );

    const result = await firstValueFrom(
      createService({ SENSORWEB_API_URL: URL }).findLinks(['a', 'b']),
    );

    expect(result.links).toEqual(
      new Map([
        ['a_W', `${URL}datasets/d-a-W/data.csv`],
        ['a_WV', `${URL}datasets/d-a-WV/data.csv`],
        ['b_Q', `${URL}datasets/d-b-Q/data.csv`],
      ]),
    );
    expect(result.failed.size).toBe(0);
  });

  it('requests the features once and the datasets in blocks, with a timeout', async () => {
    const uuids = Array.from({ length: 2 * BLOCK_SIZE + 1 }, (_, i) => `s${i}`);
    serve(
      uuids.map((uuid) => feature(uuid)),
      [],
    );

    await firstValueFrom(
      createService({ SENSORWEB_API_URL: URL }).findLinks(uuids),
    );

    expect(httpService.get).toHaveBeenCalledWith(`${URL}features`, {
      timeout: 30000,
    });
    expect(
      datasetRequests().map(([, config]) => config.params.features.split(',')),
    ).toEqual([
      uuids.slice(0, BLOCK_SIZE).map((uuid) => `f-${uuid}`),
      uuids.slice(BLOCK_SIZE, 2 * BLOCK_SIZE).map((uuid) => `f-${uuid}`),
      [`f-${uuids[2 * BLOCK_SIZE]}`],
    ]);
    expect(datasetRequests()[0][1]).toMatchObject({
      timeout: 30000,
      params: { datasetTypes: 'timeseries' },
    });
  });

  it('does not request stations without feature', async () => {
    serve([feature('a')], [dataset('a', 'W')]);

    const result = await firstValueFrom(
      createService({ SENSORWEB_API_URL: URL }).findLinks(['a', 'nowhere']),
    );

    expect(datasetRequests()).toHaveLength(1);
    expect(datasetRequests()[0][1].params.features).toBe('f-a');
    expect(result.failed.size).toBe(0);
  });

  it('requests nothing but the features without stations having one', async () => {
    serve([feature('a')], []);

    const result = await firstValueFrom(
      createService({ SENSORWEB_API_URL: URL }).findLinks(['nowhere']),
    );

    expect(datasetRequests()).toHaveLength(0);
    expect(result).toEqual({ links: new Map(), failed: new Set() });
  });

  it('tries a failing block a second time', async () => {
    let calls = 0;
    serve([feature('a')], [dataset('a', 'W')], () => ++calls === 1);

    const result = await firstValueFrom(
      createService({ SENSORWEB_API_URL: URL }).findLinks(['a']),
    );

    expect(result.links.get('a_W')).toBe(`${URL}datasets/d-a-W/data.csv`);
    expect(result.failed.size).toBe(0);
  });

  it('fails only the stations of a block failing twice', async () => {
    const uuids = Array.from({ length: BLOCK_SIZE + 1 }, (_, i) => `s${i}`);
    const last = uuids[BLOCK_SIZE];
    serve(
      uuids.map((uuid) => feature(uuid)),
      [dataset('s0', 'W'), dataset(last, 'W')],
      (featureIds) => featureIds.includes('f-s0'),
    );

    const result = await firstValueFrom(
      createService({ SENSORWEB_API_URL: URL }).findLinks(uuids),
    );

    expect(result.failed).toEqual(new Set(uuids.slice(0, BLOCK_SIZE)));
    expect([...result.links.keys()]).toEqual([`${last}_W`]);
  });

  it('fails all stations if the features cannot be loaded', async () => {
    httpService.get.mockReturnValue(throwError(() => new Error('timeout')));

    const result = await firstValueFrom(
      createService({ SENSORWEB_API_URL: URL }).findLinks(['a', 'b']),
    );

    expect(result).toEqual({ links: new Map(), failed: new Set(['a', 'b']) });
  });

  it('uses the proxy of the harvest', async () => {
    serve([feature('a')], []);

    await firstValueFrom(
      createService({
        SENSORWEB_API_URL: URL,
        PROXY_PROTOCOL: 'http',
        PROXY_HOST: 'proxy',
        PROXY_PORT: '3128',
      }).findLinks(['a']),
    );

    expect(httpService.get).toHaveBeenCalledWith(`${URL}features`, {
      timeout: 30000,
      proxy: { protocol: 'http', host: 'proxy', port: '3128' },
    });
  });
});
