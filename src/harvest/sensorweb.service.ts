import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosRequestConfig } from 'axios';
import {
  catchError,
  concatMap,
  EMPTY,
  from,
  map,
  Observable,
  retry,
  switchMap,
  tap,
  toArray,
} from 'rxjs';

import { harvestProxy } from './proxy';

// without timeout, hanging requests block the request limiter in AppModule forever
const REQUEST_TIMEOUT_MS = 30000;

// the stations per datasets request, like the timeseries client does
export const BLOCK_SIZE = 50;

interface ApiFeature {
  id: string;
  properties?: { domainId?: string };
}

interface ApiDataset {
  id: string;
  domainId?: string;
}

/** The result of SensorWebService.findLinks. */
export interface SensorWebLinks {
  /** the download links by "{uuid}_{shortname}" of the timeseries */
  links: Map<string, string>;
  /** the uuids of the stations whose request failed */
  failed: Set<string>;
}

/**
 * Finds the datasets of the stations in the Sensor Web API at
 * SENSORWEB_API_URL (Dataset API v3, e.g. gdi-sos) and links to the download
 * of their data. Relies on the convention of gdi-sos: the domainId of a
 * feature is the pegelonline uuid, the one of a dataset "{uuid}_{shortname}".
 * The url ends with a slash, see validateConfig.
 */
@Injectable()
export class SensorWebService {
  private readonly logger = new Logger(SensorWebService.name);

  private readonly baseUrl =
    this.configService.get<string>('SENSORWEB_API_URL');

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  /** Without SENSORWEB_API_URL the harvest adds no links. */
  isEnabled(): boolean {
    return !!this.baseUrl;
  }

  /** Whether the link leads to the configured Sensor Web API, e.g. one of a previous harvest. */
  isOwnLink(link: string): boolean {
    return !!this.baseUrl && link.startsWith(this.baseUrl);
  }

  /**
   * The links to the data of the stations as CSV. Stations without feature
   * have no datasets and are not requested. The datasets are requested in
   * blocks of stations one after the other, a block is tried twice, as gdi-sos
   * now and then fails with a 500 that is gone on the next try. A failing
   * block fails only its own stations, failing features all of them. Never
   * errors.
   */
  findLinks(uuids: string[]): Observable<SensorWebLinks> {
    const result: SensorWebLinks = { links: new Map(), failed: new Set() };
    return this.featureIds().pipe(
      catchError((error) => {
        this.logger.warn(`Error getting the features: ${error.message}`);
        uuids.forEach((uuid) => result.failed.add(uuid));
        return EMPTY;
      }),
      switchMap((featureIds) => {
        const located = uuids.filter((uuid) => featureIds.has(uuid));
        return from(blocks(located, BLOCK_SIZE)).pipe(
          concatMap((block) =>
            this.datasets(block.map((uuid) => featureIds.get(uuid) ?? '')).pipe(
              tap((datasets) => this.addLinks(result, datasets)),
              catchError((error) => {
                this.logger.warn(
                  `Error getting the datasets of ${block.length} stations: ${error.message}`,
                );
                block.forEach((uuid) => result.failed.add(uuid));
                return EMPTY;
              }),
            ),
          ),
        );
      }),
      // emits once at the end, also without any block
      toArray(),
      map(() => result),
    );
  }

  /** The feature ids by pegelonline uuid. */
  private featureIds(): Observable<Map<string, string>> {
    return this.httpService
      .get<ApiFeature[]>(`${this.baseUrl}features`, this.requestConfig())
      .pipe(
        map((res) => {
          const ids = new Map<string, string>();
          for (const feature of res.data) {
            if (feature.properties?.domainId) {
              ids.set(feature.properties.domainId, feature.id);
            }
          }
          return ids;
        }),
      );
  }

  private datasets(featureIds: string[]): Observable<ApiDataset[]> {
    return this.httpService
      .get<ApiDataset[]>(`${this.baseUrl}datasets`, {
        ...this.requestConfig(),
        params: { features: featureIds.join(','), datasetTypes: 'timeseries' },
      })
      .pipe(
        retry(1),
        map((res) => res.data),
      );
  }

  private addLinks(result: SensorWebLinks, datasets: ApiDataset[]) {
    for (const { id, domainId } of datasets) {
      if (domainId) {
        result.links.set(domainId, `${this.baseUrl}datasets/${id}/data.csv`);
      }
    }
  }

  private requestConfig(): AxiosRequestConfig {
    const config: AxiosRequestConfig = { timeout: REQUEST_TIMEOUT_MS };
    const proxy = harvestProxy(this.configService);
    if (proxy) {
      config.proxy = proxy;
    }
    return config;
  }
}

function blocks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let start = 0; start < items.length; start += size) {
    result.push(items.slice(start, start + size));
  }
  return result;
}
