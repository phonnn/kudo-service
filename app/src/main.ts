import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
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

  console.log(`${process.env.APP_NAME} is running on port: ${appConfig.port}`);
}
void bootstrap();
