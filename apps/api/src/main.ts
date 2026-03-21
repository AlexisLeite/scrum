import { createHttpApp } from "./bootstrap";

async function bootstrap() {
  const app = await createHttpApp();
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
}

bootstrap();
