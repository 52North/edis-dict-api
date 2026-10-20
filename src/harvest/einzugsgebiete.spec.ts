import { readFileSync } from 'fs';
import { join } from 'path';

// checks the drainage areas of the repository, e.g. after replacing the file
describe('einzugsgebiete.geojson', () => {
  let names: string[];

  beforeAll(() => {
    const geojson = JSON.parse(
      readFileSync(join(__dirname, '../../einzugsgebiete.geojson'), 'utf-8'),
    );
    names = geojson.features
      .flatMap((feature) => [
        feature.properties.NAME_2500,
        feature.properties.NAME_1000,
        feature.properties.NAME_500,
      ])
      .filter((name) => name);
  });

  it('has no names with lost characters', () => {
    // U+FFFD replaces characters which could not be decoded, e.g. umlauts read with the wrong encoding
    expect(names.filter((name) => name.includes('�'))).toEqual([]);
  });

  it('has names with umlauts', () => {
    expect(names).toEqual(
      expect.arrayContaining(['Wümme', 'Weiße Elster', 'Sûre Rivière']),
    );
  });
});
