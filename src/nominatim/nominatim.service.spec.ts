import { HttpService } from '@nestjs/axios';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { AxiosError, AxiosResponse } from 'axios';
import { firstValueFrom, of, throwError } from 'rxjs';

import { NominatimService } from './nominatim.service';

describe('NominatimService', () => {
  let service: NominatimService;
  const httpService = { get: jest.fn() };

  const respond = (data: unknown) =>
    httpService.get.mockReturnValue(of({ data } as AxiosResponse));

  const geocode = () =>
    firstValueFrom(service.getAdressData('uuid', 52.6, 10.1, 'en'));

  beforeAll(() => Logger.overrideLogger(false));

  beforeEach(async () => {
    httpService.get.mockReset();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NominatimService,
        { provide: HttpService, useValue: httpService },
        {
          provide: ConfigService,
          useValue: { get: () => 'http://nominatim/' },
        },
      ],
    }).compile();

    service = module.get<NominatimService>(NominatimService);
  });

  it('requests a reverse geocoding in the given language with a timeout', async () => {
    respond({ place_id: 1, address: {} });

    await geocode();

    expect(httpService.get).toHaveBeenCalledWith(
      'http://nominatim/reverse?lat=52.6&lon=10.1&format=json',
      { headers: { 'Accept-Language': 'en' }, timeout: 30000 },
    );
  });

  it('returns the address of the response', async () => {
    respond({
      place_id: 1,
      address: {
        country: 'Germany',
        state: 'Lower Saxony',
        county: 'Celle',
        city: 'Celle',
      },
    });

    expect(await geocode()).toEqual({
      id: 'uuid',
      country: 'Germany',
      state: 'Lower Saxony',
      county: 'Celle',
      city: 'Celle',
    });
  });

  it('returns empty values if nothing was found', async () => {
    respond({ error: 'Unable to geocode' });

    expect(await geocode()).toEqual({
      id: 'uuid',
      country: '',
      state: '',
      county: '',
      city: '',
    });
  });

  it.each([
    ['an http error', 'Request failed with status code 500'],
    ['a timeout', 'timeout of 30000ms exceeded'],
  ])('fails with station and language on %s', async (_, message) => {
    httpService.get.mockReturnValue(throwError(() => new AxiosError(message)));

    await expect(geocode()).rejects.toThrow(
      `Error getting address data for uuid (en): ${message}`,
    );
  });
});
