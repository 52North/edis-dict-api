import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as turf from '@turf/turf';
import { readFileSync } from 'fs';

import { LocatedStation } from '../stations/station.model';

// stations on border rivers lie up to a few hundred metres outside of the areas
const MAX_DISTANCE_KM = 0.5;

/**
 * Drainage areas of waters whose stations lie farther outside of all areas,
 * e.g. in the Netherlands or at sea.
 */
export const WATER_DRAINAGE_AREAS: Record<string, string> = {
  RHEIN: 'Rhein',
  WAAL: 'Rhein',
  NORDSEE: 'Nordsee',
  OSTSEE: 'Ostsee',
};

interface DrainageArea {
  name: string;
  bbox: ReturnType<typeof turf.bbox>;
  polygon: ReturnType<typeof turf.multiPolygon>;
}

/**
 * Finds the drainage area (Einzugsgebiet) of a station in
 * EINZUGSGEBIETE_FILE_PATH. Areas without a name are left out.
 */
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
   * Name of the drainage area containing the station. Outside of all areas,
   * the nearest one up to MAX_DISTANCE_KM away, then the one of its water in
   * WATER_DRAINAGE_AREAS, otherwise undefined.
   */
  find(station: LocatedStation): string | undefined {
    const areas = (this.areas ??= this.load());
    const point = turf.point([station.longitude, station.latitude, 0]);
    return (
      areas.find((area) => turf.booleanPointInPolygon(point, area.polygon))
        ?.name ??
      this.findNearest(areas, point) ??
      WATER_DRAINAGE_AREAS[station.water.longname]
    );
  }

  /** Frees the parsed areas after a harvest, the next find loads them again. */
  release() {
    this.areas = undefined;
  }

  private findNearest(
    areas: DrainageArea[],
    point: ReturnType<typeof turf.point>,
  ): string | undefined {
    // measuring the distance to all areas takes over a second, so only areas whose bbox overlaps the search circle are measured
    const [minLon, minLat, maxLon, maxLat] = turf.bbox(
      turf.circle(point, MAX_DISTANCE_KM),
    );
    return areas
      .filter(
        ({ bbox: [west, south, east, north] }) =>
          west <= maxLon &&
          east >= minLon &&
          south <= maxLat &&
          north >= minLat,
      )
      .map((area) => ({
        name: area.name,
        distance: turf.pointToPolygonDistance(point, area.polygon),
      }))
      .filter((area) => area.distance <= MAX_DISTANCE_KM)
      .sort((a, b) => a.distance - b.distance)[0]?.name;
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
    return geojson.features
      .map((feature) => {
        const bbox = turf.bbox(feature);
        return {
          // NAME_2500 is the coarsest level, the smaller ones only step in where it has no name
          name:
            feature.properties.NAME_2500 ||
            feature.properties.NAME_1000 ||
            feature.properties.NAME_500,
          bbox,
          // with a bbox, booleanPointInPolygon skips most polygons without checking the coordinates
          polygon: turf.multiPolygon(feature.geometry.coordinates, undefined, {
            bbox,
          }),
        };
      })
      .filter((area): area is DrainageArea => !!area.name);
  }
}
