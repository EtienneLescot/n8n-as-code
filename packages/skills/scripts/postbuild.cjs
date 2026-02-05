const fs = require('fs');
const path = require('path');

const srcAssets = path.resolve(__dirname, '../src/assets');
const distAssets = path.resolve(__dirname, '../dist/assets');

// Ensure destination directory exists
if (!fs.existsSync(distAssets)) {
  fs.mkdirSync(distAssets, { recursive: true });
}

// Copy all .json files
const files = fs.readdirSync(srcAssets).filter(f => f.endsWith('.json'));
files.forEach(file => {
  const src = path.join(srcAssets, file);
  const dest = path.join(distAssets, file);
  fs.copyFileSync(src, dest);
  console.log(`Copied ${file} to dist/assets/`);
});