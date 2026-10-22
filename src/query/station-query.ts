import { ApiProperty } from '@nestjs/swagger';

/**
 * The parameters of /search, all optional and combined with AND. How each one
 * matches is defined in station-filter.ts.
 */
export class StationQuery {
  @ApiProperty({
    required: false,
    description: 'Suche über einen Stationsnamen (z.B. <code>Köln</code>)',
  })
  station?: string;
  @ApiProperty({
    required: false,
    description:
      'Suche über eine Pegelnummer, nur die ganze Nummer (z.B. <code>2710080</code>)',
  })
  number?: string;
  @ApiProperty({
    required: false,
    description: 'Suche über ein Gewässer (z.B. <code>Rhein</code>)',
  })
  gewaesser?: string;
  @ApiProperty({
    required: false,
    description: 'Suche über eine Agency (z.B. <code>Dresden</code>)',
  })
  agency?: string;
  @ApiProperty({
    required: false,
    description: 'Suche über ein Bundesland (z.B. <code>Hamburg</code>)',
  })
  land?: string;
  @ApiProperty({
    required: false,
    description: 'Suche über ein Land (z.B. <code>Deutschland</code>)',
  })
  country?: string;
  @ApiProperty({
    required: false,
    description: 'Suche über ein Fluss-Einzugsgebiet (z.B. <code>Ems</code>)',
  })
  einzugsgebiet?: string;
  @ApiProperty({
    required: false,
    description: 'Suche über einen Landkreis (z.B. <code>Emsland</code>)',
  })
  kreis?: string;
  // @ApiProperty({
  //   required: false,
  //   description: 'Suche über eine Region',
  // })
  // region?: string;
  @ApiProperty({
    required: false,
    description:
      'Suche über einen Beobachtungsparameter, als Kürzel oder ganzer Name (z.B. <code>WT</code> oder <code>Wassertemperatur</code>)',
  })
  parameter?: string;
  @ApiProperty({
    required: false,
    description:
      'Suche über eine BoundingBox in der Form <code>minLon, minLat, maxLon, maxLat</code> (z.B. <code>7,52,8,53</code>)',
  })
  bbox?: string;
  @ApiProperty({
    required: false,
    description:
      'Suche über alle verfügbaren Parameter (z.B. <code>Köln</code>)',
  })
  q?: string;
  @ApiProperty({
    required: false,
    enum: ['contains', 'exact'],
    description:
      'Vergleich für <code>station</code>, <code>gewaesser</code>, <code>agency</code>, <code>land</code>, <code>country</code>, <code>einzugsgebiet</code> und <code>kreis</code>: <code>contains</code> (Standard) findet auch Teile eines Namens, <code>exact</code> nur den ganzen Namen oder eine ganze alternative Benennung, beide ohne Groß- und Kleinschreibung (z.B. <code>land=Sachsen&match=exact</code> ohne Niedersachsen und Sachsen-Anhalt)',
  })
  match?: 'contains' | 'exact';
}

export const MATCH_MODES = ['contains', 'exact'];

/** The parameters that filter, match only sets how some of them compare. */
export type FilterParameter = Exclude<keyof StationQuery, 'match'>;

/** minLon, minLat, maxLon, maxLat in degrees, like the station coordinates */
export type Bbox = [number, number, number, number];

/**
 * Parses "minLon,minLat,maxLon,maxLat".
 * @returns undefined if it is no valid bbox
 */
export function parseBbox(bbox: string): Bbox | undefined {
  const coords = bbox.split(',').map((c) => (c.trim() ? Number(c) : NaN));
  if (coords.length !== 4 || coords.some((c) => Number.isNaN(c))) {
    return undefined;
  }
  const [minLon, minLat, maxLon, maxLat] = coords;
  if (
    minLon < -180 ||
    maxLon > 180 ||
    minLat < -90 ||
    maxLat > 90 ||
    minLon > maxLon ||
    minLat > maxLat
  ) {
    return undefined;
  }
  return [minLon, minLat, maxLon, maxLat];
}
