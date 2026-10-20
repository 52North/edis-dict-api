import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { createStation, STATIONS } from '../../test/fixtures';
import { StationStore } from './station-store';
import { PegelonlineStation } from './station.model';

describe('StationStore', () => {
  let dir: string;
  let store: StationStore;

  const stationsFile = () => join(dir, 'stations.json');

  beforeAll(() => Logger.overrideLogger(false));

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'station-store-'));
    store = new StationStore({
      get: (key: string, defaultValue?: string) =>
        key === 'STATIONS_FILE_PATH' ? stationsFile() : defaultValue,
    } as ConfigService);
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  describe('loading stations.json', () => {
    it('removes empty entries stored by older harvests', async () => {
      const pellworm = createStation({
        uuid: 'pellworm',
        kreis: 'Nordfriesland',
        // null cannot be typed, but older harvests wrote it
        kreis_alternatives: [null, 'NF', ''] as string[],
      });
      writeFileSync(stationsFile(), JSON.stringify([pellworm]));

      await store.load();

      expect(store.getAll()[0].kreis_alternatives).toEqual(['NF']);
      expect(store.get('pellworm')).toBe(store.getAll()[0]);
    });

    it.each([
      ['the file is missing', undefined],
      ['the file is invalid', '{ invalid'],
    ])('starts without stations if %s', async (_, content) => {
      if (content) {
        writeFileSync(stationsFile(), content);
      }

      await store.load();

      expect(store.getAll()).toEqual([]);
    });
  });

  describe('replacing the stations', () => {
    it('writes stations.json without leaving the temporary file', async () => {
      await store.replace(STATIONS);

      expect(store.getAll()).toBe(STATIONS);
      const saved = JSON.parse(readFileSync(stationsFile(), 'utf-8'));
      expect(saved.map((st: PegelonlineStation) => st.uuid)).toEqual([
        'koeln',
        'herbrum',
        'genthin',
        'dresden',
      ]);
      expect(existsSync(`${stationsFile()}.tmp`)).toBe(false);
    });

    it('keeps the stations in memory if writing fails', async () => {
      rmSync(dir, { recursive: true });

      await store.replace(STATIONS);

      expect(store.getAll()).toBe(STATIONS);
    });
  });
});
