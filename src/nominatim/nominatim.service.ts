import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosRequestConfig } from 'axios';
import { catchError, map, Observable } from 'rxjs';

// without timeout, hanging requests block the request limiter in AppModule forever
const REQUEST_TIMEOUT_MS = 30000;

/** Nominatim leaves out the parts it does not know, e.g. the county of a city. */
export interface AddressData {
  id: string;
  county?: string;
  state?: string;
  country?: string;
  city?: string;
}

interface NominatimReverseResponse {
  error?: string;
  place_id: number;
  address?: {
    state?: string;
    county?: string;
    city?: string;
    country?: string;
  };
}

/**
 * Reverse geocoding with the nominatim at NOMINATIM_BASE_URL, e.g. the one of
 * docker/docker-compose.yml. The url ends with a slash, see validateConfig.
 */
@Injectable()
export class NominatimService {
  private nominatimBaseUrl =
    this.configService.get<string>('NOMINATIM_BASE_URL');
  private readonly logger = new Logger(NominatimService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * The address at the point in the given language (Accept-Language). Request
   * errors become an Error naming the station and language, a response without
   * address gives empty values instead.
   */
  getAdressData(
    id: string,
    lat: number,
    lon: number,
    lang: string,
  ): Observable<AddressData> {
    const url = `${this.nominatimBaseUrl}reverse?lat=${lat}&lon=${lon}&format=json`;
    const config: AxiosRequestConfig = {
      headers: { 'Accept-Language': lang },
      timeout: REQUEST_TIMEOUT_MS,
    };
    return this.httpService.get<NominatimReverseResponse>(url, config).pipe(
      map((res) => res.data),
      catchError((err) => {
        throw new Error(
          `Error getting address data for ${id} (${lang}): ${err.message}`,
        );
      }),
      map((res) => {
        if (res.address) {
          return {
            id: id,
            country: res.address.country,
            state: res.address.state,
            county: res.address.county,
            city: res.address.city,
          };
        }
        this.logger.warn(
          `Reverse geocoding failed for ${id} (${lang}): ${res.error ?? 'no address in response'}`,
        );
        return {
          id: id,
          country: '',
          state: '',
          county: '',
          city: '',
        };
      }),
    );
  }
}
