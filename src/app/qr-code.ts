type QrVersionSpec = {
  version: number;
  dataCodewords: number;
  eccCodewords: number;
  blocks: number[];
  formatLevelBits: number;
};

const QR_SPECS: QrVersionSpec[] = [
  { version: 1, dataCodewords: 16, eccCodewords: 10, blocks: [16], formatLevelBits: 0 },
  { version: 2, dataCodewords: 28, eccCodewords: 16, blocks: [28], formatLevelBits: 0 },
  { version: 3, dataCodewords: 44, eccCodewords: 26, blocks: [44], formatLevelBits: 0 },
  { version: 4, dataCodewords: 64, eccCodewords: 18, blocks: [32, 32], formatLevelBits: 0 },
  { version: 5, dataCodewords: 86, eccCodewords: 24, blocks: [43, 43], formatLevelBits: 0 },
  { version: 6, dataCodewords: 108, eccCodewords: 16, blocks: [27, 27, 27, 27], formatLevelBits: 0 },
  { version: 1, dataCodewords: 19, eccCodewords: 7, blocks: [19], formatLevelBits: 1 },
  { version: 2, dataCodewords: 34, eccCodewords: 10, blocks: [34], formatLevelBits: 1 },
  { version: 3, dataCodewords: 55, eccCodewords: 15, blocks: [55], formatLevelBits: 1 },
  { version: 4, dataCodewords: 80, eccCodewords: 20, blocks: [80], formatLevelBits: 1 },
  { version: 5, dataCodewords: 108, eccCodewords: 26, blocks: [108], formatLevelBits: 1 },
  { version: 6, dataCodewords: 136, eccCodewords: 18, blocks: [68, 68], formatLevelBits: 1 },
];

const ALIGNMENT_POSITIONS: Record<number, number[]> = {
  1: [],
  2: [6, 18],
  3: [6, 22],
  4: [6, 26],
  5: [6, 30],
  6: [6, 34],
};

const GF_EXP = new Array<number>(512);
const GF_LOG = new Array<number>(256);

let value = 1;
for (let i = 0; i < 255; i += 1) {
  GF_EXP[i] = value;
  GF_LOG[value] = i;
  value <<= 1;
  if (value & 0x100) {
    value ^= 0x11d;
  }
}
for (let i = 255; i < 512; i += 1) {
  GF_EXP[i] = GF_EXP[i - 255];
}

