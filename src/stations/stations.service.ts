import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiProperty } from '@nestjs/swagger';
import * as turf from '@turf/turf';
import { AxiosRequestConfig } from 'axios';
import { CronJob } from 'cron';
import { readFile, readFileSync, rename, writeFile } from 'fs';
import { catchError, forkJoin, map, Observable, of } from 'rxjs';

import { AddressData, NominatimService } from '../nominatim/nominatim.service';
import { SearchTermListService } from '../search-term-list/search-term-list';

// the station list with all timeseries is large, so allow more time than for nominatim
const PEGELONLINE_TIMEOUT_MS = 60000;

type FilterPropertyKey =
  | 'country'
  | 'land'
  | 'kreis'
  | 'agency'
  | 'einzugsgebiet';

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
  equidistance: number;
}

interface AddressOptions {
  id: string;
  country: string;
  country_alternatives?: string[];
  land: string;
  land_alternatives?: string[];
  kreis: string;
  kreis_alternatives?: string[];
  city: string;
  city_alternatives?: string[];
}

interface AddressTupel {
  country: string;
  land: string;
  kreis: string;
  city: string;
}

interface DrainageArea {
  name?: string;
  polygon: ReturnType<typeof turf.multiPolygon>;
}

export class PegelonlineStation {
  @ApiProperty({
    description: 'Eindeutige Stations-ID aus Pegelonline-API',
  })
  uuid: string;

  number: string;

  @ApiProperty({
    description: 'Shortname aus Pegelonline-API',
  })
  shortname: string;

  @ApiProperty({
    description: 'Longname aus Pegelonline-API',
  })
  longname: string;

  km: number;

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
    description: 'Alternative Bennenungen zu Water',
    required: false,
  })
  water_alternatives?: string[];

  @ApiProperty({
    description: 'Stadt - angereichert in der DICT-API',
    required: false,
  })
  city?: string;

  @ApiProperty({
    description: 'Alternative Bennenungen zur Stadt',
    required: false,
  })
  city_alternatives?: string[];

  @ApiProperty({
    description: 'Land - angereichert in der DICT-API',
    required: false,
  })
  country?: string;

  @ApiProperty({
    description: 'Alternative Bennenungen zum Land',
    required: false,
  })
  country_alternatives?: string[];

  @ApiProperty({
    description: 'Bundesland - angereichert in der DICT-API',
    required: false,
  })
  land?: string;

  @ApiProperty({
    description: 'Alternative Bennenungen zum Bundesland',
    required: false,
  })
  land_alternatives?: string[];

  @ApiProperty({
    description: 'Landkreis - angereichert in der DICT-API',
    required: false,
  })
  kreis?: string;

  @ApiProperty({
    description: 'Alternative Bennenungen zum Landkreis',
    required: false,
  })
  kreis_alternatives?: string[];

  @ApiProperty({
    description: 'Einzugsgebiet - angereichert in der DICT-API',
    required: false,
  })
  einzugsgebiet?: string;

  @ApiProperty({
    description: 'Alternative Bennenungen zum Einzugsgebiet',
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
    type: PegelonlineTimeseries,
  })
  timeseries: PegelonlineTimeseries[];
}

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

export class StationQuery {
  @ApiProperty({
    required: false,
    description: 'Suche über einen Stationsnamen (z.B. <code>Köln</code>)',
  })
  station?: string;
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
    description: 'Suche über ein Landkreis (z.B. <code>Emsland</code>)',
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
      'Suche über einen Beobachtungsparameter (z.B. <code>Wassertemperatur</code>)',
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
}

export type Bbox = [number, number, number, number];

// parses "minLon,minLat,maxLon,maxLat", returns undefined if it is no valid bbox
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

@Injectable()
export class StationsService {
  private readonly logger = new Logger(StationsService.name);

  private stations: PegelonlineStation[] = [];

  private readonly stationsFilePath = this.configService.get<string>(
    'STATIONS_FILE_PATH',
    'stations.json',
  );
  private readonly einzugsgebieteFilePath = this.configService.get<string>(
    'EINZUGSGEBIETE_FILE_PATH',
    'einzugsgebiete.geojson',
  );
  private readonly pegelonlineBaseUrl = this.configService.get<string>(
    'PEGELONLINE_BASE_URL',
  );
  private readonly mqttBase = this.configService.get<string>(
    'MQTT_BASE',
    'edis/pegelonline',
  );

  private readonly harvestLanguageList: string[] = [];

