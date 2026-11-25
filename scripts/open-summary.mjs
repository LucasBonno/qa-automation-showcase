/**
 * Opens the one-page run summary in the default browser, on Windows, macOS and Linux.
 *   npm run report:summary
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const file = path.resolve('reports/summary/index.html');

if (!existsSync(file)) {
  console.error('There is no summary yet. Run "npm test" first.');
  process.exit(1);
}

// "explorer" and "open" hand the file to the default program; "xdg-open" is the Linux equivalent.
const opener = process.platform === 'win32' ? 'explorer.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open';

const child = spawn(opener, [file], { stdio: 'ignore', detached: true });
child.on('error', () => console.log(`Could not open a browser automatically. Open this file yourself:\n${file}`));
child.unref();
console.log(`Opening ${file}`);
