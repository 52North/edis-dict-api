import { ApiProperty } from '@nestjs/swagger';

/** The gauge zero of a timeseries from the pegelonline REST API v2. */
export class PegelonlineGaugeZero {
  @ApiProperty({
    description: 'Höhenbezug des Pegelnullpunkts (z.B. <code>m. ü. NHN</code>)',
  })
  unit: string;

  @ApiProperty({
    description: 'Höhe des Pegelnullpunkts',
  })
  value: number;

  @ApiProperty({
    description: 'Datum, ab dem der Pegelnullpunkt gilt',
    format: 'date',
  })
  validFrom: string;
}

/**
 * A disruption or outage of a timeseries from the pegelonline REST API v2, for
 * a forecast its source and creation time.
 */
export class PegelonlineComment {
  @ApiProperty({
    description:
      'Kurzbeschreibung der Störung oder des Ausfalls, bei Vorhersagen das Kürzel der Quelle (z.B. <code>nwv-bfg</code>)',
  })
  shortDescription: string;

  @ApiProperty({
    description:
      'Ausführliche Beschreibung der Störung oder des Ausfalls, bei Vorhersagen Erstellungszeit und Quelle',
  })
  longDescription: string;
}

/**
 * A timeseries of a station from the pegelonline REST API v2. mqtttopic and
 * pegelonlinelink are only added for the response, see
 * StationsService.prepareResponse, the harvest stores sensorweblink.
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
    description:
      'mqtt Topic für die Zeitreihe, fehlt bei Vorhersagen (<code>WV</code>)',
    required: false,
  })
  mqtttopic?: string;

  @ApiProperty({
    description:
      'Link zu den Messwerten, bei Vorhersagen zur aktuellen Vorhersage',
  })
  pegelonlinelink: string;

  @ApiProperty({
    description:
      'Link zum Download der Messwerte als CSV über die Sensor Web API, ohne <code>timespan</code> die letzte Woche, mit <code>timespan</code> als ISO-8601-Zeitraum der angegebene (z.B. <code>?timespan=PT24H/now</code>); fehlt bei Zeitreihen ohne Dataset in der Sensor Web API',
    required: false,
  })
  sensorweblink?: string;

  @ApiProperty({
    description: 'Abstand der Messwerte in Minuten',
  })
  equidistance: number;

  @ApiProperty({
    description:
      'Pegelnullpunkt aus Pegelonline-API, fehlt bei Zeitreihen ohne Pegelnullpunkt',
    required: false,
    type: PegelonlineGaugeZero,
  })
  gaugeZero?: PegelonlineGaugeZero;

  @ApiProperty({
    description:
      'Störung oder Ausfall der Zeitreihe aus Pegelonline-API, bei Vorhersagen deren Quelle und Erstellungszeit zum Stand des letzten Harvests, fehlt sonst',
    required: false,
    type: PegelonlineComment,
  })
  comment?: PegelonlineComment;
}

/** The water of a station from the pegelonline REST API v2. */
export class PegelonlineWater {
  @ApiProperty({
    description: 'Shortname des Gewässers aus Pegelonline-API',
  })
  shortname: string;

  @ApiProperty({
    description: 'Longname des Gewässers aus Pegelonline-API',
  })
  longname: string;
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
    description:
      'Longitude aus Pegelonline-API, fehlt bei Stationen ohne Koordinaten',
    required: false,
  })
  longitude?: number;

  @ApiProperty({
    description:
      'Latitude aus Pegelonline-API, fehlt bei Stationen ohne Koordinaten',
    required: false,
  })
  latitude?: number;

  @ApiProperty({
    description:
      'Telefonnummer der Pegelansage aus Pegelonline-API im internationalen Format, fehlt bei Stationen ohne Ansage',
    required: false,
  })
  voiceServiceNumber?: string;

  @ApiProperty({
    description:
      'Hinweis zur Station aus Pegelonline-API (z.B. <code>Abflussermittlung unter W=221cm nicht möglich</code>)',
    required: false,
  })
  remark?: string;

  @ApiProperty({
    description: 'Water aus Pegelonline-API',
    type: PegelonlineWater,
  })
  water: PegelonlineWater;

  @ApiProperty({
    description: 'Alternative Benennungen zu Water',
    required: false,
  })
  water_alternatives?: string[];

  @ApiProperty({
    description:
      'Namen zum Gewässer je Sprache, derzeit nur Englisch: die erste Übersetzung aus der Suchwortliste; weitere Übersetzungen und Kürzel stehen nur in <code>water_alternatives</code>',
    required: false,
    type: Object,
    additionalProperties: { type: 'string' },
    example: { en: 'Rhine' },
  })
  water_names?: Record<string, string>;

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
    description:
      'Namen zur Stadt je Sprache der Nominatim-Abfrage (<code>ADDITIONAL_HARVEST_LANGUAGE_LIST</code>), nur vom deutschen Namen abweichende; Umschreibungen und Kürzel stehen nur in <code>city_alternatives</code>',
    required: false,
    type: Object,
    additionalProperties: { type: 'string' },
    example: { en: 'Cologne', nl: 'Keulen' },
  })
  city_names?: Record<string, string>;

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
    description:
      'Namen zum Land je Sprache der Nominatim-Abfrage (<code>ADDITIONAL_HARVEST_LANGUAGE_LIST</code>), nur vom deutschen Namen abweichende; Umschreibungen und Kürzel stehen nur in <code>country_alternatives</code>',
    required: false,
    type: Object,
    additionalProperties: { type: 'string' },
    example: { en: 'Germany', fr: 'Allemagne' },
  })
  country_names?: Record<string, string>;

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
    description:
      'Namen zum Bundesland je Sprache der Nominatim-Abfrage (<code>ADDITIONAL_HARVEST_LANGUAGE_LIST</code>), nur vom deutschen Namen abweichende; Umschreibungen und Kürzel stehen nur in <code>land_alternatives</code>',
    required: false,
    type: Object,
    additionalProperties: { type: 'string' },
    example: { en: 'Lower Saxony', fr: 'Basse-Saxe' },
  })
  land_names?: Record<string, string>;

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
    description:
      'Namen zum Landkreis je Sprache der Nominatim-Abfrage (<code>ADDITIONAL_HARVEST_LANGUAGE_LIST</code>), nur vom deutschen Namen abweichende; Umschreibungen und Kürzel stehen nur in <code>kreis_alternatives</code>',
    required: false,
    type: Object,
    additionalProperties: { type: 'string' },
    example: {
      fr: 'Arrondissement de Poméranie-Occidentale-Rügen',
      pl: 'Pomorze Przednie-Rugia',
    },
  })
  kreis_names?: Record<string, string>;

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
    description:
      'Namen zum Einzugsgebiet je Sprache, derzeit nur Englisch: die erste Übersetzung aus der Suchwortliste; weitere Übersetzungen und Kürzel stehen nur in <code>einzugsgebiet_alternatives</code>',
    required: false,
    type: Object,
    additionalProperties: { type: 'string' },
    example: { en: 'Baltic Sea' },
  })
  einzugsgebiet_names?: Record<string, string>;

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

/** Only stations with coordinates are geocoded and get a drainage area. */
export type LocatedStation = PegelonlineStation & {
  latitude: number;
  longitude: number;
};
