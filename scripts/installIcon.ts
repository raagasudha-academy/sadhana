/** Optional one-time utility for adding Sadhana branding. The official icon is already in /public.
 * Run: npm run icon:install -- /absolute/path/to/sadhana-icon.png
 * Requires the devDependency 'sharp'. Preserves transparency and pads without cropping.
 */
import sharp from 'sharp';
import { resolve, join } from 'node:path';
import { access, mkdir } from 'node:fs/promises';

async function main(): Promise<void> {
  const source = process.argv[2];
  if (!source) throw new Error('Usage: npm run icon:install -- /path/to/icon.png');
  await access(resolve(source));
  const publicDir = resolve(process.cwd(), 'public');
  await mkdir(publicDir, { recursive: true });
  for (const [filename, size] of [['sadhana-icon.png', 512], ['favicon-32.png', 32], ['apple-touch-icon.png', 180]] as const) {
    await sharp(resolve(source)).resize(size, size, { fit: 'contain', background: '#00000000' }).png().toFile(join(publicDir, filename));
  }
  process.stdout.write('Sadhana icon and favicons updated.\n');
}
main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
