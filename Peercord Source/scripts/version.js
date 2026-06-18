import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read package.json
const pkgPath = path.resolve(__dirname, '../package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

let currentVersion = pkg.version;
let [major, minor, patch] = currentVersion.split('.').map(Number);

// Increment the patch version
patch += 1;

// Rollover logic: 1000 patches = 1 minor
if (patch >= 1000) {
  patch = 0;
  minor += 1;
}

// Rollover logic: 10 minors = 1 major
if (minor >= 10) {
  minor = 0;
  major += 1;
}

const newVersion = `${major}.${minor}.${patch}`;
pkg.version = newVersion;

// Write back to package.json
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

// Ensure the public directory exists
const publicDir = path.resolve(__dirname, '../public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// Generate deterministic color based on the new version string
let hash = 0;
for (let i = 0; i < newVersion.length; i++) {
  hash = newVersion.charCodeAt(i) + ((hash << 5) - hash);
}
const hue = Math.abs(hash) % 360;
const color = `hsl(${hue}, 80%, 60%)`;

// Write to a JS file that can be loaded synchronously in the HTML head
const content = `window.APP_VERSION = '${newVersion}';\nwindow.APP_VERSION_COLOR = '${color}';\n`;
fs.writeFileSync(path.join(publicDir, 'version.js'), content);

console.log(`[Versioning] Bumped version from ${currentVersion} to v${newVersion} with color: ${color}`);