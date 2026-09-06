const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

function verifyEditorial(root = __dirname) {
  const review = JSON.parse(fs.readFileSync(path.join(root, 'editorial-review.json'), 'utf8'));
  const files = fs.readdirSync(path.join(root, 'blog-content')).filter(name => name.endsWith('.md')).sort();
  const expected = Object.keys(review.articles).sort();
  if (JSON.stringify(files) !== JSON.stringify(expected)) throw new Error('Article inventory changed: review new or removed content before publication');
  const slugs = files.map(file => file.slice(0, -3));
  const blogDir = path.join(root, 'blog');
  if (fs.existsSync(blogDir)) {
    for (const entry of fs.readdirSync(blogDir, { withFileTypes: true })) {
      if (entry.isSymbolicLink() || (entry.isDirectory() && !slugs.includes(entry.name))) throw new Error(`Unreviewed generated output: ${entry.name}`);
    }
  }
  for (const file of files) {
    const body = fs.readFileSync(path.join(root, 'blog-content', file), 'utf8');
    const record = review.articles[file];
    const digest = createHash('sha256').update(body).digest('hex');
    if (digest !== record.sha256) throw new Error(`Editorial review required before publication: ${file}`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(record.reviewedAt) || !record.primarySources?.length) throw new Error(`Missing dated source review: ${file}`);
    for (const source of record.primarySources) {
      const url = new URL(source);
      if (url.protocol !== 'https:' || !['www.floodsmart.gov', 'www.myfloridacfo.com', 'www.flsenate.gov', 'www.citizensfla.com', 'mysafeflhome.com', 'www.floridadisaster.org'].includes(url.hostname) || !body.includes(source)) throw new Error(`Invalid or absent primary citation: ${file}`);
    }
  }
  return files.length;
}

if (require.main === module) console.log(`Editorial review verified for ${verifyEditorial()} articles`);
module.exports = { verifyEditorial };