export function generateQrSvgDataUrl(content: string): string {
  const svg = generateQrSvg(content);
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function generateQrSvg(content: string): string {
  const data = new TextEncoder().encode(content);
  const spec = QR_SPECS.find((item) => data.length + 2 <= item.dataCodewords);
  if (!spec) {
    throw new Error('QR content is too long for the local badge generator.');
  }

  const size = spec.version * 4 + 17;
  const matrix = createMatrix(size, false);
  const reserved = createMatrix(size, false);
  drawFunctionPatterns(matrix, reserved, spec.version);

  const bits = buildDataBits(data, spec.dataCodewords);
  const codewords = bytesFromBits(bits);
  const finalCodewords = addErrorCorrection(codewords, spec);
  const dataModules = placeData(matrix, reserved, finalCodewords);
  const mask = chooseMask(matrix, dataModules, spec.formatLevelBits);
  applyMask(matrix, dataModules, mask);
  drawFormatBits(matrix, reserved, mask, spec.formatLevelBits);

  const quiet = 4;
  const viewSize = size + quiet * 2;
  const modules: string[] = [];
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (matrix[y][x]) {
        modules.push(`M${x + quiet} ${y + quiet}h1v1h-1z`);
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewSize} ${viewSize}" shape-rendering="crispEdges"><rect width="${viewSize}" height="${viewSize}" fill="#fff"/><path d="${modules.join('')}" fill="#000"/></svg>`;
}

function createMatrix(size: number, fill: boolean): boolean[][] {
  return Array.from({ length: size }, () => Array.from({ length: size }, () => fill));
}

function setModule(matrix: boolean[][], reserved: boolean[][], x: number, y: number, dark: boolean): void {
  if (y < 0 || y >= matrix.length || x < 0 || x >= matrix.length) {
    return;
  }
  matrix[y][x] = dark;
  reserved[y][x] = true;
}

function drawFunctionPatterns(matrix: boolean[][], reserved: boolean[][], version: number): void {
  const size = matrix.length;
  drawFinder(matrix, reserved, 0, 0);
  drawFinder(matrix, reserved, size - 7, 0);
  drawFinder(matrix, reserved, 0, size - 7);

  for (let i = 8; i < size - 8; i += 1) {
    setModule(matrix, reserved, i, 6, i % 2 === 0);
    setModule(matrix, reserved, 6, i, i % 2 === 0);
  }

  for (const y of ALIGNMENT_POSITIONS[version]) {
    for (const x of ALIGNMENT_POSITIONS[version]) {
      if ((x === 6 && y === 6) || (x === 6 && y === size - 7) || (x === size - 7 && y === 6)) {
        continue;
      }
      drawAlignment(matrix, reserved, x, y);
    }
  }

  setModule(matrix, reserved, 8, size - 8, true);
  reserveFormatModules(reserved);
}

function drawFinder(matrix: boolean[][], reserved: boolean[][], left: number, top: number): void {
  for (let y = -1; y <= 7; y += 1) {
    for (let x = -1; x <= 7; x += 1) {
      const xx = left + x;
      const yy = top + y;
      if (yy < 0 || yy >= matrix.length || xx < 0 || xx >= matrix.length) {
        continue;
      }
      const dark = x >= 0 && x <= 6 && y >= 0 && y <= 6
        && (x === 0 || x === 6 || y === 0 || y === 6 || (x >= 2 && x <= 4 && y >= 2 && y <= 4));
      setModule(matrix, reserved, xx, yy, dark);
    }
  }
}

function drawAlignment(matrix: boolean[][], reserved: boolean[][], centerX: number, centerY: number): void {
  for (let y = -2; y <= 2; y += 1) {
    for (let x = -2; x <= 2; x += 1) {
      setModule(matrix, reserved, centerX + x, centerY + y, Math.max(Math.abs(x), Math.abs(y)) !== 1);
    }
  }
}

function reserveFormatModules(reserved: boolean[][]): void {
  const size = reserved.length;
  for (let i = 0; i <= 5; i += 1) reserved[i][8] = true;
  reserved[7][8] = true;
  reserved[8][8] = true;
  reserved[8][7] = true;
  for (let i = 0; i <= 5; i += 1) reserved[8][i] = true;
  for (let i = 0; i < 8; i += 1) reserved[size - 1 - i][8] = true;
  for (let i = 8; i < 15; i += 1) reserved[8][size - 15 + i] = true;
}

function buildDataBits(data: Uint8Array, dataCodewords: number): number[] {
  const bits: number[] = [];
  appendBits(bits, 0x4, 4);
  appendBits(bits, data.length, 8);
  for (const byte of data) {
    appendBits(bits, byte, 8);
  }

  const capacityBits = dataCodewords * 8;
  appendBits(bits, 0, Math.min(4, capacityBits - bits.length));
  while (bits.length % 8 !== 0) {
    bits.push(0);
  }
  for (let pad = 0xec; bits.length < capacityBits; pad ^= 0xec ^ 0x11) {
    appendBits(bits, pad, 8);
  }
  return bits;
}

function appendBits(bits: number[], val: number, len: number): void {
  for (let i = len - 1; i >= 0; i -= 1) {
    bits.push((val >>> i) & 1);
  }
}

function bytesFromBits(bits: number[]): number[] {
  const result: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let value = 0;
    for (let j = 0; j < 8; j += 1) {
      value = (value << 1) | bits[i + j];
    }
    result.push(value);
  }
  return result;
}

function addErrorCorrection(dataCodewords: number[], spec: QrVersionSpec): number[] {
  const blocks: number[][] = [];
  let offset = 0;
  for (const length of spec.blocks) {
    blocks.push(dataCodewords.slice(offset, offset + length));
    offset += length;
  }

  const eccBlocks = blocks.map((block) => reedSolomonRemainder(block, spec.eccCodewords));
  const result: number[] = [];
  const maxDataLength = Math.max(...blocks.map((block) => block.length));
  for (let i = 0; i < maxDataLength; i += 1) {
    for (const block of blocks) {
      if (i < block.length) {
        result.push(block[i]);
      }
    }
  }
  for (let i = 0; i < spec.eccCodewords; i += 1) {
    for (const block of eccBlocks) {
      result.push(block[i]);
    }
  }
  return result;
}

function reedSolomonRemainder(data: number[], degree: number): number[] {
  const generator = reedSolomonGenerator(degree);
  const result = [...data, ...Array.from({ length: degree }, () => 0)];
  for (let i = 0; i < data.length; i += 1) {
    const coefficient = result[i];
    if (coefficient === 0) {
      continue;
    }
    for (let j = 0; j < generator.length; j += 1) {
      result[i + j] ^= gfMultiply(generator[j], coefficient);
    }
  }
  return result.slice(data.length);
}

function reedSolomonGenerator(degree: number): number[] {
  let result = [1];
  for (let i = 0; i < degree; i += 1) {
    const next = Array.from({ length: result.length + 1 }, () => 0);
    for (let j = 0; j < result.length; j += 1) {
      next[j] ^= result[j];
      next[j + 1] ^= gfMultiply(result[j], GF_EXP[i]);
    }
    result = next;
  }
  return result;
}

function gfMultiply(left: number, right: number): number {
  return left === 0 || right === 0 ? 0 : GF_EXP[GF_LOG[left] + GF_LOG[right]];
}

