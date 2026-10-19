import { HttpService } from '@nestjs/axios';
import { INestApplication, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { NominatimService } from '../src/nominatim/nominatim.service';
import { OptionsController } from '../src/options/options.controller';
import { QueryController } from '../src/query/query.controller';
import { SearchTermListService } from '../src/search-term-list/search-term-list';
import { StationsService } from '../src/stations/stations.service';
import { STATIONS } from './fixtures';

// the cron job of the service would keep jest running
jest.mock('cron');

describe('Search API (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    Logger.overrideLogger(false);
    const config: Record<string, string> = {
      STATIONS_FILE_PATH: 'does-not-exist.json',
      PEGELONLINE_BASE_URL: 'http://pegelonline',
      RUN_DATA_ENLARGING_ON_INIT: 'false',
    };
    const module = await Test.createTestingModule({
      controllers: [QueryController, OptionsController],
      providers: [
        StationsService,
        { provide: HttpService, useValue: {} },
        { provide: NominatimService, useValue: {} },
        { provide: SearchTermListService, useValue: {} },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string, defaultValue?: string) =>
              config[key] ?? defaultValue,
          },
        },
      ],
    }).compile();

    app = module.createNestApplication();
    await app.init();
    app.get(StationsService)['stations'] = structuredClone(STATIONS);
  });

  afterAll(() => app.close());

  const uuids = (res: request.Response) =>
    res.body.stations.map((st: { uuid: string }) => st.uuid);

  it('searches with combined parameters', async () => {
    const res = await request(app.getHttpServer())
      .get('/search')
      .query({ gewaesser: 'Rhine', parameter: 'WT' })
      .expect(200);

    expect(uuids(res)).toEqual(['koeln']);
    expect(res.body.mqtttopics).toEqual(['edis/pegelonline/+/+/+/+/koeln/+']);
    expect(res.body.pegelonlinelinks).toHaveLength(2);
  });

  it('searches with q and bbox', async () => {
    const res = await request(app.getHttpServer())
      .get('/search')
      .query({ q: 'sachsen', bbox: '12,52,13,53' })
      .expect(200);

    expect(uuids(res)).toEqual(['genthin']);
  });

  it('returns all stations without parameters', async () => {
    const res = await request(app.getHttpServer()).get('/search').expect(200);

    expect(uuids(res)).toHaveLength(STATIONS.length);
  });

  it('lists the options of a parameter', async () => {
    const res = await request(app.getHttpServer())
      .get('/options')
      .query({ parameter: 'country' })
      .expect(200);

    expect(res.body).toEqual(['Deutschland', 'Germany']);
  });

  it.each([
    ['missing', {}],
    ['unsupported', { parameter: 'unknown' }],
  ])('rejects a %s options parameter', async (_, query) => {
    await request(app.getHttpServer()).get('/options').query(query).expect(400);
  });
});
