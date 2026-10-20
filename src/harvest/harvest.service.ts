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
import { LocatedStation, PegelonlineStation } from '../stations/station.model';
import { DrainageAreasService } from './drainage-areas.service';
import { GeocodingService, StationAddress } from './geocoding.service';

// the station list with all timeseries is large, so allow more time than for nominatim
const PEGELONLINE_TIMEOUT_MS = 60000;

// fetches the stations from pegelonline and enriches them with address, synonyms and drainage area
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

  private cronJob?: CronJob;

  constructor(
    private readonly httpService: HttpService,
    private readonly geocodingSrvc: GeocodingService,
    private readonly drainageAreasSrvc: DrainageAreasService,
    private readonly searchTermListSrvc: SearchTermListService,
    private readonly stationStore: StationStore,
    private readonly configService: ConfigService,
  ) {}

  // load first, so searches find the stations right after the start and the first harvest can keep their addresses
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
      .pipe(
        map((res) => res.data.filter((st) => this.hasCoordinates(st))),
        mergeMap((stations) => {
          // rather a fault of pegelonline than the end of all stations
          if (!stations.length) {
            this.logger.warn(`Received no stations, keeping the previous ones`);
            return EMPTY;
          }
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

  private enrichStation(
    station: LocatedStation,
  ): Observable<PegelonlineStation> {
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
          this.logger.warn(
            `Failed geocoding for station ${station.longname}, keeping previous address data`,
          );
          this.keepPreviousAddress(station);
        }
        this.enlargeStation(station);
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

  // enlarge with data, that does not depend on geocoding
  private enlargeStation(station: LocatedStation) {
    station.water_alternatives =
      this.searchTermListSrvc.getAlternativeGewaesser(station.water.longname);
    const drainage = this.drainageAreasSrvc.find(
      station.latitude,
      station.longitude,
    );
    station.einzugsgebiet = drainage;
    station.einzugsgebiet_alternatives =
      this.searchTermListSrvc.getAlternativeEinzugsgebiete(drainage);
    this.logger.log(`Enlarging data for station ${station.longname}`);
  }

  // searches see the previous stations until the whole harvest is done
  private finishHarvest(stations: PegelonlineStation[]) {
    this.stationStore.replace(stations);
    this.logger.log(`Finished enlarging ${stations.length} stations`);
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
    this.logger.warn(`${s.shortname} has no coordinates`);
    return false;
  }
}
