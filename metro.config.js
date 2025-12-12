// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Add watchFolders to include global npm directory if needed
// This helps Metro watch files from globally installed packages
const npmGlobalPath = path.join(require('os').homedir(), '.npm-global');
config.watchFolders = [
  ...(config.watchFolders || []),
  npmGlobalPath,
];

// Handle react-dom for Clerk - it's required but web-only
// Metro will resolve it to the installed package, which is fine for bundling
// The actual react-dom code won't execute in React Native

module.exports = config;

