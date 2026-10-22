import { BadRequestException, Logger } from '@nestjs/common';

import { StationQueryPipe } from './station-query.pipe';

describe('StationQueryPipe', () => {
  const pipe = new StationQueryPipe();
  const warn = jest
    .spyOn(Logger.prototype, 'warn')
    .mockImplementation(() => undefined);

  beforeEach(() => warn.mockClear());

  it.each([
    ['no parameters', {}],
    ['a single value per parameter', { q: 'köln', land: 'Sachsen' }],
    ['a bbox', { bbox: '7,52,8,53' }],
    ['a bbox with spaces and decimals', { bbox: ' 7.5, 52 ,8.25,53' }],
    ['the whole world as bbox', { bbox: '-180,-90,180,90' }],
    ['an empty bbox', { bbox: '' }],
    ['match=exact', { land: 'Sachsen', match: 'exact' }],
    ['match=contains', { land: 'Sachsen', match: 'contains' }],
    ['an empty match', { land: 'Sachsen', match: '' }],
  ])('accepts %s', (_, query) => {
    expect(pipe.transform(query)).toBe(query);
    expect(warn).not.toHaveBeenCalled();
  });

  it.each([
    ['a repeated parameter', { q: ['a', 'b'] }],
    ['a bbox with three values', { bbox: '7,52,8' }],
    ['a bbox with five values', { bbox: '7,52,8,53,1' }],
    ['a bbox with text', { bbox: 'a,52,8,53' }],
    ['a bbox with an empty value', { bbox: '7,,8,53' }],
    ['a bbox with swapped corners', { bbox: '8,52,7,53' }],
    ['a bbox outside of the coordinate range', { bbox: '7,52,8,91' }],
    ['an unknown match', { land: 'Sachsen', match: 'fuzzy' }],
    ['a match in upper case', { land: 'Sachsen', match: 'EXACT' }],
    ['a repeated match', { land: 'Sachsen', match: ['exact', 'exact'] }],
  ])('rejects %s', (_, query) => {
    expect(() => pipe.transform(query)).toThrow(BadRequestException);
  });

  it('accepts and logs unknown parameters, also repeated ones', () => {
    const query = { q: 'köln', _: ['1', '2'], utm_source: 'mail' };

    expect(pipe.transform(query)).toBe(query);
    expect(warn).toHaveBeenCalledWith(
      'Ignoring unknown search parameters: _, utm_source',
    );
  });

  it('treats inherited object properties as unknown parameters', () => {
    pipe.transform({ toString: '1' });

    expect(warn).toHaveBeenCalledWith(
      'Ignoring unknown search parameters: toString',
    );
  });
});
