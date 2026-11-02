import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import express from 'express';

import {
  DocumentBuilder,
  SwaggerDocumentOptions,
  SwaggerModule,
} from '@nestjs/swagger';

import { AppModule } from './app.module';
import { configureApp } from './configure-app';

// markdown for the Swagger UI, the ODbL requires the attribution of the OpenStreetMap data
const DESCRIPTION = [
  'Durchsucht die Stationen von [Pegelonline](https://www.pegelonline.wsv.de) und ergänzt sie um Adresse, alternative Benennungen mit ihrer Sprache, Einzugsgebiet und Links zum Download der Messwerte über die Sensor Web API. Liefert die Werte der Suchparameter für Auswahllisten und, passend zu einer Suche, mit Anzahl für eine Facettensuche.',
  '',
  'Quellen:',
  '- Stationen und Zeitreihen: Pegelonline der Wasserstraßen- und Schifffahrtsverwaltung des Bundes (WSV), [Datenlizenz Deutschland – Zero – Version 2.0](https://www.govdata.de/dl-de/zero-2-0)',
  '- Adressen (Land, Bundesland, Kreis, Stadt) und ihre Namen in weiteren Sprachen: © [OpenStreetMap-Mitwirkende](https://www.openstreetmap.org/copyright), [ODbL](https://opendatacommons.org/licenses/odbl/), abgefragt über Nominatim',
  '- Synonyme und Übersetzungen von Gewässern, Einzugsgebieten und Kreisen: Suchwortliste der Dict-API',
  '- Download-Links: Sensor Web API (Dataset API, z.B. gdi-sos), nur wenn sie konfiguriert ist',
].join('\n');

/**
 * Starts the API on PORT, with the Swagger UI at /api, CORS open for all
 * origins and compressed responses.
 */
async function bootstrap() {
  const server = express();
  const app = await NestFactory.create(AppModule, new ExpressAdapter(server), {
    // the lowest level, so all levels are logged
    logger: ['verbose'],
  });

  const config = app.get(ConfigService);
  const port = config.get<number>('PORT', 3000);

  configureApp(app);

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Dict API für Pegelonline')
    .setDescription(DESCRIPTION)
    // only set when started via npm, like in the Dockerfile
    .setVersion(process.env.npm_package_version ?? 'unknown')
    .build();
  const documentOptions: SwaggerDocumentOptions = {
    // plain method names like "search" instead of "QueryController_search"
    operationIdFactory: (controllerKey: string, methodKey: string) => methodKey,
  };
  const document = SwaggerModule.createDocument(
    app,
    swaggerConfig,
    documentOptions,
  );
  SwaggerModule.setup('api', app, document);

  await app.listen(port);
}
bootstrap();
