import { ApiProperty } from '@nestjs/swagger';

/**
 * A timeseries of a station from the pegelonline REST API v2. mqtttopic and
 * pegelonlinelink are only added for the response, see
 * StationsService.prepareResponse.
 */
export class PegelonlineTimeseries {
  @ApiProperty({
    description: 'Shortname zur Zeitreihe',
  })
  shortname: string;

  @ApiProperty({
    description: 'Longname zur Zeitreihe',
  })
  longname: string;

  @ApiProperty({
    description: 'Messeinheit der Zeitreihe',
  })
  unit: string;

  @ApiProperty({
    description: 'mqtt Topic für die Zeitreihe',
  })
  mqtttopic: string;

  @ApiProperty({
    description: 'Link zu den Messwerten',
  })
  pegelonlinelink: string;

  @ApiProperty({
    description: 'Abstand der Messwerte in Minuten',
  })
  equidistance: number;
}

/**
 * A station from the pegelonline REST API v2, enriched by the harvest with
 * address, alternative names and drainage area. Stored in stations.json and
 * returned by /search.
 */
export class PegelonlineStation {
  @ApiProperty({
    description: 'Eindeutige Stations-ID aus Pegelonline-API',
  })
  uuid: string;

  @ApiProperty({
    description: 'Pegelnummer aus Pegelonline-API',
  })
  number: string;

  @ApiProperty({
    description: 'Shortname aus Pegelonline-API',
  })
  shortname: string;

  @ApiProperty({
    description: 'Longname aus Pegelonline-API',
  })
  longname: string;

  @ApiProperty({
    description: 'Flusskilometer aus Pegelonline-API',
    required: false,
  })
  km?: number;

  @ApiProperty({
    description: 'Agency aus Pegelonline-API',
  })
  agency: string;

  @ApiProperty({
    description: 'Longitude aus Pegelonline-API',
    required: false,
  })
  longitude?: number;

  @ApiProperty({
    description: 'Latitude aus Pegelonline-API',
    required: false,
  })
  latitude?: number;

  @ApiProperty({
    description: 'Water aus Pegelonline-API',
  })
  water: {
    shortname: string;
    longname: string;
  };

  @ApiProperty({
    description: 'Alternative Benennungen zu Water',
    required: false,
  })
  water_alternatives?: string[];

  @ApiProperty({
    description: 'Stadt - angereichert in der DICT-API',
    required: false,
  })
  city?: string;

  @ApiProperty({
    description: 'Alternative Benennungen zur Stadt',
    required: false,
  })
  city_alternatives?: string[];

  @ApiProperty({
    description: 'Land - angereichert in der DICT-API',
    required: false,
  })
  country?: string;

  @ApiProperty({
    description: 'Alternative Benennungen zum Land',
    required: false,
  })
  country_alternatives?: string[];

  @ApiProperty({
    description: 'Bundesland - angereichert in der DICT-API',
    required: false,
  })
  land?: string;

  @ApiProperty({
    description: 'Alternative Benennungen zum Bundesland',
    required: false,
  })
  land_alternatives?: string[];

  @ApiProperty({
    description: 'Landkreis - angereichert in der DICT-API',
    required: false,
  })
  kreis?: string;

  @ApiProperty({
    description: 'Alternative Benennungen zum Landkreis',
    required: false,
  })
  kreis_alternatives?: string[];

  @ApiProperty({
    description: 'Einzugsgebiet - angereichert in der DICT-API',
    required: false,
  })
  einzugsgebiet?: string;

  @ApiProperty({
    description: 'Alternative Benennungen zum Einzugsgebiet',
    required: false,
  })
  einzugsgebiet_alternatives?: string[];

  @ApiProperty({
    description: 'Zugehöriger mqtt topic für alle Messungen an der Station',
    required: false,
  })
  mqtttopic: string;

  @ApiProperty({
    description: 'Timeseries aus Pegelonline-API',
    type: [PegelonlineTimeseries],
  })
  timeseries: PegelonlineTimeseries[];
}

/** The response of /search. */
export class AggregatedStationResponse {
  @ApiProperty({
    description: 'Liste aller MQTT topics zu den Stationen',
  })
  mqtttopics: string[];

  @ApiProperty({
    description: 'Liste aller Pegelonline-URLs zu den Stationen',
  })
  pegelonlinelinks: string[];

  @ApiProperty({
    description: 'Liste aller Pegelonlinestationen',
    type: [PegelonlineStation],
  })
  stations: PegelonlineStation[];
}

/** Only stations with coordinates are harvested. */
export type LocatedStation = PegelonlineStation & {
  latitude: number;
  longitude: number;
};
