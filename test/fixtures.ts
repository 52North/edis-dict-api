import {
  PegelonlineStation,
  PegelonlineTimeseries,
} from '../src/stations/station.model';

export const WATER_LEVEL = {
  shortname: 'W',
  longname: 'WASSERSTAND ROHDATEN',
} as PegelonlineTimeseries;

export const WATER_TEMPERATURE = {
  shortname: 'WT',
  longname: 'WASSERTEMPERATUR',
} as PegelonlineTimeseries;

// station as delivered by pegelonline, without enrichment
export function createStation(
  station: Partial<PegelonlineStation>,
): PegelonlineStation {
  return {
    uuid: 'uuid',
    number: '1',
    shortname: 'STATION',
    longname: 'STATION',
    km: 0,
    agency: 'AGENCY',
    longitude: 10,
    latitude: 51,
    water: { shortname: 'WATER', longname: 'WATER' },
    timeseries: [WATER_LEVEL],
    ...station,
  } as PegelonlineStation;
}

// stations as stored after a harvest
export const STATIONS: PegelonlineStation[] = [
  createStation({
    uuid: 'koeln',
    number: '2730010',
    shortname: 'KÖLN',
    longname: 'KÖLN',
    agency: 'RHEIN',
    longitude: 6.96,
    latitude: 50.94,
    water: { shortname: 'RHEIN', longname: 'RHEIN' },
    water_alternatives: ['Rhine'],
    country: 'Deutschland',
    country_alternatives: ['Germany'],
    land: 'Nordrhein-Westfalen',
    kreis: 'Köln',
    kreis_alternatives: ['Koeln'],
    city: 'Köln',
    city_alternatives: ['Koeln'],
    einzugsgebiet: 'Rhein',
    timeseries: [WATER_LEVEL, WATER_TEMPERATURE],
  }),
  createStation({
    uuid: 'herbrum',
    number: '3770030',
    shortname: 'HERBRUM',
    longname: 'HERBRUM',
    agency: 'MEPPEN',
    longitude: 7.3,
    latitude: 53.0,
    water: { shortname: 'DEK', longname: 'DORTMUND-EMS-KANAL' },
    water_alternatives: ['DEK'],
    country: 'Deutschland',
    land: 'Niedersachsen',
    kreis: 'Landkreis Emsland',
  }),
  createStation({
    uuid: 'genthin',
    number: '587535',
    shortname: 'GENTHIN',
    longname: 'GENTHIN',
    agency: 'MAGDEBURG',
    longitude: 12.16,
    latitude: 52.4,
    water: { shortname: 'EHK', longname: 'ELBE-HAVEL-KANAL' },
    land: 'Sachsen-Anhalt',
  }),
  createStation({
    uuid: 'dresden',
    number: '501060',
    shortname: 'DRESDEN',
    longname: 'DRESDEN',
    agency: 'DRESDEN',
    longitude: 13.74,
    latitude: 51.05,
    water: { shortname: 'ELBE', longname: 'ELBE' },
    water_alternatives: ['Elb'],
    land: 'Sachsen',
    kreis: 'Dresden',
    timeseries: [WATER_LEVEL, WATER_TEMPERATURE],
  }),
];
