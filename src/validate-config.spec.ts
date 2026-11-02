import { validateConfig } from './validate-config';

describe('validateConfig', () => {
  const VALID = {
    PEGELONLINE_BASE_URL:
      'https://www.pegelonline.wsv.de/webservices/rest-api/v2',
    NOMINATIM_BASE_URL: 'http://localhost:9090/',
  };

  it('keeps valid urls and passes the other values through', () => {
    expect(validateConfig({ ...VALID, PORT: '3000' })).toEqual({
      ...VALID,
      SENSORWEB_API_URL: '',
      PORT: '3000',
    });
  });

  it.each([
    ['http://localhost:9090', 'http://localhost:9090/'],
    ['https://nominatim.example.org/sub', 'https://nominatim.example.org/sub/'],
    [' http://localhost:9090 ', 'http://localhost:9090/'],
  ])('adds the trailing slash to the nominatim url %p', (url, expected) => {
    expect(
      validateConfig({ ...VALID, NOMINATIM_BASE_URL: url }).NOMINATIM_BASE_URL,
    ).toBe(expected);
  });

  it.each([
    'https://www.pegelonline.wsv.de/webservices/rest-api/v2/',
    'https://www.pegelonline.wsv.de/webservices/rest-api/v2//',
  ])('removes the trailing slash from the pegelonline url %p', (url) => {
    expect(
      validateConfig({ ...VALID, PEGELONLINE_BASE_URL: url })
        .PEGELONLINE_BASE_URL,
    ).toBe(VALID.PEGELONLINE_BASE_URL);
  });

  it.each(['PEGELONLINE_BASE_URL', 'NOMINATIM_BASE_URL'])(
    'fails if %s is missing',
    (key) => {
      const config: Record<string, unknown> = { ...VALID };
      delete config[key];

      expect(() => validateConfig(config)).toThrow(`${key} is not set`);
    },
  );

  it.each([
    ['empty', '', 'is not set'],
    ['blank', '  ', 'is not set'],
    ['without protocol', 'localhost:9090', 'is not an http or https url'],
    ['not a url', 'nominatim', 'is not a valid url'],
    [
      'of another protocol',
      'ftp://localhost:9090/',
      'is not an http or https url',
    ],
  ])('fails if the url is %s', (_, url, message) => {
    expect(() => validateConfig({ ...VALID, NOMINATIM_BASE_URL: url })).toThrow(
      `NOMINATIM_BASE_URL ${message}`,
    );
  });

  describe('SENSORWEB_API_URL', () => {
    it.each([
      ['missing', undefined],
      ['empty', ''],
      ['blank', '  '],
    ])('is optional and empty if %s', (_, url) => {
      expect(
        validateConfig({ ...VALID, SENSORWEB_API_URL: url }).SENSORWEB_API_URL,
      ).toBe('');
    });

    it.each([
      [
        'https://sensorweb.example.org/api',
        'https://sensorweb.example.org/api/',
      ],
      [
        ' https://sensorweb.example.org/api/ ',
        'https://sensorweb.example.org/api/',
      ],
    ])('adds the trailing slash to %p', (url, expected) => {
      expect(
        validateConfig({ ...VALID, SENSORWEB_API_URL: url }).SENSORWEB_API_URL,
      ).toBe(expected);
    });

    it('fails if it is set but no http or https url', () => {
      expect(() =>
        validateConfig({ ...VALID, SENSORWEB_API_URL: 'sensorweb:8080' }),
      ).toThrow('SENSORWEB_API_URL is not an http or https url');
    });
  });
});