  private readonly proxyProtocol =
    this.configService.get<string>('PROXY_PROTOCOL');
  private readonly proxyHost = this.configService.get<string>('PROXY_HOST');
  private readonly proxyPort = this.configService.get<number>('PROXY_PORT');

  private readonly runDataEnlargingOnInit =
    this.configService.get('RUN_DATA_ENLARGING_ON_INIT', 'true') === 'true';

  private readonly cronTimeForDataEnlarging = this.configService.get<string>(
    'CRON_TIME_FOR_DATA_ENLARGING',
    '00 00 * * *',
  );

  private stationCount = 0;
  private count = 0;
  private harvestRunning = false;

  // loaded on first use during a harvest and released afterwards, the parsed file needs ~150 MB
  private drainageAreas?: DrainageArea[];

  constructor(
    private readonly httpService: HttpService,
    private readonly nominatimSrvc: NominatimService,
    private readonly configService: ConfigService,
    private readonly searchTermListSrvc: SearchTermListService,
  ) {
    this.loadStations().then(() => {
      new CronJob(
        this.cronTimeForDataEnlarging,
        () => {
          this.fetchStations();
        },
        null,
        true,
        null,
        null,
        this.runDataEnlargingOnInit,
      );
    });

    const langListConfig = this.configService.get<string>(
      'ADDITIONAL_HARVEST_LANGUAGE_LIST',
    );
    if (langListConfig) {
      this.harvestLanguageList = langListConfig.split(',');
    }
  }

  getStations(query: StationQuery = {}): Observable<PegelonlineStation[]> {
    return of(this.stations).pipe(
      map((stations) => this.filterResults(stations, query)),
    );
  }

  private filterQ(
    query: StationQuery,
    stations: PegelonlineStation[],
  ): PegelonlineStation[] {
    if (!query.q) {
      return stations;
    }
    const filter = query.q;
    const fields = [
      'shortname',
      'longname',
      'agency',
      'country',
      'country_alternatives',
      'land',
      'land_alternatives',
      'kreis',
      'kreis_alternatives',
      'uuid',
      'water_alternatives',
      'einzugsgebiet',
      'einzugsgebiet_alternatives',
      'city',
      'city_alternatives',
    ];
    const waterFields = ['shortname', 'longname'];
    const timeseriesFields = ['shortname', 'longname'];
    this.logger.log(`Filter with q: ${filter}`);
    return stations.filter((station) => {
      const matchField = fields.some((f) => {
        const prop = station[f];
        if (typeof prop === 'string') {
          return prop.toLowerCase().indexOf(filter.toLowerCase()) >= 0;
        } else if (prop instanceof Array) {
          return prop.some(
            (e) => e.toLowerCase().indexOf(filter.toLowerCase()) >= 0,
          );
        }
      });
      const matchWaterFields = waterFields.some(
        (wf) =>
          station.water[wf] &&
          station.water[wf].toLowerCase().indexOf(filter.toLowerCase()) >= 0,
      );
      const matchTimeseriesFields = timeseriesFields.some((tsf) =>
        station.timeseries.some(
          (ts) => ts[tsf].toLowerCase().indexOf(filter.toLowerCase()) >= 0,
        ),
      );
      return matchField || matchWaterFields || matchTimeseriesFields;
    });
  }

  prepareResponse(stations: PegelonlineStation[]): AggregatedStationResponse {
    // TODO: add here some intelligent aggregation of mqtt topics
    const mqtttopics = [];
    const pegelonlinelinks = [];
    const preparedStations = stations.map((st) => {
      const stationTopic = `${this.mqttBase}/+/+/+/+/${st.uuid}/+`;
      mqtttopics.push(stationTopic);
      const timeseries = st.timeseries.map((ts) => {
        const mqtttopic = `${this.mqttBase}/+/+/+/+/${st.uuid}/${ts.shortname}`;
        const pegelonlinelink = `${this.pegelonlineBaseUrl}/stations/${st.uuid}/${ts.shortname}/measurements.json`;
        pegelonlinelinks.push(pegelonlinelink);
        return { ...ts, mqtttopic, pegelonlinelink } as PegelonlineTimeseries;
      });
      const station = {
        ...st,
        timeseries,
        mqtttopic: stationTopic,
      } as PegelonlineStation;
      return station;
    });
    return {
      mqtttopics,
      pegelonlinelinks,
      stations: preparedStations,
    };
  }