function placeData(matrix: boolean[][], reserved: boolean[][], codewords: number[]): boolean[][] {
  const size = matrix.length;
  const dataModules = createMatrix(size, false);
  const bits = codewords.flatMap((byte) => Array.from({ length: 8 }, (_, index) => (byte >>> (7 - index)) & 1));
  let bitIndex = 0;
  let upward = true;
  for (let x = size - 1; x >= 1; x -= 2) {
    if (x === 6) {
      x -= 1;
    }
    for (let count = 0; count < size; count += 1) {
      const y = upward ? size - 1 - count : count;
      for (let dx = 0; dx < 2; dx += 1) {
        const xx = x - dx;
        if (!reserved[y][xx]) {
          matrix[y][xx] = bitIndex < bits.length ? bits[bitIndex] === 1 : false;
          dataModules[y][xx] = true;
          bitIndex += 1;
        }
      }
    }
    upward = !upward;
  }
  return dataModules;
}

function chooseMask(matrix: boolean[][], dataModules: boolean[][], formatLevelBits: number): number {
  let bestMask = 0;
  let bestPenalty = Number.POSITIVE_INFINITY;
  for (let mask = 0; mask < 8; mask += 1) {
    const candidate = matrix.map((row) => [...row]);
    applyMask(candidate, dataModules, mask);
    drawFormatBits(candidate, createMatrix(candidate.length, false), mask, formatLevelBits);
    const penalty = scorePenalty(candidate);
    if (penalty < bestPenalty) {
      bestPenalty = penalty;
      bestMask = mask;
    }
  }
  return bestMask;
}

function applyMask(matrix: boolean[][], dataModules: boolean[][], mask: number): void {
  for (let y = 0; y < matrix.length; y += 1) {
    for (let x = 0; x < matrix.length; x += 1) {
      if (dataModules[y][x] && maskCondition(mask, x, y)) {
        matrix[y][x] = !matrix[y][x];
      }
    }
  }
}

function maskCondition(mask: number, x: number, y: number): boolean {
  switch (mask) {
    case 0: return (x + y) % 2 === 0;
    case 1: return y % 2 === 0;
    case 2: return x % 3 === 0;
    case 3: return (x + y) % 3 === 0;
    case 4: return (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0;
    case 5: return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6: return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    default: return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
  }
}

function drawFormatBits(matrix: boolean[][], reserved: boolean[][], mask: number, formatLevelBits: number): void {
  const bits = formatBits(mask, formatLevelBits);
  const size = matrix.length;
  for (let i = 0; i <= 5; i += 1) setModule(matrix, reserved, 8, i, bitAt(bits, i));
  setModule(matrix, reserved, 8, 7, bitAt(bits, 6));
  setModule(matrix, reserved, 8, 8, bitAt(bits, 7));
  setModule(matrix, reserved, 7, 8, bitAt(bits, 8));
  for (let i = 9; i < 15; i += 1) setModule(matrix, reserved, 14 - i, 8, bitAt(bits, i));
  for (let i = 0; i < 8; i += 1) setModule(matrix, reserved, size - 1 - i, 8, bitAt(bits, i));
  for (let i = 8; i < 15; i += 1) setModule(matrix, reserved, 8, size - 15 + i, bitAt(bits, i));
  setModule(matrix, reserved, 8, size - 8, true);
}

function formatBits(mask: number, formatLevelBits: number): number {
  const data = (formatLevelBits << 3) | mask;
  let bits = data << 10;
  for (let i = 14; i >= 10; i -= 1) {
    if ((bits & (1 << i)) !== 0) {
      bits ^= 0x537 << (i - 10);
    }
  }
  return ((data << 10) | bits) ^ 0x5412;
}

function bitAt(value: number, index: number): boolean {
  return ((value >>> index) & 1) !== 0;
}

function scorePenalty(matrix: boolean[][]): number {
  const size = matrix.length;
  let penalty = 0;
  for (let y = 0; y < size; y += 1) {
    penalty += linePenalty(matrix[y]);
  }
  for (let x = 0; x < size; x += 1) {
    penalty += linePenalty(matrix.map((row) => row[x]));
  }
  for (let y = 0; y < size - 1; y += 1) {
    for (let x = 0; x < size - 1; x += 1) {
      const color = matrix[y][x];
      if (matrix[y][x + 1] === color && matrix[y + 1][x] === color && matrix[y + 1][x + 1] === color) {
        penalty += 3;
      }
    }
  }
  const dark = matrix.flat().filter(Boolean).length;
  penalty += Math.floor(Math.abs((dark * 20) / (size * size) - 10)) * 10;
  return penalty;
}

function linePenalty(line: boolean[]): number {
  let penalty = 0;
  let runColor = line[0];
  let runLength = 1;
  for (let i = 1; i < line.length; i += 1) {
    if (line[i] === runColor) {
      runLength += 1;
      if (runLength === 5) {
        penalty += 3;
      } else if (runLength > 5) {
        penalty += 1;
      }
    } else {
      runColor = line[i];
      runLength = 1;
    }
  }
  return penalty;
}
