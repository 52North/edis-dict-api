import { INestApplication } from '@nestjs/common';
import compression from 'compression';

/**
 * Opens CORS for all origins and compresses responses from 1 KB on with
 * Brotli or gzip, as the client accepts. The reverse proxy in front of the
 * API does not compress. Shared by main.ts and the e2e tests.
 */
export function configureApp(app: INestApplication): void {
  app.enableCors();
  app.use(compression());
}
