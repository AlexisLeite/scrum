const { createRequire } = require("module");
const path = require("path");

const appRequire = createRequire(path.join(__dirname, "../apps/api/package.json"));
const serverless = appRequire("serverless-http");

let cachedHandler = null;

async function getHandler() {
  if (!cachedHandler) {
    const { createVercelApp } = appRequire("../dist/src/bootstrap");
    const app = await createVercelApp();
    cachedHandler = serverless(app);
  }

  return cachedHandler;
}

module.exports = async (req, res) => {
  const handler = await getHandler();
  return handler(req, res);
};
