import { alternativesIn } from './station-filter';

describe('alternativesIn', () => {
  // as the harvest stores Köln, Koeln is a transcription without language
  const ALTERNATIVES = ['Koeln', 'Cologne', 'Kolonia', 'Keulen', 'Köln (AT)'];
  const NAMES = {
    en: 'Cologne',
    pl: 'Kolonia',
    fr: 'Cologne',
    nl: 'Keulen',
    'de-AT': 'Köln (AT)',
  };

  it.each<[string, string | undefined, string[]]>([
    ['all without language', undefined, ALTERNATIVES],
    ['English and those without language', 'en', ['Koeln', 'Cologne']],
    ['a name of two languages for either', 'fr', ['Koeln', 'Cologne']],
    ['not a name of other languages', 'nl', ['Koeln', 'Keulen']],
    ['the language in any case', 'EN', ['Koeln', 'Cologne']],
    ['the language without region', 'de', ['Koeln', 'Köln (AT)']],
    ['another region of the language', 'de-CH', ['Koeln', 'Köln (AT)']],
    [
      'only those without language for a language without names',
      'es',
      ['Koeln'],
    ],
  ])('takes %s', (_, lang, expected) => {
    expect(alternativesIn(ALTERNATIVES, NAMES, lang)).toEqual(expected);
  });

  it('takes all alternatives as without language if there are no names', () => {
    expect(alternativesIn(['Koeln', 'K'], undefined, 'en')).toEqual([
      'Koeln',
      'K',
    ]);
  });

  it('keeps missing alternatives missing', () => {
    expect(alternativesIn(undefined, NAMES, 'en')).toBeUndefined();
  });
});
