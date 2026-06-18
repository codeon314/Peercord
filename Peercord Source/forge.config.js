import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default {
  packagerConfig: {
    asar: false, // Keep this false so the main app isn't an ASAR
    icon: path.join(__dirname, 'assets', 'icon'),
    ignore: (file) => {
      if (!file) return false; // Don't ignore the root directory
      
      // Normalize path to use forward slashes for cross-platform consistency
      const normalizedPath = file.replace(/\\/g, '/');
      
      // Ignore these folders so they don't bloat the build or cause nested ASAR crashes
      if (normalizedPath.startsWith('/out')) return true;
      if (normalizedPath.startsWith('/Test Bed')) return true;
      if (normalizedPath.startsWith('/src')) return true;
      if (normalizedPath.startsWith('/public')) return true;
      if (normalizedPath.startsWith('/scripts')) return true;
      if (normalizedPath.startsWith('/.git')) return true;
      
      return false;
    }
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin', 'linux', 'win32'],
    }
  ],
};