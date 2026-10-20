import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { catchError, forkJoin, map, Observable, of } from 'rxjs';

import { AddressData, NominatimService } from '../nominatim/nominatim.service';
import { LocatedStation } from '../stations/station.model';

/** The address of a station, the alternatives hold other languages and transcriptions. */
export interface StationAddress {
  /** uuid of the station */
  id: string;
  country?: string;
  country_alternatives?: string[];
  land?: string;
  land_alternatives?: string[];
  kreis?: string;
  kreis_alternatives?: string[];
  city?: string;
  city_alternatives?: string[];
}

interface AddressTupel {
  country?: string;
  land?: string;
  kreis?: string;
  city?: string;
}

/**
 * Reverse geocodes stations with nominatim. The address is in German, names in
 * the ADDITIONAL_HARVEST_LANGUAGE_LIST languages and transcriptions become
 * alternatives.
 */
@Injectable()
export class GeocodingService {
  private readonly logger = new Logger(GeocodingService.name);

  private readonly harvestLanguageList: string[] = [];

  constructor(
    private readonly nominatimSrvc: NominatimService,
    private readonly configService: ConfigService,
  ) {
    const langListConfig = this.configService.get<string>(
      'ADDITIONAL_HARVEST_LANGUAGE_LIST',
    );
    if (langListConfig) {
      this.harvestLanguageList = langListConfig.split(',');
    }
  }

  /**
   * Requests the address in German and in all additional languages at once.
   * Errors if the German request fails, failed additional languages are
   * skipped.
   */
  getAddress(s: LocatedStation): Observable<StationAddress> {
    const additionalRequests: Record<
      string,
      Observable<AddressData | undefined>
    > = {};
    this.harvestLanguageList.forEach((lang) => {
      additionalRequests[lang] = this.nominatimSrvc
        .getAdressData(s.uuid, s.latitude, s.longitude, lang)
        .pipe(
          // a failed additional language only lacks its alternatives, the station is still updated
          catchError((error) => {
            this.logger.warn(`${error.message}, skipping this language`);
            return of(undefined);
          }),
        );
    });
    return forkJoin({
      ...additionalRequests,
      de: this.nominatimSrvc.getAdressData(
        s.uuid,
        s.latitude,
        s.longitude,
        'de',
      ),
    }).pipe(
      map((res) => {
        const deData = res.de;
        const deTupel = this.getTupel(deData);
        const response: StationAddress = {
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

  /** Appends the alternative unless it is empty, the value itself or already known. */
  private addAlternative(
    alternatives: string[] | undefined,
    value?: string,
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

  /** Umlauts and ß written out, so that e.g. "Koeln" also finds Köln. */
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

  /**
   * Maps the nominatim address to our levels. Nominatim leaves out levels it
   * does not know, then the next smaller one fills the gap, e.g. a kreisfreie
   * Stadt without county becomes its own kreis.
   */
  private getTupel(data: AddressData): AddressTupel {
    return {
      country: data.country,
      land: data.state || data.county || data.city,
      kreis: data.county || data.city,
      city: data.city,
    };
  }
}
