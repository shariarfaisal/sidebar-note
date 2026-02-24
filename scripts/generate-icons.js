/**
 * Generate extension icons as PNG files using pure JS (no dependencies).
 * Creates minimal notepad icons at 16, 48, 128px sizes.
 */
import { writeFileSync } from 'fs';

// Since we can't use canvas in Node without native deps,
// we'll generate simple PNG files manually using a minimal PNG encoder.

function createPNG(size) {
  // Create raw RGBA pixel data
  const pixels = new Uint8Array(size * size * 4);
  const pad = Math.max(1, Math.floor(size * 0.12));
  const cornerR = Math.max(1, Math.floor(size * 0.15));

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;

      // Check if pixel is inside rounded rectangle
      const inRect = x >= pad && x < size - pad && y >= pad && y < size - pad;

      // Simple rounded corners check
      const corners = [
        [pad + cornerR, pad + cornerR],
        [size - pad - cornerR, pad + cornerR],
        [pad + cornerR, size - pad - cornerR],
        [size - pad - cornerR, size - pad - cornerR],
      ];

      let inShape = inRect;
      if (inRect) {
        for (const [cx, cy] of corners) {
          const dx = Math.abs(x - cx);
          const dy = Math.abs(y - cy);
          if (
            ((x < pad + cornerR && y < pad + cornerR) ||
              (x >= size - pad - cornerR && y < pad + cornerR) ||
              (x < pad + cornerR && y >= size - pad - cornerR) ||
              (x >= size - pad - cornerR && y >= size - pad - cornerR)) &&
            dx * dx + dy * dy > cornerR * cornerR
          ) {
            inShape = false;
          }
        }
      }

      // Draw lines inside the notepad
      const lineSpacing = Math.max(2, Math.floor(size * 0.18));
      const lineStart = pad + Math.floor(size * 0.25);
      const lineEnd = size - pad - Math.floor(size * 0.15);
      const lineY1 = pad + Math.floor(size * 0.35);
      const isLine =
        inShape &&
        x >= lineStart &&
        x <= lineEnd &&
        y >= lineY1 &&
        (y - lineY1) % lineSpacing < Math.max(1, Math.floor(size * 0.04));

      // Fold corner
      const foldSize = Math.floor(size * 0.2);
      const isFold =
        x >= size - pad - foldSize &&
        y <= pad + foldSize &&
        x - (size - pad - foldSize) + (y - pad) <= foldSize;

      if (inShape) {
        if (isFold) {
          // Fold area - slightly darker
          pixels[i] = 200;
          pixels[i + 1] = 200;
          pixels[i + 2] = 200;
          pixels[i + 3] = 255;
        } else if (isLine) {
          // Text lines
          pixels[i] = 80;
          pixels[i + 1] = 80;
          pixels[i + 2] = 80;
          pixels[i + 3] = 255;
        } else {
          // White paper
          pixels[i] = 250;
          pixels[i + 1] = 250;
          pixels[i + 2] = 250;
          pixels[i + 3] = 255;
        }
      } else {
        // Transparent
        pixels[i] = 0;
        pixels[i + 1] = 0;
        pixels[i + 2] = 0;
        pixels[i + 3] = 0;
      }
    }
  }

  return encodePNG(size, size, pixels);
}

