import { BadRequestException, Logger } from '@nestjs/common';

import { FacetsQueryPipe, fieldList } from './facets.controller';

describe('fieldList', () => {
  it.each<[string | undefined, string[]]>([
    ['land,kreis', ['land', 'kreis']],
    [' land , kreis ', ['land', 'kreis']],
    ['land,,kreis,', ['land', 'kreis']],
    ['land,land', ['land']],
    ['', []],
    [undefined, []],
  ])('splits %p', (fields, expected) => {
    expect(fieldList(fields)).toEqual(expected);
  });
});

describe('FacetsQueryPipe', () => {
  const pipe = new FacetsQueryPipe();

  beforeAll(() => Logger.overrideLogger(false));

  it('passes valid fields and filters on', () => {
    const query = { fields: 'land,kreis', land: 'Bayern', match: 'exact' };

    expect(pipe.transform(query)).toBe(query);
  });

  it.each<[string, Record<string, unknown>, string]>([
    ['missing fields', { land: 'Bayern' }, 'missing fields'],
    ['empty fields', { fields: ' , ' }, 'missing fields'],
    ['an unknown field', { fields: 'land,region' }, 'unsupported field region'],
    ['q as field', { fields: 'q' }, 'unsupported field q'],
    [
      'a property of objects as field',
      { fields: 'constructor' },
      'unsupported field constructor',
    ],
    [
      'repeated fields',
      { fields: ['land', 'kreis'] },
      'Parameter fields must be a single value',
    ],
    [
      'an invalid filter',
      { fields: 'land', bbox: '1,2' },
      'Parameter bbox must have the form minLon,minLat,maxLon,maxLat with valid coordinates, e.g. 7,52,8,53',
    ],
    [
      'an invalid lang',
      { fields: 'land', lang: 'english' },
      'Parameter lang must be a language like en or de-CH',
    ],
  ])('rejects %s', (_, query, message) => {
    expect(() => pipe.transform(query)).toThrow(
      new BadRequestException(message),
    );
  });
});
