import { INestApplication, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SchemaObject, SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { configureApp } from '../src/configure-app';
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
    configureApp(app);
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

  it('compresses the response if the client accepts it', async () => {
    const res = await request(app.getHttpServer())
      .get('/search')
      .set('Accept-Encoding', 'gzip')
      .expect(200);

    expect(res.headers['content-encoding']).toBe('gzip');
    expect(uuids(res)).toHaveLength(STATIONS.length);
  });

  it('answers uncompressed if the client accepts only identity', async () => {
    const res = await request(app.getHttpServer())
      .get('/search')
      .set('Accept-Encoding', 'identity')
      .expect(200);

    expect(res.headers['content-encoding']).toBeUndefined();
    expect(uuids(res)).toHaveLength(STATIONS.length);
  });

  it('allows requests from all origins', async () => {
    const res = await request(app.getHttpServer())
      .get('/search')
      .set('Origin', 'http://client')
      .expect(200);

    expect(res.headers['access-control-allow-origin']).toBe('*');
  });

  it('ignores unknown parameters like cache busters', async () => {
    const res = await request(app.getHttpServer())
      .get('/search')
      .query({ q: 'sachsen', bbox: '12,52,13,53', _: '1729339200000' })
      .expect(200);

    expect(uuids(res)).toEqual(['genthin']);
  });

  it('searches a land exactly with match=exact', async () => {
    const res = await request(app.getHttpServer())
      .get('/search')
      .query({ land: 'Sachsen', match: 'exact' })
      .expect(200);

    expect(uuids(res)).toEqual(['dresden']);
  });

  it.each([
    ['an invalid bbox', 'bbox=abc', 'Parameter bbox must have the form'],
    ['a repeated parameter', 'q=a&q=b', 'Parameter q must be a single value'],
    [
      'an unknown match',
      'land=Sachsen&match=fuzzy',
      'Parameter match must be contains or exact',
    ],
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

  it('lists the options grouped with their alternatives', async () => {
    const res = await request(app.getHttpServer())
      .get('/options')
      .query({ parameter: 'kreis', grouped: 'true' })
      .expect(200);

    expect(res.body).toEqual([
      { value: 'Dresden', alternatives: [] },
      { value: 'Köln', alternatives: ['Koeln'] },
      { value: 'Landkreis Emsland', alternatives: [] },
    ]);
  });

  it.each([
    ['missing', {}],
    ['unsupported', { parameter: 'unknown' }],
  ])('rejects a %s options parameter', async (_, query) => {
    await request(app.getHttpServer()).get('/options').query(query).expect(400);
  });

  it.each([
    ['an invalid', 'parameter=kreis&grouped=yes'],
    ['a repeated', 'parameter=kreis&grouped=true&grouped=true'],
  ])('rejects %s grouped parameter', async (_, query) => {
    const res = await request(app.getHttpServer())
      .get(`/options?${query}`)
      .expect(400);

    expect(res.body.message).toBe('grouped must be true or false');
  });

  it('describes the options with their parameters', () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().build(),
    );
    const schemas = document.components?.schemas as Record<
      string,
      SchemaObject
    >;

    expect(
      document.paths['/options']?.get?.parameters?.map((p) =>
        'name' in p ? p.name : undefined,
      ),
    ).toEqual(['parameter', 'grouped']);
    expect(Object.keys(schemas.OptionGroup.properties ?? {})).toEqual([
      'value',
      'alternatives',
    ]);
  });

  it('describes the match modes of the search', () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().build(),
    );
    const match = document.paths['/search']?.get?.parameters?.find(
      (p) => 'name' in p && p.name === 'match',
    );

    expect(match).toMatchObject({
      in: 'query',
      required: false,
      schema: { enum: ['contains', 'exact'] },
    });
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