  private filterResults(
    originStations: PegelonlineStation[],
    query: StationQuery,
  ): PegelonlineStation[] {
    originStations = this.filterQ(query, originStations);
    originStations = this.filterStation(query, originStations);
    originStations = this.filterGewaesser(query, originStations);
    originStations = this.filter(query, 'land', originStations);
    originStations = this.filter(query, 'agency', originStations);
    originStations = this.filter(query, 'country', originStations);
    originStations = this.filter(query, 'einzugsgebiet', originStations);
    originStations = this.filter(query, 'kreis', originStations);
    // TODO: add region filter
    originStations = this.filterParameter(query, originStations);
    originStations = this.filterBbox(query, originStations);
    return originStations;
  }

  private filterStation(query: StationQuery, stations: PegelonlineStation[]) {
    if (query.station) {
      const filter = query.station;
      this.logger.log(`Filter with Station: ${filter}`);
      stations = stations.filter(
        (e) => e.shortname.toLowerCase().indexOf(filter.toLowerCase()) >= 0,
      );
    }
    return stations;
  }

  private filterGewaesser(query: StationQuery, stations: PegelonlineStation[]) {
    if (query.gewaesser) {
      const filter = query.gewaesser;
      this.logger.log(`Filter with Gewaesser: ${filter}`);
      stations = stations.filter(
        (e) =>
          e.water.shortname.toLowerCase().indexOf(filter.toLowerCase()) >= 0 ||
          // whole name ignoring case, a substring match would let "Elbe" also find e.g. the Elbe-Havel-Kanal
          e.water.longname?.toLowerCase() === filter.toLowerCase() ||
          e.water_alternatives?.some(
            (alt) => alt.toLowerCase().indexOf(filter.toLowerCase()) >= 0,
          ),
      );
    }
    return stations;
  }

  private filterParameter(
    query: StationQuery,
    stations: PegelonlineStation[],
  ): PegelonlineStation[] {
    if (query.parameter) {
      const filter = query.parameter;
      this.logger.log(`Filter with Parameter: ${filter}`);
      return stations.filter((st) =>
        st.timeseries.find(
          (ts) =>
            ts.longname.toLowerCase() === filter.toLowerCase() ||
            ts.shortname.toLowerCase() === filter.toLowerCase(),
        ),
      );
    }
    return stations;
  }

  private filter(
    query: StationQuery,
    propertyKey: FilterPropertyKey,
    stations: PegelonlineStation[],
  ): PegelonlineStation[] {
    const filterTerm = query[propertyKey];
    if (filterTerm) {
      this.logger.log(`Filter with paramter ${propertyKey}: ${filterTerm}`);
      return stations.filter((st) => {
        const match =
          st[propertyKey]?.toLowerCase().indexOf(filterTerm.toLowerCase()) >= 0;
        if (propertyKey === 'country' && !match) {
          return st.country_alternatives?.some(
            (e) => e.toLowerCase().indexOf(filterTerm.toLowerCase()) >= 0,
          );
        }
        if (propertyKey === 'land' && !match) {
          return st.land_alternatives?.some(
            (e) => e.toLowerCase().indexOf(filterTerm.toLowerCase()) >= 0,
          );
        }
        if (propertyKey === 'kreis' && !match) {
          return st.kreis_alternatives?.some(
            (e) => e.toLowerCase().indexOf(filterTerm.toLowerCase()) >= 0,
          );
        }
        if (propertyKey === 'einzugsgebiet' && !match) {
          return st.einzugsgebiet_alternatives?.some(
            (e) => e.toLowerCase().indexOf(filterTerm.toLowerCase()) >= 0,
          );
        }
        return match;
      });
    }
    return stations;
  }

  private filterBbox(
    query: StationQuery,
    stations: PegelonlineStation[],
  ): PegelonlineStation[] {
    const bbox = query.bbox ? parseBbox(query.bbox) : undefined;
    if (bbox) {
      this.logger.log(`Filter with paramter bbox: ${bbox}`);
      const [minLon, minLat, maxLon, maxLat] = bbox;
      return stations.filter(
        (st) =>
          st.longitude >= minLon &&
          st.longitude <= maxLon &&
          st.latitude >= minLat &&
          st.latitude <= maxLat,
      );
    }
    return stations;
  }

