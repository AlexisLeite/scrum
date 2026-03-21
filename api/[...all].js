const serverless = require("serverless-http");

let cachedHandler = null;

async function getHandler() {
  if (!cachedHandler) {
    const { createVercelApp } = require("../apps/api/dist/src/bootstrap");
    const app = await createVercelApp();
    cachedHandler = serverless(app);
  }

  return cachedHandler;
}

module.exports = async (req, res) => {
  const handler = await getHandler();
  return handler(req, res);
};
