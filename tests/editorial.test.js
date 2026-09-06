const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { marked } = require('marked');
const { verifyEditorial } = require('../verify-editorial');
const { buildHome } = require('../build-home');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const structured = html => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(match => JSON.parse(match[1]));
const plain = html => html.replace(/<[^>]+>/g, '').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').trim();

test('all ten source articles have an explicit source review', () => assert.equal(verifyEditorial(root), 10));

test('unreviewed edits and new articles fail before publication', t => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'coverage-editorial-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  fs.cpSync(path.join(root, 'blog-content'), path.join(tmp, 'blog-content'), { recursive: true });
  fs.copyFileSync(path.join(root, 'editorial-review.json'), path.join(tmp, 'editorial-review.json'));
  const filename = path.join(tmp, 'blog-content', 'florida-roof-age-insurance-law-hb-815.md');
  const original = fs.readFileSync(filename);
  fs.appendFileSync(filename, '\nWe guaranteed a client 50% savings.\n');
  assert.throws(() => verifyEditorial(tmp), /Editorial review required/);
  fs.writeFileSync(filename, original);
  fs.writeFileSync(path.join(tmp, 'blog-content', 'unreviewed.md'), 'Unreviewed factual article');
  assert.throws(() => verifyEditorial(tmp), /inventory changed/);
  fs.unlinkSync(path.join(tmp, 'blog-content', 'unreviewed.md'));
  fs.mkdirSync(path.join(tmp, 'blog', 'unreviewed-output'), {recursive: true});
  assert.throws(() => verifyEditorial(tmp), /Unreviewed generated output/);
});

test('visible homepage FAQ and JSON-LD contain the same six answers', () => {
  const html = read('index.html');
  const faq = structured(html).find(value => value['@type'] === 'FAQPage');
  const questions = [...html.matchAll(/<button class="faq-q"[^>]*>(.*?)<\/button>/g)].map(match => plain(match[1]));
  const answers = [...html.matchAll(/<div class="faq-a-inner"><p>(.*?)<\/p>/g)].map(match => plain(match[1]));
  assert.equal(questions.length, 6);
  assert.deepEqual(questions, faq.mainEntity.map(value => value.name));
  assert.deepEqual(answers, faq.mainEntity.map(value => value.acceptedAnswer.text));
});

test('homepage FAQ rebuild is stable and refuses missing markers', t => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'coverage-home-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const original = read('index.html');
  const filename = path.join(tmp, 'index.html');
  fs.writeFileSync(filename, original);
  buildHome(tmp);
  assert.equal(fs.readFileSync(filename, 'utf8'), original);
  fs.writeFileSync(filename, original.replace('HOME_FAQ_VISIBLE_START', 'MISSING_MARKER'));
  assert.throws(() => buildHome(tmp), /Expected one/);
});

test('source bodies and current metadata survive generation for all ten URLs', () => {
  for (const file of fs.readdirSync(path.join(root, 'blog-content')).filter(name => name.endsWith('.md'))) {
    const source = read(`blog-content/${file}`);
    const slug = source.match(/^slug: "(.*?)"/m)[1];
    const body = source.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/)[1];
    const page = read(`blog/${slug}/index.html`);
    const generatedBody = page.match(/<div class="article-content">\s*([\s\S]*?)\s*<\/div>\s*<div class="article-disclaimer">/)[1];
    assert.equal(generatedBody.trim(), marked(body).trim(), slug);
    assert.equal((page.match(/<h1\b/g) || []).length, 1, slug);
    assert.ok(page.includes(`rel="canonical" href="https://palmbeachcoverage.com/blog/${slug}/"`), slug);
    assert.ok(!/<meta[^>]+content="[^"]*noindex/.test(page), slug);
    const article = structured(page).find(value => value['@type'] === 'Article');
    assert.equal(article.dateModified, '2026-09-06');
    assert.equal(article.author['@type'], 'Organization');
    assert.ok(page.includes('Updated September 6, 2026'));
    assert.ok(!page.includes('{{'), `unresolved template in ${slug}`);
  }
});