  private fetchStations() {
    if (this.harvestRunning) {
      this.logger.warn(`Previous harvest is still running, skipping this one`);
      return;
    }
    this.harvestRunning = true;
    this.logger.log(`Start fetching stations`);
    const config: AxiosRequestConfig = { timeout: PEGELONLINE_TIMEOUT_MS };
    if (this.proxyProtocol && this.proxyHost && this.proxyPort) {
      config.proxy = {
        protocol: this.proxyProtocol,
        host: this.proxyHost,
        port: this.proxyPort,
      };
    }
    const url = `${this.pegelonlineBaseUrl}/stations.json?includeTimeseries=true`;
    this.httpService
      .get<PegelonlineStation[]>(url, config)
      .pipe(map((res) => res.data))
      .subscribe({
        next: (fetchedStations) => {
          this.cleanupStationList(fetchedStations);
          const filteredStations = fetchedStations.filter((st) =>
            this.filterStations(st),
          );
          this.stationCount = filteredStations.length;
          this.count = 0;
          if (this.stationCount === 0) {
            this.harvestRunning = false;
          }
          filteredStations.forEach((st) => {
            this.extendStation(st);
          });
        },
        error: (err) => {
          this.logger.error(err.stack);
          this.harvestRunning = false;
        },
      });
  }

  private cleanupStationList(newList: PegelonlineStation[]) {
    this.stations = this.stations.filter(
      (st) => newList.find((nSt) => nSt.uuid === st.uuid) !== undefined,
    );
  }

  private extendStation(station: PegelonlineStation) {
    this.fetchAddressData(station).subscribe({
      next: (data) => {
        if (data.country) {
          this.setAddress(station, {
            ...data,
            kreis_alternatives: this.mergeToArray([
              data.kreis_alternatives,
              this.searchTermListSrvc.getAlternativeKreise(data.kreis),
            ]),
          });
        } else {
          this.logger.warn(
            `Failed geocoding for station ${station.longname}, keeping previous address data`,
          );
          this.keepPreviousAddress(station);
        }
        this.enlargeAndAddStation(station);
      },
      error: (error) => {
        this.logger.error(
          `Error occurred while requesting additional address data for ${station.longname}, keeping previous address data`,
        );
        this.logger.error(error.stack);
        this.keepPreviousAddress(station);
        this.enlargeAndAddStation(station);
      },
    });
  }

  private setAddress(
    station: PegelonlineStation,
    address: Partial<AddressOptions>,
  ) {
    station.country = address.country;
    station.country_alternatives = address.country_alternatives;
    station.land = address.land;
    station.land_alternatives = address.land_alternatives;
    station.kreis = address.kreis;
    station.kreis_alternatives = address.kreis_alternatives;
    station.city = address.city;
    station.city_alternatives = address.city_alternatives;
  }

  private keepPreviousAddress(station: PegelonlineStation) {
    const previous = this.stations.find((st) => st.uuid === station.uuid);
    if (previous) {
      this.setAddress(station, previous);
    }
  }

  // enlarge with data, that does not depend on geocoding
  private enlargeAndAddStation(station: PegelonlineStation) {
    station.water_alternatives =
      this.searchTermListSrvc.getAlternativeGewaesser(station.water.longname);
    if (station.latitude && station.longitude) {
      const drainage = this.getDrainage(station.latitude, station.longitude);
      station.einzugsgebiet = drainage;
      station.einzugsgebiet_alternatives =
        this.searchTermListSrvc.getAlternativeEinzugsgebiete(drainage);
    }
    this.logger.log(`Enlarging data for station ${station.longname}`);
    this.addStation(station);
  }

  private addStation(station: PegelonlineStation) {
    this.count++;
    const match = this.stations.findIndex((st) => st.uuid === station.uuid);
    if (match >= 0) {
      this.stations[match] = station;
    } else {
      this.stations.push(station);
    }
    this.logger.log(
      `added station ${station.longname} - ${this.count}/${this.stationCount}`,
    );
    if (this.count === this.stationCount) {
      this.finishHarvest();
    }
  }

  private finishHarvest() {
    this.logger.log(`Finished enlarging ${this.count} stations`);
    this.drainageAreas = undefined;
    this.saveFetchedStations();
    this.harvestRunning = false;
  }

  private mergeToArray(entries: string[][]): string[] | undefined {
    const list = entries.filter((e) => e !== undefined).flat();
    return list.length ? list : undefined;
  }

  private filterStations(s: PegelonlineStation): boolean {
    if (s.latitude && s.longitude) {
      return true;
    } else {
      this.stationCount--;
      this.logger.warn(`${s.shortname} has no coordinates`);
      return false;
    }
  }

