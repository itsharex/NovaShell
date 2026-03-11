/**
 * NovaTerm Icon Generator
 *
 * Generates all required icon sizes for Tauri bundling.
 *
 * Prerequisites:
 *   npm install --save-dev sharp png2icons
 *
 * Usage:
 *   node scripts/generate-icons.js [source-image]
 *
 * If no source image is provided, it generates a default terminal icon.
 * The source image should be at least 1024x1024 PNG.
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ICONS_DIR = join(__dirname, '..', 'src-tauri', 'icons');

/**
 * Creates a simple SVG terminal icon.
 * Replace this with your custom icon by running:
 *   node scripts/generate-icons.js path/to/your-icon-1024x1024.png
 */
function generateDefaultSVG() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#1a1a2e"/>
      <stop offset="50%" style="stop-color:#16213e"/>
      <stop offset="100%" style="stop-color:#0f3460"/>
    </linearGradient>
    <linearGradient id="glow" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#00d4ff"/>
      <stop offset="100%" style="stop-color:#7b2ff7"/>
    </linearGradient>
    <filter id="shadow">
      <feDropShadow dx="0" dy="4" stdDeviation="8" flood-color="#00d4ff" flood-opacity="0.3"/>
    </filter>
  </defs>
  <!-- Background -->
  <rect width="1024" height="1024" rx="200" fill="url(#bg)"/>
  <!-- Border glow -->
  <rect x="20" y="20" width="984" height="984" rx="180" fill="none" stroke="url(#glow)" stroke-width="4" opacity="0.6"/>
  <!-- Terminal window frame -->
  <rect x="120" y="160" width="784" height="704" rx="24" fill="#0a0a1a" stroke="#00d4ff" stroke-width="3" opacity="0.9" filter="url(#shadow)"/>
  <!-- Title bar -->
  <rect x="120" y="160" width="784" height="56" rx="24" fill="#141428"/>
  <rect x="120" y="192" width="784" height="24" fill="#141428"/>
  <!-- Window dots -->
  <circle cx="168" cy="188" r="12" fill="#ff5f57"/>
  <circle cx="208" cy="188" r="12" fill="#ffbd2e"/>
  <circle cx="248" cy="188" r="12" fill="#28c840"/>
  <!-- Prompt line 1: chevron + text -->
  <text x="172" y="296" font-family="monospace" font-size="52" font-weight="bold" fill="#00d4ff">❯</text>
  <text x="228" y="296" font-family="monospace" font-size="48" fill="#e0e0e0">nova</text>
  <text x="420" y="296" font-family="monospace" font-size="48" fill="#7b2ff7">term</text>
  <!-- Cursor -->
  <rect x="620" y="260" width="28" height="48" fill="#00d4ff" opacity="0.8">
    <animate attributeName="opacity" values="0.8;0.2;0.8" dur="1.2s" repeatCount="indefinite"/>
  </rect>
  <!-- Output lines -->
  <rect x="172" y="340" width="480" height="4" rx="2" fill="#28c840" opacity="0.6"/>
  <rect x="172" y="400" width="360" height="4" rx="2" fill="#e0e0e0" opacity="0.3"/>
  <rect x="172" y="460" width="520" height="4" rx="2" fill="#e0e0e0" opacity="0.3"/>
  <rect x="172" y="520" width="280" height="4" rx="2" fill="#7b2ff7" opacity="0.4"/>
  <!-- Prompt line 2 -->
  <text x="172" y="620" font-family="monospace" font-size="52" font-weight="bold" fill="#00d4ff">❯</text>
  <rect x="228" y="588" width="16" height="44" fill="#00d4ff" opacity="0.6"/>
  <!-- Bottom accent -->
  <rect x="120" y="840" width="784" height="4" rx="2" fill="url(#glow)" opacity="0.5"/>
  <!-- N logo watermark -->
  <text x="780" y="820" font-family="monospace" font-size="64" font-weight="bold" fill="#00d4ff" opacity="0.15">N</text>