test('prelaunch identity is visible and schema does not invent an operating agency or address', () => {
  const html = read('index.html');
  const org = structured(html).find(value => value['@type'] === 'Organization');
  assert.ok(!org.address);
  assert.ok(!org.areaServed);
  assert.match(org.description, /prelaunch/);
  for (const name of ['index.html', 'blog/index.html', ...fs.readdirSync(path.join(root, 'blog-content')).filter(x=>x.endsWith('.md')).map(x=>`blog/${x.slice(0,-3)}/index.html`)]) {
    const page = read(name);
    assert.ok(page.includes('Insurance agency services are not currently available'), name);
    assert.ok(!/"@type":\s*"(?:InsuranceAgency|LocalBusiness)"/.test(page), name);
  }
});

test('waitlist forms retain Netlify field names and no renamed payload keys', () => {
  const html = read('index.html');
  const forms = [...html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/g)];
  assert.equal(forms.length, 2);
  const fieldNames = forms.map(match => [...match[2].matchAll(/<(?:input|select)[^>]*\bname="([^"]+)"/g)].map(field => field[1]));
  assert.deepEqual(fieldNames[0], ['form-name','bot-field','first_name','last_name','email','phone','zip_code','coverage_type']);
  assert.deepEqual(fieldNames[1], ['form-name','bot-field','email']);
  for (const match of forms) {
    assert.match(match[1], /method="POST"/);
    assert.match(match[1], /data-netlify="true"/);
  }
  assert.match(html, /fetch\('\/',/);
  assert.match(html, /new URLSearchParams\(data\)/);
  assert.match(html, /name="msvalidate\.01"/);
});

test('waitlist sends encoded fields and shows success only on accepted HTTP, never errors', async () => {
  const script = read('index.html').match(/<script>\s*([\s\S]*?)<\/script>/)[1];
  for (const result of ['accepted', 'http-error', 'network-error']) {
    const button = { disabled: false };
    const feedback = { textContent: '' };
    const fields = [['form-name','early-access'], ['first_name','Test'], ['email','test@example.invalid'], ['coverage_type','flood']];
    const form = { querySelector: selector => selector.startsWith('button') ? button : feedback };
    let success = 0;
    let request;
    const context = vm.createContext({
      FormData: class { constructor(received) { assert.equal(received, form); } *[Symbol.iterator]() { yield* fields; } },
      URLSearchParams,
      fetch: async (url, options) => { request = {url, options}; if (result === 'network-error') throw new Error('offline'); return {ok: result === 'accepted'}; },
      document: { getElementById: () => ({addEventListener() {}}), querySelectorAll: () => [] }
    });
    vm.runInContext(script, context);
    await context.submitWaitlist(form, () => { success++; });
    assert.equal(request.url, '/');
    assert.equal(request.options.method, 'POST');
    assert.deepEqual([...new URLSearchParams(request.options.body)], fields);
    assert.equal(success, result === 'accepted' ? 1 : 0, result);
    assert.equal(button.disabled, false, result);
    assert.equal(feedback.textContent, result === 'accepted' ? '' : 'We could not confirm your submission. Please try again.');
  }
});

test('release contains only the 17 public files with identical source bytes', () => {
  const expected = ['index.html','robots.txt','sitemap.xml','blog/index.html','blog/feed.xml','assets/og-coverage.svg','assets/og-coverage.png', ...fs.readdirSync(path.join(root, 'blog-content')).filter(x=>x.endsWith('.md')).map(x=>`blog/${x.slice(0,-3)}/index.html`)].sort();
  function files(dir, prefix = '') {
    return fs.readdirSync(dir, {withFileTypes: true}).flatMap(entry => entry.isDirectory() ? files(path.join(dir, entry.name), `${prefix}${entry.name}/`) : [`${prefix}${entry.name}`]);
  }
  assert.deepEqual(files(path.join(root, 'public')).sort(), expected);
  for (const name of expected) assert.deepEqual(fs.readFileSync(path.join(root, 'public', name)), fs.readFileSync(path.join(root, name)), name);
});


test('sitemap and feed reflect this substantive September 6 content revision', () => {
  const sitemap = read('sitemap.xml');
  const lastmods = [...sitemap.matchAll(/<lastmod>(.*?)<\/lastmod>/g)].map(match => match[1]);
  assert.equal(lastmods.length, 12);
  assert.ok(lastmods.every(date => date === '2026-09-06'));
  assert.ok(read('blog/feed.xml').includes('<lastBuildDate>Sun, 06 Sep 2026 00:00:00 GMT</lastBuildDate>'));
});
