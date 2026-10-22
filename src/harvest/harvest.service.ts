import { HttpService } from '@nestjs/axios';
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosRequestConfig } from 'axios';
import { CronJob } from 'cron';
import {
  catchError,
  EMPTY,
  finalize,
  forkJoin,
  map,
  mergeMap,
  Observable,
  of,
} from 'rxjs';

import { SearchTermListService } from '../search-term-list/search-term-list';
import { StationStore } from '../stations/station-store';
import {
  LocatedStation,
  PegelonlineStation,
  PegelonlineTimeseries,
} from '../stations/station.model';
import { DrainageAreasService } from './drainage-areas.service';
import { GeocodingService, StationAddress } from './geocoding.service';

// the station list with all timeseries is large, so allow more time than for nominatim
const PEGELONLINE_TIMEOUT_MS = 60000;

// pegelonline delivers forecasts with the period they cover, see removeForecastPeriod
type DeliveredTimeseries = PegelonlineTimeseries & {
  start?: string;
  end?: string;
};

/**
 * Fetches the stations from pegelonline and enriches them with address,
 * synonyms and drainage area. Runs on CRON_TIME_FOR_DATA_ENLARGING and, with
 * RUN_DATA_ENLARGING_ON_INIT, on start. Stations without coordinates get
 * neither address nor drainage area, the enriched stations replace the stored
 * ones at the end.
 */
@Injectable()
export class HarvestService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(HarvestService.name);

  private readonly pegelonlineBaseUrl = this.configService.get<string>(
    'PEGELONLINE_BASE_URL',
  );

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

  private harvestRunning = false;

  // stations of the running harvest without address, a lot of them hint at a broken nominatim
  private failedGeocodings = 0;

  private cronJob?: CronJob;

  constructor(
    private readonly httpService: HttpService,
    private readonly geocodingSrvc: GeocodingService,
    private readonly drainageAreasSrvc: DrainageAreasService,
    private readonly searchTermListSrvc: SearchTermListService,
    private readonly stationStore: StationStore,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Loads the stored stations first, so searches find them right after the
   * start and the first harvest can keep their addresses.
   */
  async onModuleInit() {
    await this.stationStore.load();
    this.cronJob = CronJob.from({
      cronTime: this.cronTimeForDataEnlarging,
      onTick: () => this.fetchStations(),
      start: true,
      runOnInit: this.runDataEnlargingOnInit,
    });
  }

  onModuleDestroy() {
    return this.cronJob?.stop();
  }

  /**
   * Runs one harvest, skipped while the previous one is still running. The
   * PROXY_* settings only apply to the request to pegelonline.
   */
  private fetchStations() {
    if (this.harvestRunning) {
      this.logger.warn(`Previous harvest is still running, skipping this one`);
      return;
    }
    this.harvestRunning = true;
    this.failedGeocodings = 0;
    this.logger.log(`Start fetching stations`);
    const config: AxiosRequestConfig = { timeout: PEGELONLINE_TIMEOUT_MS };
    if (this.proxyProtocol && this.proxyHost && this.proxyPort) {
      config.proxy = {
        protocol: this.proxyProtocol,
        host: this.proxyHost,
        port: this.proxyPort,
      };
    }
    const url = `${this.pegelonlineBaseUrl}/stations.json?includeTimeseries=true&includeForecastTimeseries=true`;
    this.httpService
      .get<PegelonlineStation[]>(url, config)
      .pipe(
        map((res) => res.data),
        mergeMap((stations) => {
          // rather a fault of pegelonline than the end of all stations
          if (!stations.length) {
            this.logger.warn(`Received no stations, keeping the previous ones`);
            return EMPTY;
          }
          stations.forEach((st) => this.removeForecastPeriod(st));
          // keeps the order of pegelonline
          return forkJoin(stations.map((st) => this.enrichStation(st)));
        }),
        finalize(() => {
          this.drainageAreasSrvc.release();
          this.harvestRunning = false;
        }),
      )
      .subscribe({
        next: (stations) => this.finishHarvest(stations),
        error: (err) => this.logger.error(err.stack),
      });
  }

  /**
   * Adds the synonyms of the water to the station and, if it has coordinates,
   * address and drainage area.
   */
  private enrichStation(
    station: PegelonlineStation,
  ): Observable<PegelonlineStation> {
    // without coordinates, the search still finds the station by name, water and parameter
    const located = this.hasCoordinates(station)
      ? this.locateStation(station)
      : of(station);
    return located.pipe(
      map(() => {
        station.water_alternatives =
          this.searchTermListSrvc.getAlternativeGewaesser(
            station.water.longname,
          );
        this.logger.log(`Enlarging data for station ${station.longname}`);
        return station;
      }),
      // a single broken station must not stop the whole harvest
      catchError((error) => {
        this.logger.error(
          `Error occurred while enriching station ${station.longname}`,
        );
        this.logger.error(error.stack);
        return of(station);
      }),
    );
  }

  /**
   * Adds address and drainage area, both need the coordinates. If geocoding
   * fails, the station keeps the address of the previous harvest.
   */
  private locateStation(station: LocatedStation): Observable<LocatedStation> {
    return this.geocodingSrvc.getAddress(station).pipe(
      catchError((error) => {
        this.logger.error(
          `Error occurred while requesting address data for ${station.longname}`,
        );
        this.logger.error(error.stack);
        return of(undefined);
      }),
      map((address) => {
        if (address?.country) {
          this.setAddress(station, {
            ...address,
            kreis_alternatives: this.mergeToArray([
              address.kreis_alternatives,
              this.searchTermListSrvc.getAlternativeKreise(address.kreis),
            ]),
          });
        } else {
          this.failedGeocodings++;
          this.logger.warn(
            `Failed geocoding for station ${station.longname}, keeping previous address data`,
          );
          this.keepPreviousAddress(station);
        }
        const drainage = this.drainageAreasSrvc.find(station);
        station.einzugsgebiet = drainage;
        station.einzugsgebiet_alternatives =
          this.searchTermListSrvc.getAlternativeEinzugsgebiete(drainage);
        return station;
      }),
    );
  }

  /**
   * Removes start and end of the forecasts, the comment with their source
   * stays. The harvest runs once a day, but pegelonline publishes new forecasts
   * during the day, so both would be outdated most of the time. The
   * pegelonlinelink always leads to the current forecast.
   */
  private removeForecastPeriod(station: PegelonlineStation) {
    for (const ts of station.timeseries as DeliveredTimeseries[]) {
      delete ts.start;
      delete ts.end;
    }
  }

  private setAddress(
    station: PegelonlineStation,
    address: Partial<StationAddress>,
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
    const previous = this.stationStore.get(station.uuid);
    if (previous) {
      this.setAddress(station, previous);
    }
  }

  /** Searches see the previous stations until the whole harvest is done. */
  private finishHarvest(stations: PegelonlineStation[]) {
    this.stationStore.replace(stations);
    if (this.failedGeocodings) {
      this.logger.warn(
        `Finished enlarging ${stations.length} stations, geocoding failed for ${this.failedGeocodings} of them`,
      );
    } else {
      this.logger.log(`Finished enlarging ${stations.length} stations`);
    }
  }

  private mergeToArray(
    entries: (string[] | undefined)[],
  ): string[] | undefined {
    const list = entries.filter((e) => e !== undefined).flat();
    return list.length ? list : undefined;
  }

  private hasCoordinates(s: PegelonlineStation): s is LocatedStation {
    if (s.latitude && s.longitude) {
      return true;
    }
    this.logger.warn(
      `${s.shortname} has no coordinates, storing it without address and drainage area`,
    );
    return false;
  }
}
