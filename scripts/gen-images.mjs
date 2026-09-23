/**
 * Redou的博客 · 站点素材生成器
 * ------------------------------------------------------------------
 * 不依赖任何第三方库：手写 PNG 编码器 + 简单光栅器，
 * 生成极简风格的渐变封面与分类图。
 *
 * 用法： node scripts/gen-images.mjs
 *
 * 注意：头像 assets/img/avatar.png 是博主本人的图片，本脚本不会覆盖它。
 */

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/* ================================================================
 *  1. PNG 编码（8bit RGB，逐行自适应滤波）
 * ================================================================ */

const CRC_TABLE = (() => {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        t[n] = c;
    }
    return t;
})();

function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const typeBuf = Buffer.from(type, 'ascii');
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
    return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePNG(w, h, rgb) {
    const stride = w * 3;
    const raw = Buffer.alloc(h * (stride + 1));
    const prev = Buffer.alloc(stride);
    const cur = Buffer.alloc(stride);
    const cand = [Buffer.alloc(stride), Buffer.alloc(stride), Buffer.alloc(stride)];

    for (let y = 0; y < h; y++) {
        rgb.copy(cur, 0, y * stride, y * stride + stride);
        cand[0].set(cur); // None
        for (let i = 0; i < stride; i++) cand[1][i] = (cur[i] - (i >= 3 ? cur[i - 3] : 0)) & 0xff; // Sub
        for (let i = 0; i < stride; i++) cand[2][i] = (cur[i] - prev[i]) & 0xff; // Up

        let best = 0;
        let bestScore = Infinity;
        for (let f = 0; f < 3; f++) {
            let score = 0;
            for (let i = 0; i < stride; i++) {
                const v = cand[f][i];
                score += v < 128 ? v : 256 - v;
            }
            if (score < bestScore) {
                bestScore = score;
                best = f;
            }
        }
        raw[y * (stride + 1)] = best;
        cand[best].copy(raw, y * (stride + 1) + 1);
        prev.set(cur);
    }

    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(w, 0);
    ihdr.writeUInt32BE(h, 4);
    ihdr[8] = 8; // bit depth
    ihdr[9] = 2; // color type: truecolour
    ihdr[10] = 0;
    ihdr[11] = 0;
    ihdr[12] = 0;

    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk('IHDR', ihdr),
        chunk('IDAT', deflateSync(raw, { level: 9 })),
        chunk('IEND', Buffer.alloc(0)),
    ]);
}

/* ================================================================
 *  2. 简易光栅器
 * ================================================================ */

const hex2rgb = (s) => [
    parseInt(s.slice(1, 3), 16),
    parseInt(s.slice(3, 5), 16),
    parseInt(s.slice(5, 7), 16),
];

class Canvas {
    constructor(w, h) {
        this.w = w;
        this.h = h;
        this.buf = new Float32Array(w * h * 3);
    }

    /** 线性渐变填充，angle 为渐变方向（度） */
    gradient(c1, c2, angle = 135) {
        const a = hex2rgb(c1);
        const b = hex2rgb(c2);
        const rad = (angle * Math.PI) / 180;
        const ux = Math.cos(rad);
        const uy = Math.sin(rad);
        let min = Infinity;
        let max = -Infinity;
        for (const [x, y] of [[0, 0], [this.w, 0], [0, this.h], [this.w, this.h]]) {
            const p = x * ux + y * uy;
            if (p < min) min = p;
            if (p > max) max = p;
        }
        const span = max - min || 1;
        for (let y = 0; y < this.h; y++) {
            for (let x = 0; x < this.w; x++) {
                const t = (x * ux + y * uy - min) / span;
                const i = (y * this.w + x) * 3;
                this.buf[i] = a[0] + (b[0] - a[0]) * t;
                this.buf[i + 1] = a[1] + (b[1] - a[1]) * t;
                this.buf[i + 2] = a[2] + (b[2] - a[2]) * t;
            }
        }
        return this;
    }

    blend(x, y, c, alpha) {
        if (alpha <= 0 || x < 0 || y < 0 || x >= this.w || y >= this.h) return;
        const i = (y * this.w + x) * 3;
        const k = 1 - alpha;
        this.buf[i] = this.buf[i] * k + c[0] * alpha;
        this.buf[i + 1] = this.buf[i + 1] * k + c[1] * alpha;
        this.buf[i + 2] = this.buf[i + 2] * k + c[2] * alpha;
    }

    /** half: 'top' 只保留上半圆（穹顶），'bottom' 保留下半圆 */
    circle(cx, cy, r, color, alpha = 1, half = null) {
        const c = hex2rgb(color);
        const x0 = Math.max(0, Math.floor(cx - r - 2));
        const x1 = Math.min(this.w - 1, Math.ceil(cx + r + 2));
        const y0 = Math.max(0, Math.floor(cy - r - 2));
        const y1 = Math.min(this.h - 1, Math.ceil(cy + r + 2));
        for (let y = y0; y <= y1; y++) {
            if (half === 'top' && y > cy) continue;
            if (half === 'bottom' && y < cy) continue;
            for (let x = x0; x <= x1; x++) {
                const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
                const cov = Math.min(1, Math.max(0, (r - d) / 1.4 + 0.5));
                if (cov > 0) this.blend(x, y, c, alpha * cov);
            }
        }
        return this;
    }

