/**
 * Checks the configuration on start, see ConfigModule.forRoot in AppModule.
 * Without valid base urls of pegelonline and nominatim the app does not start,
 * instead of failing every request of the harvest. The nominatim url gets a
 * missing trailing slash and the pegelonline url loses it, as NominatimService
 * appends "reverse?…" and HarvestService and StationsService append
 * "/stations…".
 */
export function validateConfig(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const pegelonlineBaseUrl = requireHttpUrl(config, 'PEGELONLINE_BASE_URL');
  const nominatimBaseUrl = requireHttpUrl(config, 'NOMINATIM_BASE_URL');
  return {
    // ConfigModule assigns only the returned values to process.env
    ...config,
    PEGELONLINE_BASE_URL: pegelonlineBaseUrl.replace(/\/+$/, ''),
    NOMINATIM_BASE_URL: nominatimBaseUrl.endsWith('/')
      ? nominatimBaseUrl
      : `${nominatimBaseUrl}/`,
  };
}

function requireHttpUrl(config: Record<string, unknown>, key: string): string {
  const value = config[key];
  const url = typeof value === 'string' ? value.trim() : '';
  if (!url) {
    throw new Error(`${key} is not set`);
  }
  let protocol: string;
  try {
    protocol = new URL(url).protocol;
  } catch {
    throw new Error(`${key} is not a valid url: ${url}`);
  }
  // e.g. "localhost:9090" is parsed with "localhost:" as protocol
  if (protocol !== 'http:' && protocol !== 'https:') {
    throw new Error(`${key} is not an http or https url: ${url}`);
  }
  return url;
}
