import { NestFactory } from '@nestjs/core';
import { AppModule } from './to-client/app.module';

import { to_agent_main } from "./to-agent/app"

const { ZAYCHIK_SERVER_PORT } = process.env

async function bootstrap() {
  to_agent_main();

  const app = await NestFactory.create(AppModule);
  const port = parseInt(ZAYCHIK_SERVER_PORT);
  console.log(`Server listening on port ${port}`);
  await app.listen(port);
}

bootstrap();