// Minimal PNG encoder
function encodePNG(width, height, pixels) {
  function crc32(buf) {
    let crc = -1;
    for (let i = 0; i < buf.length; i++) {
      crc = (crc >>> 8) ^ crcTable[(crc ^ buf[i]) & 0xff];
    }
    return (crc ^ -1) >>> 0;
  }

  const crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crcTable[n] = c;
  }

  function adler32(buf) {
    let a = 1,
      b = 0;
    for (let i = 0; i < buf.length; i++) {
      a = (a + buf[i]) % 65521;
      b = (b + a) % 65521;
    }
    return ((b << 16) | a) >>> 0;
  }

  // Create raw scanlines (filter byte 0 = none, then RGBA pixels)
  const rawData = new Uint8Array(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    rawData[y * (1 + width * 4)] = 0; // filter none
    rawData.set(pixels.slice(y * width * 4, (y + 1) * width * 4), y * (1 + width * 4) + 1);
  }

  // Deflate (store only - no compression, using zlib format)
  const blocks = [];
  const BLOCK_SIZE = 65535;
  for (let i = 0; i < rawData.length; i += BLOCK_SIZE) {
    const end = Math.min(i + BLOCK_SIZE, rawData.length);
    const isLast = end === rawData.length;
    const block = rawData.slice(i, end);
    const header = new Uint8Array(5);
    header[0] = isLast ? 1 : 0;
    header[1] = block.length & 0xff;
    header[2] = (block.length >> 8) & 0xff;
    header[3] = ~block.length & 0xff;
    header[4] = (~block.length >> 8) & 0xff;
    blocks.push(header, block);
  }

  const adler = adler32(rawData);
  const deflated = new Uint8Array(
    2 + blocks.reduce((s, b) => s + b.length, 0) + 4
  );
  deflated[0] = 0x78;
  deflated[1] = 0x01;
  let offset = 2;
  for (const b of blocks) {
    deflated.set(b, offset);
    offset += b.length;
  }
  deflated[offset] = (adler >> 24) & 0xff;
  deflated[offset + 1] = (adler >> 16) & 0xff;
  deflated[offset + 2] = (adler >> 8) & 0xff;
  deflated[offset + 3] = adler & 0xff;

  // Build PNG chunks
  function makeChunk(type, data) {
    const chunk = new Uint8Array(4 + type.length + data.length + 4);
    const len = data.length;
    chunk[0] = (len >> 24) & 0xff;
    chunk[1] = (len >> 16) & 0xff;
    chunk[2] = (len >> 8) & 0xff;
    chunk[3] = len & 0xff;
    for (let i = 0; i < type.length; i++) chunk[4 + i] = type.charCodeAt(i);
    chunk.set(data, 4 + type.length);
    const crc = crc32(chunk.slice(4, 4 + type.length + data.length));
    const end = 4 + type.length + data.length;
    chunk[end] = (crc >> 24) & 0xff;
    chunk[end + 1] = (crc >> 16) & 0xff;
    chunk[end + 2] = (crc >> 8) & 0xff;
    chunk[end + 3] = crc & 0xff;
    return chunk;
  }

  // IHDR
  const ihdr = new Uint8Array(13);
  ihdr[0] = (width >> 24) & 0xff;
  ihdr[1] = (width >> 16) & 0xff;
  ihdr[2] = (width >> 8) & 0xff;
  ihdr[3] = width & 0xff;
  ihdr[4] = (height >> 24) & 0xff;
  ihdr[5] = (height >> 16) & 0xff;
  ihdr[6] = (height >> 8) & 0xff;
  ihdr[7] = height & 0xff;
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdrChunk = makeChunk('IHDR', ihdr);
  const idatChunk = makeChunk('IDAT', deflated);
  const iendChunk = makeChunk('IEND', new Uint8Array(0));

  const png = new Uint8Array(
    signature.length + ihdrChunk.length + idatChunk.length + iendChunk.length
  );
  let pos = 0;
  png.set(signature, pos); pos += signature.length;
  png.set(ihdrChunk, pos); pos += ihdrChunk.length;
  png.set(idatChunk, pos); pos += idatChunk.length;
  png.set(iendChunk, pos);

  return Buffer.from(png);
}

// Generate icons
const sizes = [16, 48, 128];
for (const size of sizes) {
  const png = createPNG(size);
  const path = `public/icons/icon${size}.png`;
  writeFileSync(path, png);
  console.log(`Generated ${path} (${png.length} bytes)`);
}
