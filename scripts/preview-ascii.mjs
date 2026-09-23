/**
 * 开发用：把 PNG 解码后按亮度印成 ASCII，用来检查构图是否合理。
 * 用法： node scripts/preview-ascii.mjs <图片路径> [列数] [行数]
 */

import { inflateSync } from 'node:zlib';
import { readFileSync } from 'node:fs';

function decodePNG(buf) {
    if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('不是 PNG');
    let pos = 8;
    let ihdr = null;
    const idat = [];
    while (pos < buf.length) {
        const len = buf.readUInt32BE(pos);
        const type = buf.toString('ascii', pos + 4, pos + 8);
        const data = buf.subarray(pos + 8, pos + 8 + len);
        if (type === 'IHDR') {
            ihdr = {
                w: data.readUInt32BE(0),
                h: data.readUInt32BE(4),
                depth: data[8],
                color: data[9],
                interlace: data[12],
            };
        } else if (type === 'IDAT') {
            idat.push(data);
        } else if (type === 'IEND') {
            break;
        }
        pos += 12 + len;
    }
    if (!ihdr) throw new Error('缺少 IHDR');
    if (ihdr.depth !== 8 || ihdr.color !== 2 || ihdr.interlace !== 0) {
        throw new Error(`只支持 8bit RGB 非隔行 PNG（实际 depth=${ihdr.depth} color=${ihdr.color}）`);
    }

    const { w, h } = ihdr;
    const bpp = 3;
    const stride = w * bpp;
    const raw = inflateSync(Buffer.concat(idat));
    const out = Buffer.alloc(h * stride);
    let prev = Buffer.alloc(stride);

    for (let y = 0; y < h; y++) {
        const filter = raw[y * (stride + 1)];
        const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
        const cur = out.subarray(y * stride, (y + 1) * stride);
        for (let i = 0; i < stride; i++) {
            const a = i >= bpp ? cur[i - bpp] : 0;
            const b = prev[i];
            const c = i >= bpp ? prev[i - bpp] : 0;
            let v = line[i];
            switch (filter) {
                case 1: v = (v + a) & 0xff; break;
                case 2: v = (v + b) & 0xff; break;
                case 3: v = (v + ((a + b) >> 1)) & 0xff; break;
                case 4: {
                    const p = a + b - c;
                    const pa = Math.abs(p - a);
                    const pb = Math.abs(p - b);
                    const pc = Math.abs(p - c);
                    const pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
                    v = (v + pred) & 0xff;
                    break;
                }
                default: break;
            }
            cur[i] = v;
        }
        prev = cur;
    }
    return { w, h, rgb: out };
}

const ramp = ' .:-=+*#%@';
const file = process.argv[2];
const cols = Number(process.argv[3] ?? 64);
const rows = Number(process.argv[4] ?? 24);

const { w, h, rgb } = decodePNG(readFileSync(file));
console.log(`${file}  ${w}x${h}`);

const cellW = w / cols;
const cellH = h / rows;
const aspect = cellW / cellH;

for (let r = 0; r < rows; r++) {
    let line = '';
    for (let c = 0; c < cols; c++) {
        const x0 = Math.floor(c * cellW);
        const x1 = Math.min(w, Math.ceil((c + 1) * cellW));
        const y0 = Math.floor(r * cellH);
        const y1 = Math.min(h, Math.ceil((r + 1) * cellH));
        let sum = 0;
        let n = 0;
        for (let y = y0; y < y1; y++) {
            for (let x = x0; x < x1; x++) {
                const i = (y * w + x) * 3;
                sum += 0.299 * rgb[i] + 0.587 * rgb[i + 1] + 0.114 * rgb[i + 2];
                n++;
            }
        }
        const lum = sum / n / 255;
        line += ramp[Math.min(ramp.length - 1, Math.round(lum * (ramp.length - 1)))];
    }
    console.log(line + (r === 0 ? `   (单元格宽高比 ${aspect.toFixed(2)})` : ''));
}
