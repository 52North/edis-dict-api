import {
  BadRequestException,
  Injectable,
  Logger,
  PipeTransform,
} from '@nestjs/common';

import { MATCH_MODES, parseBbox, StationQuery } from './station-query';

// a record, so the compiler reports parameters added to StationQuery but missing here
const PARAMETERS: Record<keyof StationQuery, true> = {
  station: true,
  number: true,
  gewaesser: true,
  agency: true,
  land: true,
  country: true,
  einzugsgebiet: true,
  kreis: true,
  parameter: true,
  bbox: true,
  q: true,
  match: true,
};
const PARAMETER_NAMES = new Set(Object.keys(PARAMETERS));

/**
 * Checks the parameters of /search before the filters run. Repeated parameters,
 * invalid bboxes and unknown match modes are rejected with 400, unknown
 * parameters are only logged and passed on, the filters ignore them.
 */
@Injectable()
export class StationQueryPipe implements PipeTransform<
  Record<string, unknown>,
  StationQuery
> {
  private readonly logger = new Logger(StationQueryPipe.name);

  transform(query: Record<string, unknown>): StationQuery {
    const unknown = Object.keys(query).filter(
      (key) => !PARAMETER_NAMES.has(key),
    );
    // unknown parameters (e.g. cache busters or typos) are ignored, but logged to see if clients send them
    if (unknown.length) {
      this.logger.warn(
        `Ignoring unknown search parameters: ${unknown.join(', ')}`,
      );
    }
    for (const key of PARAMETER_NAMES) {
      // repeated parameters arrive as arrays, which the filters cannot handle
      if (key in query && typeof query[key] !== 'string') {
        throw new BadRequestException(
          `Parameter ${key} must be a single value`,
        );
      }
    }
    if (query.bbox && !parseBbox(query.bbox as string)) {
      throw new BadRequestException(
        'Parameter bbox must have the form minLon,minLat,maxLon,maxLat with valid coordinates, e.g. 7,52,8,53',
      );
    }
    // an empty match is not set, like an empty bbox
    if (query.match && !MATCH_MODES.includes(query.match as string)) {
      throw new BadRequestException(
        'Parameter match must be contains or exact',
      );
    }
    return query as StationQuery;
  }
}
