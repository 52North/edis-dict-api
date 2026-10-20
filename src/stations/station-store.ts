import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFile, rename, writeFile } from 'fs/promises';

import { PegelonlineStation } from './station.model';

// the enriched stations in memory and in stations.json
@Injectable()
export class StationStore {
  private readonly logger = new Logger(StationStore.name);

  private stations: PegelonlineStation[] = [];

  private readonly filePath = this.configService.get<string>(
    'STATIONS_FILE_PATH',
    'stations.json',
  );

  constructor(private readonly configService: ConfigService) {}

  getAll(): PegelonlineStation[] {
    return this.stations;
  }

  get(uuid: string): PegelonlineStation | undefined {
    return this.stations.find((st) => st.uuid === uuid);
  }

  // replaces all stations at once and saves them, never rejects
  replace(stations: PegelonlineStation[]): Promise<void> {
    this.stations = stations;
    return this.save();
  }

  async load(): Promise<void> {
    let data: string;
    try {
      data = await readFile(this.filePath, 'utf8');
    } catch {
      this.logger.warn(`Could not load stations.json`);
      return;
    }
    try {
      const stations: PegelonlineStation[] = JSON.parse(data);
      stations.forEach((st) => this.removeEmptyAlternatives(st));
      this.stations = stations;
    } catch (error) {
      this.logger.warn(`Error while parsing stations data: ${error}`);
    }
  }

  // write to a temporary file first, so a crash while writing cannot break the existing file
  private async save(): Promise<void> {
    const tmpFilePath = `${this.filePath}.tmp`;
    try {
      await writeFile(tmpFilePath, JSON.stringify(this.stations, null, 2));
      await rename(tmpFilePath, this.filePath);
    } catch (error) {
      this.logger.error(error);
    }
  }

  // older harvests could store null entries, which would e.g. show up in /options
  private removeEmptyAlternatives(station: PegelonlineStation) {
    const keys = [
      'country_alternatives',
      'land_alternatives',
      'kreis_alternatives',
      'city_alternatives',
    ] as const;
    keys.forEach((key) => {
      station[key] = station[key]?.filter((e) => e);
    });
  }
}
