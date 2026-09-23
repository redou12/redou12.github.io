/**
 * 构建产物冒烟测试
 * 先执行 `hugo --gc --minify -d <目录>`，再运行本脚本。
 * 用法： node scripts/verify-build.mjs [public目录]
 *
 * 其中「URL 保持不变」一节，是 v2.0 迁移时对旧站链接的回归保护：
 * 这些地址一旦挂掉，说明升级破坏了老链接。
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const PUB = process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

/* 新增的 9 篇文章 */
const newPosts = [
    'hugo-quiet-blog',
    'plain-text-notes',
    'git-commit-convention',
    'whitespace-breathing',
    'restrained-palette',
    'typography-three-rules',
    'walden-and-tech',
    'reading-2026',
    'zen-motorcycle',
];

/* v2.0 迁移时必须保持不变的老 URL
   注意：Hugo 会对目录名做 URL 规范化（空格转连字符、去掉全角符号、转小写），
   下面就是实际线上的形式，也是旧站自身的 URL。 */
const legacyUrls = [
    'posts/ai-cmd-整理电脑文件/index.html',
    'posts/游戏的续作感想/index.html',
    'posts/热情驱动的假象媒体叙述的警觉/index.html',
    'talk/我的简易-markdown-语法笔记/index.html',
    'pixelart/岩石绘画记录/index.html',
    'about/index.html',
    'archives/index.html',
    'friends/index.html',
    'search/index.html',
    'gamedev/index.html',
    'pixelart/index.html',
    'talk/index.html',
];

let pass = 0;
let fail = 0;

function check(name, fn) {
    let ok = false;
    let extra = '';
    try {
        const r = fn();
        ok = r === true || (r && r.ok === true);
        if (r && r.note) extra = `  ${r.note}`;
    } catch (e) {
        extra = `  ${e.message}`;
    }
    console.log(`${ok ? '  ✓' : '  ✗'} ${name}${extra}`);
    ok ? pass++ : fail++;
}

const read = (rel) => readFileSync(join(PUB, rel), 'utf8');
const has = (rel) => existsSync(join(PUB, rel));

console.log(`检查目录：${PUB}\n`);

console.log('基础页面');
for (const p of ['index.html', '404.html', 'sitemap.xml', 'index.xml', 'robots.txt', 'search/index.json']) {
    check(p, () => has(p));
}
for (const p of ['about/index.html', 'archives/index.html', 'friends/index.html', 'search/index.html']) {
    check(p, () => has(p));
}
for (const p of ['posts/index.html', 'gamedev/index.html', 'pixelart/index.html', 'talk/index.html']) {
    check(p, () => has(p));
}

console.log('\nURL 保持不变（v2.0 迁移回归保护）');
for (const u of legacyUrls) {
    check(`/${u.replace('/index.html', '/')}`, () => has(u));
}

console.log('\n文章');
check('新增文章 9 篇', () => {
    const missing = newPosts.filter((s) => !has(`posts/${s}/index.html`));
    return missing.length === 0 ? true : { ok: false, note: `缺少 ${missing.join(', ')}` };
});
check('升级说明文章', () => has('posts/site-v2-upgrade/index.html'));

console.log('\n内容');
check('首页标题为「Redou的博客」', () => read('index.html').includes('Redou的博客'));
check('首页含侧栏简介', () => read('index.html').includes('记录游戏开发、像素画'));
check('首页文章卡片为 5 张（分页）', () => {
    const n = (read('index.html').match(/article-title(?![-\w])/g) ?? []).length;
    return n === 5 ? { ok: true, note: `${n} 张` } : { ok: false, note: `实际 ${n} 张` };
});
check('搜索索引覆盖所有栏目（含 talk / pixelart）', () => {
    const j = JSON.parse(read('search/index.json'));
    const perms = j.map((x) => x.permalink).join(' ');
    const need = ['/talk/', '/pixelart/', '/posts/'];
    const missing = need.filter((n) => !perms.includes(n));
    const withImage = j.filter((x) => x.image).length;
    return missing.length === 0 && j.length >= 13
        ? { ok: true, note: `${j.length} 条，其中 ${withImage} 条带封面` }
        : { ok: false, note: `缺少栏目 ${missing.join(',')}；共 ${j.length} 条` };
});
check('提示块渲染（alert-note）', () => read('posts/hugo-quiet-blog/index.html').includes('alert-note'));
check('代码高亮渲染（chroma）', () => read('posts/hugo-quiet-blog/index.html').includes('chroma'));
check('目录（TOC）存在', () => read('posts/hugo-quiet-blog/index.html').includes('toc'));
check('版权声明存在', () => read('posts/plain-text-notes/index.html').includes('CC BY-NC-SA'));
check('阅读时间存在', () => read('posts/walden-and-tech/index.html').includes('分钟'));

console.log('\n旧内容迁移正确性');
check('旧文章正文保留（AI + CMD）', () => read('posts/ai-cmd-整理电脑文件/index.html').includes('为什么不让 AI 帮我写 CMD'));
check('旧文章正文保留（游戏续作）', () => read('posts/游戏的续作感想/index.html').includes('敢于挑战原来的假设'));
check('旧文章正文保留（热情驱动）', () => read('posts/热情驱动的假象媒体叙述的警觉/index.html').includes('消费型的恢复清单'));
check('Markdown 笔记小节已降为 H2', () => {
    const html = read('talk/我的简易-markdown-语法笔记/index.html');
    return html.includes('<h2') ? true : { ok: false, note: '未找到 h2' };
});
check('像素画插图 /rock.png 可访问', () => has('rock.png'));
check('友链 3 位朋友都在', () => {
    const html = read('friends/index.html');
    const names = ['Suxilan', 'ATLcnnd', '小企鹅xqe2011'];
    const missing = names.filter((n) => !html.includes(n));
    return missing.length === 0 ? true : { ok: false, note: `缺少 ${missing.join(', ')}` };
});

console.log('\n分类');
for (const c of ['技术', '设计', '阅读', '像素画', '游戏开发', '杂谈']) {
    check(`分类页 ${c}`, () => has(`categories/${c}/index.html`));
}

console.log('\n样式与资源');
check('自定义配色生效（#40606b）', () => {
    const dir = join(PUB, 'scss');
    const files = readdirSync(dir).filter((f) => f.endsWith('.css'));
    const hit = files.find((f) => readFileSync(join(dir, f), 'utf8').includes('#40606b'));
    return hit ? { ok: true, note: hit } : { ok: false, note: `已检查 ${files.join(', ')}` };
});
check('头像与 favicon 已发布', () => has('img/avatar.png') && has('img/favicon.png'));
check('封面生成了响应式变体', () => read('posts/site-v2-upgrade/index.html').includes('srcset'));
check('站点地址正确（sitemap）', () => read('sitemap.xml').includes('https://redou12.github.io/'));

console.log(`\n结果：${pass} 项通过，${fail} 项失败。`);
process.exit(fail === 0 ? 0 : 1);
