import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as turf from '@turf/turf';
import { readFileSync } from 'fs';

interface DrainageArea {
  name?: string;
  polygon: ReturnType<typeof turf.multiPolygon>;
}

/** Finds the drainage area (Einzugsgebiet) of a point in EINZUGSGEBIETE_FILE_PATH. */
@Injectable()
export class DrainageAreasService {
  private readonly filePath = this.configService.get<string>(
    'EINZUGSGEBIETE_FILE_PATH',
    'einzugsgebiete.geojson',
  );

  // loaded on first use and kept until release, the parsed file needs ~150 MB
  private areas?: DrainageArea[];

  constructor(private readonly configService: ConfigService) {}

  /**
   * Name of the drainage area containing the point, undefined outside of all
   * areas.
   */
  find(lat: number, lon: number): string | undefined {
    this.areas ??= this.load();
    const point = turf.point([lon, lat, 0]);
    return this.areas.find((area) =>
      turf.booleanPointInPolygon(point, area.polygon),
    )?.name;
  }

  /** Frees the parsed areas after a harvest, the next find loads them again. */
  release() {
    this.areas = undefined;
  }

  private load(): DrainageArea[] {
    const fileContent = readFileSync(this.filePath, 'utf-8');
    const geojson = JSON.parse(fileContent);
    if (
      geojson?.type !== 'FeatureCollection' ||
      !(geojson.features instanceof Array)
    ) {
      return [];
    }
    return geojson.features.map((feature) => ({
      // NAME_2500 is the coarsest level, the smaller ones only step in where it has no name
      name:
        feature.properties.NAME_2500 ||
        feature.properties.NAME_1000 ||
        feature.properties.NAME_500 ||
        undefined,
      // with a bbox, booleanPointInPolygon skips most polygons without checking the coordinates
      polygon: turf.multiPolygon(feature.geometry.coordinates, undefined, {
        bbox: turf.bbox(feature),
      }),
    }));
  }
}
