import { ConfigService } from '@nestjs/config';

import { NominatimService } from '../nominatim/nominatim.service';
import { GeocodingService } from './geocoding.service';

// the address handling is covered by the harvest tests
describe('GeocodingService', () => {
  const service = new GeocodingService(
    {} as NominatimService,
    { get: () => undefined } as unknown as ConfigService,
  );

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
