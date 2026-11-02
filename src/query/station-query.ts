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
  @ApiProperty({
    required: false,
    description:
      'Suche über einen Ort, die Stadt aus Nominatim, ohne Stadt die Ortschaft, das Dorf oder die Gemeinde (z.B. <code>Köln</code>)',
  })
  ort?: string;
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
      'Vergleich für <code>station</code>, <code>gewaesser</code>, <code>agency</code>, <code>land</code>, <code>country</code>, <code>einzugsgebiet</code>, <code>kreis</code> und <code>ort</code>: <code>contains</code> (Standard) findet auch Teile eines Namens, <code>exact</code> nur den ganzen Namen oder eine ganze alternative Benennung, beide ohne Groß- und Kleinschreibung (z.B. <code>land=Sachsen&match=exact</code> ohne Niedersachsen und Sachsen-Anhalt)',
  })
  match?: 'contains' | 'exact';
  @ApiProperty({
    required: false,
    enum: ['relevance'],
    description:
      'Reihenfolge der Treffer von <code>q</code>: <code>relevance</code> stellt die Stationen vorn an, bei denen <code>q</code> genau passt, zuerst auf Name oder Pegelnummer, dann Gewässer, dann Ort oder Kreis, dann die übrigen Felder. Es folgen Namen, die mit <code>q</code> beginnen, dann Teiltreffer in Name, Gewässer, Ort und den übrigen Feldern. Ohne <code>sort</code> oder ohne <code>q</code> bleibt die Reihenfolge von Pegelonline (z.B. <code>q=Sachsen&sort=relevance</code> mit den Pegeln in Sachsen vor denen in Niedersachsen und Sachsen-Anhalt)',
  })
  sort?: 'relevance';
  @ApiProperty({
    required: false,
    description:
      'Sprache der alternativen Benennungen für <code>gewaesser</code>, <code>land</code>, <code>country</code>, <code>einzugsgebiet</code>, <code>kreis</code>, <code>ort</code> und <code>q</code>: Sie vergleichen dann nur mit dem deutschen Namen, den Namen dieser Sprache (ohne Region, <code>de</code> umfasst <code>de-AT</code> und <code>de-CH</code>) und den Benennungen ohne Sprache wie Umschreibungen und Kürzeln. Ohne <code>lang</code> zählen alle Sprachen (z.B. findet <code>land=Bavaria&lang=en</code> Bayern, <code>land=Bawaria&lang=en</code> nicht)',
  })
  lang?: string;
}

export const MATCH_MODES = ['contains', 'exact'];
export const SORT_MODES = ['relevance'];
/** A language with optional region and further subtags, e.g. en or de-CH. */
export const LANGUAGE_TAG = /^[a-z]{2,3}(-[a-z0-9]{2,8})*$/i;

/**
 * The parameters that filter, match only sets how some of them compare, sort
 * the order of the hits and lang the language of the alternative names.
 */
export type FilterParameter = Exclude<
  keyof StationQuery,
  'match' | 'sort' | 'lang'
>;

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