    ring(cx, cy, r, thickness, color, alpha = 1) {
        const c = hex2rgb(color);
        const half = thickness / 2;
        const x0 = Math.max(0, Math.floor(cx - r - half - 2));
        const x1 = Math.min(this.w - 1, Math.ceil(cx + r + half + 2));
        const y0 = Math.max(0, Math.floor(cy - r - half - 2));
        const y1 = Math.min(this.h - 1, Math.ceil(cy + r + half + 2));
        for (let y = y0; y <= y1; y++) {
            for (let x = x0; x <= x1; x++) {
                const d = Math.abs(Math.hypot(x + 0.5 - cx, y + 0.5 - cy) - r);
                const cov = Math.min(1, Math.max(0, (half - d) / 1.4 + 0.5));
                if (cov > 0) this.blend(x, y, c, alpha * cov);
            }
        }
        return this;
    }

    hline(y, x0, x1, thickness, color, alpha = 1) {
        const c = hex2rgb(color);
        const half = thickness / 2;
        const ya = Math.max(0, Math.floor(y - half - 2));
        const yb = Math.min(this.h - 1, Math.ceil(y + half + 2));
        const xa = Math.max(0, Math.floor(Math.min(x0, x1)));
        const xb = Math.min(this.w - 1, Math.ceil(Math.max(x0, x1)));
        for (let yy = ya; yy <= yb; yy++) {
            const covY = Math.min(1, Math.max(0, (half - Math.abs(yy + 0.5 - y)) / 1.4 + 0.5));
            if (covY <= 0) continue;
            for (let xx = xa; xx <= xb; xx++) this.blend(xx, yy, c, alpha * covY);
        }
        return this;
    }

    png() {
        const out = Buffer.alloc(this.w * this.h * 3);
        for (let i = 0; i < out.length; i++) {
            out[i] = Math.max(0, Math.min(255, Math.round(this.buf[i])));
        }
        return encodePNG(this.w, this.h, out);
    }
}

/* ================================================================
 *  3. 极简构图：渐变底 + 大范围柔光 + 一个几何母题
 * ================================================================ */

const PAPER = '#f6f4f0';

function compose({ w, h, from, to, motif, angle = 135, horizon = 0.68, scale = 1 }) {
    const c = new Canvas(w, h).gradient(from, to, angle);
    const cx = w / 2;
    const cy = h / 2;

    // 大范围柔光，制造轻微的空气感
    c.circle(w * 0.78, h * 0.16, h * 0.55, PAPER, 0.06);

    const lineY = h * horizon;

    switch (motif) {
        case 'sun':
            c.circle(w * 0.66, h * 0.36, h * 0.085 * scale, PAPER, 0.92);
            c.hline(lineY, w * 0.12, w * 0.88, 2, PAPER, 0.3);
            c.circle(w * 0.32, lineY, h * 0.085 * scale, PAPER, 0.5, 'top');
            break;
        case 'arc':
            c.circle(w * 0.36, lineY, h * 0.17 * scale, PAPER, 0.85, 'top');
            c.circle(w * 0.68, h * 0.33, h * 0.05 * scale, PAPER, 0.9);
            c.hline(lineY, w * 0.1, w * 0.9, 2, PAPER, 0.32);
            break;
        case 'rings':
            c.ring(cx, cy * 0.96, h * 0.22 * scale, 3, PAPER, 0.22);
            c.ring(cx, cy * 0.96, h * 0.32 * scale, 2, PAPER, 0.13);
            c.circle(cx, cy * 0.96, h * 0.05 * scale, PAPER, 0.85);
            break;
        case 'bands':
            c.hline(h * 0.33, w * 0.14, w * 0.62, 3, PAPER, 0.22);
            c.hline(h * 0.42, w * 0.14, w * 0.46, 3, PAPER, 0.17);
            c.hline(h * 0.51, w * 0.14, w * 0.72, 3, PAPER, 0.13);
            c.circle(w * 0.74, h * 0.62, h * 0.1 * scale, PAPER, 0.8);
            c.hline(lineY, w * 0.1, w * 0.9, 2, PAPER, 0.28);
            break;
        default:
            break;
    }
    return c.png();
}

/* ================================================================
 *  4. 输出清单
 * ================================================================ */

const SITE = join(dirname(fileURLToPath(import.meta.url)), '..');

