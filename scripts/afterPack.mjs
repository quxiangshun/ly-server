import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const ResEdit = require('resedit');

/**
 * afterPack hook: set custom icon on Windows exe when signAndEditExecutable is false.
 * Uses resedit (same lib as electron-builder asar integrity) to replace icon.
 */
export default async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return;

  const { appOutDir, packager } = context;
  const projectDir = packager.projectDir;
  const exeName = `${packager.appInfo.productFilename}.exe`;
  const exePath = path.join(appOutDir, exeName);
  const iconPath = path.join(projectDir, 'build', 'icon.ico');

  if (!fs.existsSync(iconPath)) {
    console.warn('[afterPack] build/icon.ico not found, skip setting icon');
    return;
  }
  if (!fs.existsSync(exePath)) {
    console.warn('[afterPack] exe not found:', exePath);
    return;
  }

  const buffer = fs.readFileSync(exePath);
  const executable = ResEdit.NtExecutable.from(buffer, { ignoreCert: true });
  const resource = ResEdit.NtExecutableResource.from(executable);
  const iconGroups = ResEdit.Resource.IconGroupEntry.fromEntries(resource.entries);
  const iconGroupID = iconGroups.length > 0 ? iconGroups[0].id : 1;
  const lang = iconGroups.length > 0 ? iconGroups[0].lang : 0x409;

  const iconFile = ResEdit.Data.IconFile.from(fs.readFileSync(iconPath));
  const icons = iconFile.icons.map((item) => item.data);
  ResEdit.Resource.IconGroupEntry.replaceIconsForResource(resource.entries, iconGroupID, lang, icons);
  resource.outputResource(executable);
  fs.writeFileSync(exePath, Buffer.from(executable.generate()));
}
