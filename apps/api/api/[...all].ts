import type { VercelRequest, VercelResponse } from "@vercel/node";
import serverless from "serverless-http";
import { createVercelApp } from "../src/bootstrap";

let cachedHandler: ReturnType<typeof serverless> | null = null;

async function getHandler() {
  if (!cachedHandler) {
    const app = await createVercelApp();
    cachedHandler = serverless(app);
  }

  return cachedHandler;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const appHandler = await getHandler();
  return appHandler(req, res);
}
