import type { VercelRequest, VercelResponse } from "@vercel/node";
import serverless from "serverless-http";
import { createVercelApp } from "../src/bootstrap";

let cachedHandler: ReturnType<typeof serverless> | null = null;

async function getHandler() {
  if (!cachedHandler) {
    console.log("Creating Vercel app...");
    const app = await createVercelApp();
    console.log("Nest app created");
    cachedHandler = serverless(app);
    console.log("Serverless handler created");
  }

  return cachedHandler;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    console.log("Incoming request:", req.method, req.url);
    const appHandler = await getHandler();
    return await appHandler(req, res);
  } catch (error) {
    console.error("Top-level handler error:", error);
    res.status(500).json({
      ok: false,
      message: "Handler crashed",
      error: error instanceof Error ? error.message : String(error),
    });
  }
}