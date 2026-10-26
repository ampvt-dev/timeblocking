// JSON files in the app's user-data folder. Writes go to a temp file first so
// a crash mid-write never leaves a half-written schedule or journal.

import fs from 'node:fs/promises';
import path from 'node:path';

const NAMES = new Set(['schedule', 'settings', 'journal']);

export function createStore(dir) {
  const file = (name) => {
    if (!NAMES.has(name)) throw new Error(`Unknown store "${name}"`);
    return path.join(dir, `${name}.json`);
  };
  return {
    dir,
    async load(name) {
      try {
        return JSON.parse(await fs.readFile(file(name), 'utf8'));
      } catch (err) {
        if (err.code === 'ENOENT') return null;
        // Keep a copy of an unreadable file instead of silently overwriting it.
        if (err instanceof SyntaxError) {
          await fs.copyFile(file(name), `${file(name)}.corrupt-${Date.now()}`).catch(() => {});
          return null;
        }
        throw err;
      }
    },
    async save(name, data) {
      await fs.mkdir(dir, { recursive: true });
      const target = file(name);
      const tmp = `${target}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
      await fs.rename(tmp, target);
    },
  };
}
