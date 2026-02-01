import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pngToIco from 'png-to-ico';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(__dirname, '../public/icon-512.png');
const outDir = path.join(__dirname, '../build');
const outFile = path.join(outDir, 'icon.ico');

if (!fs.existsSync(src)) {
  console.error('Source icon not found:', src);
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });

pngToIco(src)
  .then(buf => {
    fs.writeFileSync(outFile, buf);
    console.log('Icon built:', outFile);
  })
  .catch(err => {
    console.error('Icon build failed:', err);
    process.exit(1);
  });
