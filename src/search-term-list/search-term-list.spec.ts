import { ConfigService } from '@nestjs/config';
import { join } from 'path';

import { SearchTermListService } from './search-term-list';

// uses the real search term list of the repository
const SEARCH_TERM_LIST = join(
  __dirname,
  '../../Suchwortliste-Dict-API_v0-1_2022-06-23.xlsx',
);

describe('SearchTermListService', () => {
  let service: SearchTermListService;

  beforeAll(() => {
    service = new SearchTermListService({
      get: () => SEARCH_TERM_LIST,
    } as unknown as ConfigService);
  });

  it.each([
    ['RHEIN', ['Rhine']],
    ['Rhein', ['Rhine']],
    ['DONAU', ['Danube']],
    ['BODENSEE', ['BSE', 'Lake Constance']],
    ['DORTMUND-EMS-KANAL', ['DEK']],
    // must not match the canals listed before them
    ['EMS', undefined],
    ['ODER', undefined],
    ['ELBE', ['Elb']],
    ['UNBEKANNT', undefined],
  ])('finds the alternatives of the water %s', (water, expected) => {
    expect(service.getAlternativeGewaesser(water)).toEqual(expected);
  });

  it.each([
    ['Landkreis Celle', ['CE']],
    ['Heidekreis', ['HK']],
    [undefined, undefined],
  ])('finds the alternatives of the kreis %s', (kreis, expected) => {
    expect(service.getAlternativeKreise(kreis)).toEqual(expected);
  });

  it.each([
    ['Ostsee', ['Baltic Sea', 'baltic']],
    ['Rhein', undefined],
    [undefined, undefined],
  ])('finds the alternatives of the drainage area %s', (area, expected) => {
    expect(service.getAlternativeEinzugsgebiete(area)).toEqual(expected);
  });
});
