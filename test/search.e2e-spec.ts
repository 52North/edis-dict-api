import { INestApplication, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SchemaObject, SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { OptionsController } from '../src/options/options.controller';
import { QueryController } from '../src/query/query.controller';
import { StationStore } from '../src/stations/station-store';
import { StationsService } from '../src/stations/stations.service';
import { STATIONS } from './fixtures';

describe('Search API (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    Logger.overrideLogger(false);
    const config: Record<string, string> = {
      PEGELONLINE_BASE_URL: 'http://pegelonline',
    };
    const module = await Test.createTestingModule({
      controllers: [QueryController, OptionsController],
      providers: [
        StationsService,
        StationStore,
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
    app.get(StationStore)['stations'] = structuredClone(STATIONS);
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

  it('ignores unknown parameters like cache busters', async () => {
    const res = await request(app.getHttpServer())
      .get('/search')
      .query({ q: 'sachsen', bbox: '12,52,13,53', _: '1729339200000' })
      .expect(200);

    expect(uuids(res)).toEqual(['genthin']);
  });

  it.each([
    ['an invalid bbox', 'bbox=abc', 'Parameter bbox must have the form'],
    ['a repeated parameter', 'q=a&q=b', 'Parameter q must be a single value'],
  ])('rejects %s', async (_, query, message) => {
    const res = await request(app.getHttpServer())
      .get(`/search?${query}`)
      .expect(400);

    expect(res.body.message).toContain(message);
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

  it('describes the timeseries of a station as an array', () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().build(),
    );
    const schemas = document.components?.schemas as Record<
      string,
      SchemaObject
    >;

    expect(schemas.PegelonlineStation.properties?.timeseries).toMatchObject({
      type: 'array',
      items: { $ref: '#/components/schemas/PegelonlineTimeseries' },
    });
  });

  it('describes the fields taken from pegelonline', () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().build(),
    );
    const schemas = document.components?.schemas as Record<
      string,
      SchemaObject
    >;

    // with a description, the reference is wrapped in allOf
    expect(schemas.PegelonlineStation.properties).toMatchObject({
      water: { allOf: [{ $ref: '#/components/schemas/PegelonlineWater' }] },
      voiceServiceNumber: { type: 'string' },
      remark: { type: 'string' },
    });
    expect(schemas.PegelonlineTimeseries.properties).toMatchObject({
      gaugeZero: {
        allOf: [{ $ref: '#/components/schemas/PegelonlineGaugeZero' }],
      },
      comment: {
        allOf: [{ $ref: '#/components/schemas/PegelonlineComment' }],
      },
    });
    expect(Object.keys(schemas.PegelonlineWater.properties ?? {})).toEqual([
      'shortname',
      'longname',
    ]);
    expect(Object.keys(schemas.PegelonlineGaugeZero.properties ?? {})).toEqual([
      'unit',
      'value',
      'validFrom',
    ]);
    expect(Object.keys(schemas.PegelonlineComment.properties ?? {})).toEqual([
      'shortDescription',
      'longDescription',
    ]);
  });

  it('describes the mqtt topic of a timeseries as optional for forecasts', () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().build(),
    );
    const schemas = document.components?.schemas as Record<
      string,
      SchemaObject
    >;

    expect(schemas.PegelonlineTimeseries.required).toContain('pegelonlinelink');
    expect(schemas.PegelonlineTimeseries.required).not.toContain('mqtttopic');
  });
});
