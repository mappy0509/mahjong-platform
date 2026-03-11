const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

// Find the project root (monorepo root)
const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// Watch all files in the monorepo
config.watchFolders = [monorepoRoot];

// Let Metro resolve packages from monorepo node_modules
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(monorepoRoot, "node_modules"),
];

// Resolve workspace packages by their source (not dist)
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // For workspace packages, resolve to their src/index.ts
  if (moduleName === "@mahjong/engine") {
    return {
      filePath: path.resolve(monorepoRoot, "packages/mahjong-engine/src/index.ts"),
      type: "sourceFile",
    };
  }
  if (moduleName === "@mahjong/shared") {
    return {
      filePath: path.resolve(monorepoRoot, "packages/shared/src/index.ts"),
      type: "sourceFile",
    };
  }
  // Fall back to default resolution
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
