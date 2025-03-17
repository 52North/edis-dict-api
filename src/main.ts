import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import * as http from 'http';
import * as https from 'https';
import * as express from 'express';
import * as fs from 'fs';

import {
  DocumentBuilder,
  SwaggerDocumentOptions,
  SwaggerModule,
} from '@nestjs/swagger';

import { AppModule } from './app.module';

async function bootstrap() {

  const server = express();
  const app = await NestFactory.create(AppModule, new ExpressAdapter(server), {logger: ['verbose'],});

  const config = app.get(ConfigService);
  const port = config.get<number>('PORT', 3000);
  const key = config.get<string>('KEY_FILE');
  const cert = config.get<string>('CERT_FILE');

  app.enableCors();

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Dict API für Pegelonline')
    // .setDescription('TODO: ADD a description')
    .setVersion(process.env.npm_package_version)
    .build();
  const documentOptions: SwaggerDocumentOptions = {
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
