import { cp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const rootDir = "/root/repos/scrum";
const deployDir = resolve(rootDir, "deploy");
const deployApiDir = resolve(deployDir, "api");
const sourceApiDir = resolve(rootDir, "apps/api");

async function ensureDir(path) {
  await mkdir(path, { recursive: true });
}

async function replaceNodeModulesLink() {
  const linkPath = resolve(deployApiDir, "node_modules");
  await rm(linkPath, { recursive: true, force: true });
  await symlink(resolve(sourceApiDir, "node_modules"), linkPath, "dir");
}

async function writeDeployPackageJson() {
  const rawPackage = await readFile(resolve(sourceApiDir, "package.json"), "utf8");
  const parsed = JSON.parse(rawPackage);
  parsed.scripts = {
    ...(parsed.scripts ?? {}),
    start: "node dist/src/main.js"
  };
  await writeFile(resolve(deployApiDir, "package.json"), `${JSON.stringify(parsed, null, 2)}\n`);
}

async function main() {
  await ensureDir(deployDir);
  await rm(deployApiDir, { recursive: true, force: true });
  await ensureDir(deployApiDir);

  await cp(resolve(sourceApiDir, "dist"), resolve(deployApiDir, "dist"), { recursive: true });
  await cp(resolve(sourceApiDir, "prisma"), resolve(deployApiDir, "prisma"), { recursive: true });
  await writeDeployPackageJson();
  await replaceNodeModulesLink();

  await ensureDir(resolve(rootDir, "shared", "media"));

  const envTarget = resolve(deployApiDir, ".env");
  await ensureDir(dirname(envTarget));
  await cp(resolve(rootDir, ".env"), envTarget);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
