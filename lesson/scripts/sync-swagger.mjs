import { copyFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';

const require = createRequire(import.meta.url);
const output = new URL('../public/swagger/', import.meta.url);
await mkdir(output, { recursive: true });
for (const file of ['swagger-ui.css', 'swagger-ui-bundle.js']) {
  await copyFile(require.resolve('swagger-ui-dist/' + file), new URL(file, output));
}
