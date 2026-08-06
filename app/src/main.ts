import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AppConfig } from './config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  const appConfig = app.get(AppConfig);
  await app.listen(appConfig.port);

  Logger.log(
    `${appConfig.appName} is running on port: ${appConfig.port}`,
    'Bootstrap',
  );
}
void bootstrap();
