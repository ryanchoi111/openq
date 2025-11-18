// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Handle react-dom for Clerk - it's required but web-only
// Metro will resolve it to the installed package, which is fine for bundling
// The actual react-dom code won't execute in React Native

module.exports = config;

