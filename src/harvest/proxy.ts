import { ConfigService } from '@nestjs/config';
import { AxiosProxyConfig } from 'axios';

/**
 * The proxy for the external sources of the harvest, pegelonline and the
 * Sensor Web API, if PROXY_PROTOCOL, PROXY_HOST and PROXY_PORT are all set.
 * Nominatim runs locally and goes without.
 */
export function harvestProxy(
  configService: ConfigService,
): AxiosProxyConfig | undefined {
  const protocol = configService.get<string>('PROXY_PROTOCOL');
  const host = configService.get<string>('PROXY_HOST');
  const port = configService.get<number>('PROXY_PORT');
  return protocol && host && port ? { protocol, host, port } : undefined;
}
