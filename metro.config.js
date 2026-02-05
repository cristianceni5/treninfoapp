const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const config = getDefaultConfig(__dirname);

// La cartella `old/` contiene codice backend/legacy non usato dall'app RN.
// La escludiamo per evitare che Metro/Watchman la indicizzino.
const oldDir = path.resolve(__dirname, 'old');
const oldDirPattern = new RegExp(`^${escapeRegExp(oldDir)}[\\\\/].*$`);

const existingBlockList = config?.resolver?.blockList;
if (Array.isArray(existingBlockList)) {
  config.resolver.blockList = [...existingBlockList, oldDirPattern];
} else if (existingBlockList) {
  config.resolver.blockList = [existingBlockList, oldDirPattern];
} else {
  config.resolver.blockList = [oldDirPattern];
}

module.exports = config;