// 文章封面：1600×900
const covers = [
    // ---- 迁移过来的旧文章 ----
    { path: 'content/posts/ai-cmd-整理电脑文件/cover.png', from: '#2b3a4a', to: '#5d7f9c', motif: 'bands', angle: 125 },
    { path: 'content/posts/游戏的续作感想/cover.png', from: '#4a3f5c', to: '#7d6f96', motif: 'arc', angle: 140 },
    { path: 'content/posts/热情驱动的假象？媒体叙述的警觉！/cover.png', from: '#8a5a3d', to: '#c0916a', motif: 'rings', angle: 120 },
    { path: 'content/talk/我的简易 Markdown 语法笔记/cover.png', from: '#2f4a5c', to: '#5f8299', motif: 'bands', angle: 135 },
    { path: 'content/pixelart/岩石绘画记录/cover.png', from: '#4a4744', to: '#8a837a', motif: 'sun', angle: 130 },
    // ---- v2.0 升级说明 ----
    { path: 'content/posts/site-v2-upgrade/cover.png', from: '#2b3f4a', to: '#4f7d8c', motif: 'rings', angle: 145 },
    // ---- 新增内容 ----
    { path: 'content/posts/hugo-quiet-blog/cover.png', from: '#33475b', to: '#5d7f9c', motif: 'sun', angle: 120 },
    { path: 'content/posts/plain-text-notes/cover.png', from: '#40543f', to: '#7d9a7b', motif: 'rings', angle: 150 },
    { path: 'content/posts/git-commit-convention/cover.png', from: '#222831', to: '#4a5568', motif: 'bands', angle: 135 },
    { path: 'content/posts/whitespace-breathing/cover.png', from: '#8a7350', to: '#cbb083', motif: 'arc', angle: 110 },
    { path: 'content/posts/restrained-palette/cover.png', from: '#4b4257', to: '#857aa0', motif: 'bands', angle: 145 },
    { path: 'content/posts/typography-three-rules/cover.png', from: '#7c5a54', to: '#b58e84', motif: 'rings', angle: 125 },
    { path: 'content/posts/walden-and-tech/cover.png', from: '#2f5d62', to: '#6fa3a3', motif: 'arc', angle: 140 },
    { path: 'content/posts/reading-2026/cover.png', from: '#3c4a3a', to: '#77875f', motif: 'sun', angle: 130 },
    { path: 'content/posts/zen-motorcycle/cover.png', from: '#8a4f3d', to: '#c2805f', motif: 'arc', angle: 115 },
];

// 正文插图：1200×600
const figures = [
    { path: 'content/posts/hugo-quiet-blog/figure.png', from: '#2f3d4d', to: '#67839c', motif: 'bands', angle: 135, horizon: 0.74 },
    { path: 'content/posts/whitespace-breathing/figure.png', from: '#a58a63', to: '#d8c39d', motif: 'rings', angle: 120 },
    { path: 'content/posts/restrained-palette/figure.png', from: '#4b4257', to: '#857aa0', motif: 'bands', angle: 145 },
];

// 分类页配图：1200×600（头像不在此列，见文件头说明）
const others = [
    { path: 'assets/img/favicon.png', w: 256, h: 256, from: '#2b3a4a', to: '#5d7f9c', motif: 'arc', angle: 145, horizon: 0.66, scale: 1.2 },
    { path: 'content/categories/技术/cover.png', w: 1200, h: 600, from: '#26313d', to: '#54697f', motif: 'bands', angle: 130 },
    { path: 'content/categories/设计/cover.png', w: 1200, h: 600, from: '#8a7350', to: '#cbb083', motif: 'rings', angle: 120 },
    { path: 'content/categories/阅读/cover.png', w: 1200, h: 600, from: '#2f5d62', to: '#6fa3a3', motif: 'sun', angle: 140 },
    { path: 'content/categories/像素画/cover.png', w: 1200, h: 600, from: '#4a4744', to: '#8a837a', motif: 'sun', angle: 130 },
    { path: 'content/categories/游戏开发/cover.png', w: 1200, h: 600, from: '#4a3f5c', to: '#7d6f96', motif: 'arc', angle: 140 },
    { path: 'content/categories/杂谈/cover.png', w: 1200, h: 600, from: '#8a5a3d', to: '#c0916a', motif: 'bands', angle: 120 },
];

/* ================================================================
 *  5. 执行
 * ================================================================ */

let count = 0;
function emit(rel, buf) {
    const full = join(SITE, rel);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, buf);
    count++;
    console.log(`  ✓ ${rel}  (${(buf.length / 1024).toFixed(1)} KB)`);
}

console.log('生成封面 …');
for (const c of covers) emit(c.path, compose({ w: 1600, h: 900, ...c }));

console.log('生成插图 …');
for (const f of figures) emit(f.path, compose({ w: 1200, h: 600, ...f }));

console.log('生成 favicon 与分类图 …');
for (const o of others) emit(o.path, compose(o));

console.log(`\n完成：共 ${count} 张图片。（头像未改动）`);