  private fetchAddressData(s: PegelonlineStation): Observable<AddressOptions> {
    const requests: { [key: string]: Observable<AddressData> } = {
      de: this.nominatimSrvc.getAdressData(
        s.uuid,
        s.latitude,
        s.longitude,
        'de',
      ),
    };
    this.harvestLanguageList.forEach((lang) => {
      requests[lang] = this.nominatimSrvc
        .getAdressData(s.uuid, s.latitude, s.longitude, lang)
        .pipe(
          // a failed additional language only lacks its alternatives, the station is still updated
          catchError((error) => {
            this.logger.warn(`${error.message}, skipping this language`);
            return of(undefined);
          }),
        );
    });
    return forkJoin(requests).pipe(
      map((res) => {
        const deData = res['de'];
        const deTupel = this.getTupel(deData);
        const response: AddressOptions = {
          id: deData.id,
          country: deTupel.country,
          country_alternatives: this.getTranscriptions(deTupel.country),
          land: deTupel.land,
          land_alternatives: this.getTranscriptions(deTupel.land),
          kreis: deTupel.kreis,
          kreis_alternatives: this.getTranscriptions(deTupel.kreis),
          city: deTupel.city,
          city_alternatives: this.getTranscriptions(deTupel.city),
        };
        this.harvestLanguageList.forEach((e) => {
          const data = res[e];
          if (!data) {
            return;
          }
          const tupel = this.getTupel(data);
          response.country_alternatives = this.addAlternative(
            response.country_alternatives,
            response.country,
            tupel.country,
          );
          response.land_alternatives = this.addAlternative(
            response.land_alternatives,
            response.land,
            tupel.land,
          );
          response.kreis_alternatives = this.addAlternative(
            response.kreis_alternatives,
            response.kreis,
            tupel.kreis,
          );
          response.city_alternatives = this.addAlternative(
            response.city_alternatives,
            response.city,
            tupel.city,
          );
        });
        return response;
      }),
    );
  }

  private addAlternative(
    alternatives: string[] | undefined,
    value: string,
    alternative?: string,
  ): string[] | undefined {
    if (
      !alternative ||
      alternative === value ||
      alternatives?.includes(alternative)
    ) {
      return alternatives;
    }
    return [...(alternatives ?? []), alternative];
  }

  private getTranscriptions(text?: string): string[] | undefined {
    if (text) {
      const transcription = text
        .replaceAll('ä', 'ae')
        .replaceAll('ö', 'oe')
        .replaceAll('ü', 'ue')
        .replaceAll('Ä', 'Ae')
        .replaceAll('Ö', 'Oe')
        .replaceAll('Ü', 'Ue')
        .replaceAll('ß', 'ss');
      if (transcription !== text) {
        return [transcription];
      }
    }
    return undefined;
  }

  private getTupel(data: AddressData): AddressTupel {
    return {
      country: data.country,
      land: data.state || data.county || data.city,
      kreis: data.county || data.city,
      city: data.city,
    };
  }

  private getDrainage(lat: number, lon: number): string | undefined {
    this.drainageAreas ??= this.loadDrainageAreas();
    const point = turf.point([lon, lat, 0]);
    return this.drainageAreas.find((area) =>
      turf.booleanPointInPolygon(point, area.polygon),
    )?.name;
  }

  private loadDrainageAreas(): DrainageArea[] {
    const fileContent = readFileSync(this.einzugsgebieteFilePath, 'utf-8');
    const geojson = JSON.parse(fileContent);
    if (
      geojson?.type !== 'FeatureCollection' ||
      !(geojson.features instanceof Array)
    ) {
      return [];
    }
    return geojson.features.map((feature) => ({
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

  // write to a temporary file first, so a crash while writing cannot break the existing file
  private saveFetchedStations() {
    const tmpFilePath = `${this.stationsFilePath}.tmp`;
    writeFile(tmpFilePath, JSON.stringify(this.stations, null, 2), (err) => {
      if (err) {
        this.logger.error(err);
        return;
      }
      rename(tmpFilePath, this.stationsFilePath, (renameErr) => {
        if (renameErr) {
          this.logger.error(renameErr);
        }
      });
    });
  }

  private loadStations() {
    return new Promise<void>((resolve) => {
      readFile(this.stationsFilePath, 'utf8', (err, data) => {
        if (err) {
          this.logger.warn(`Could not load stations.json`);
          return resolve();
        }
        try {
          this.stations = JSON.parse(data);
          this.stations.forEach((st) => this.removeEmptyAlternatives(st));
        } catch (error) {
          this.logger.warn(`Error while parsing stations data: ${error}`);
        }
        resolve();
      });
    });
  }

  // older harvests could store null entries, which break the search
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