</svg>`;
}

async function main() {
  const sourceArg = process.argv[2];

  if (!existsSync(ICONS_DIR)) {
    mkdirSync(ICONS_DIR, { recursive: true });
  }

  let sharp;
  try {
    sharp = (await import('sharp')).default;
  } catch {
    console.log('⚠️  "sharp" not installed. Generating SVG icon only.');
    console.log('   To generate all icon formats, run:');
    console.log('   npm install --save-dev sharp');
    console.log('');

    // Write SVG as fallback
    const svg = generateDefaultSVG();
    writeFileSync(join(ICONS_DIR, 'icon.svg'), svg);
    console.log('✅ Generated icon.svg');
    console.log('');
    console.log('Then use an online converter or install sharp to generate:');
    console.log('  - icon.ico (Windows)');
    console.log('  - icon.icns (macOS)');
    console.log('  - 32x32.png, 128x128.png, 128x128@2x.png');
    console.log('');
    console.log('Or use: npx tauri icon icon.svg');
    return;
  }

  let sourceBuffer;
  if (sourceArg) {
    const { readFileSync } = await import('fs');
    sourceBuffer = readFileSync(sourceArg);
    console.log(`📎 Using source image: ${sourceArg}`);
  } else {
    const svg = generateDefaultSVG();
    sourceBuffer = Buffer.from(svg);
    console.log('🎨 Using generated NovaTerm icon');
  }

  const sizes = [
    { name: '32x32.png', size: 32 },
    { name: '128x128.png', size: 128 },
    { name: '128x128@2x.png', size: 256 },
    { name: 'icon.png', size: 1024 },
  ];

  for (const { name, size } of sizes) {
    await sharp(sourceBuffer)
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(join(ICONS_DIR, name));
    console.log(`✅ ${name} (${size}x${size})`);
  }

  // Generate ICO (Windows) - contains 16, 32, 48, 256
  const icoSizes = [16, 32, 48, 256];
  const icoBuffers = [];
  for (const size of icoSizes) {
    const buf = await sharp(sourceBuffer)
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    icoBuffers.push({ size, buffer: buf });
  }

  // Simple ICO format builder
  const icoFile = buildIco(icoBuffers);
  writeFileSync(join(ICONS_DIR, 'icon.ico'), icoFile);
  console.log('✅ icon.ico (16, 32, 48, 256)');

  // For ICNS, recommend using tauri icon command
  console.log('');
  console.log('💡 For macOS icon.icns, run:');
  console.log('   npx tauri icon src-tauri/icons/icon.png');

  console.log('');
  console.log('✨ Icon generation complete!');
}

function buildIco(images) {
  const headerSize = 6;
  const entrySize = 16;
  const numImages = images.length;
  let offset = headerSize + entrySize * numImages;

  // ICO header
  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0);      // Reserved
  header.writeUInt16LE(1, 2);      // ICO type
  header.writeUInt16LE(numImages, 4);

  const entries = [];
  const dataBuffers = [];

  for (const { size, buffer } of images) {
    const entry = Buffer.alloc(entrySize);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);   // Width (0 = 256)
    entry.writeUInt8(size >= 256 ? 0 : size, 1);   // Height
    entry.writeUInt8(0, 2);                          // Color palette
    entry.writeUInt8(0, 3);                          // Reserved
    entry.writeUInt16LE(1, 4);                       // Color planes
    entry.writeUInt16LE(32, 6);                      // Bits per pixel
    entry.writeUInt32LE(buffer.length, 8);           // Image size
    entry.writeUInt32LE(offset, 12);                 // Image offset

    entries.push(entry);
    dataBuffers.push(buffer);
    offset += buffer.length;
  }

  return Buffer.concat([header, ...entries, ...dataBuffers]);
}

main().catch(console.error);
