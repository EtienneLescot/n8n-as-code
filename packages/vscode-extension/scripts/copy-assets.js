const fs = require('fs');
const path = require('path');

const srcDir = path.resolve(__dirname, '../res');
const destDir = path.resolve(__dirname, '../assets');

// Ensure destination directory exists
if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, { recursive: true });
}

const files = ['logo.png', 'spacer.png'];

files.forEach(file => {
  const src = path.join(srcDir, file);
  const dest = path.join(destDir, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log(`Copied ${file} to assets/`);
  } else {
    console.warn(`Source file ${src} does not exist`);
  }
});