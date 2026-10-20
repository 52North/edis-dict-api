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

/**
 * Starts the API on PORT, with the Swagger UI at /api and CORS open for all
 * origins.
 */
async function bootstrap() {
  const server = express();
  const app = await NestFactory.create(AppModule, new ExpressAdapter(server), {
    // the lowest level, so all levels are logged
    logger: ['verbose'],
  });

  const config = app.get(ConfigService);
  const port = config.get<number>('PORT', 3000);

  app.enableCors();

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Dict API für Pegelonline')
    // .setDescription('TODO: ADD a description')
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
