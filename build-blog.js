#!/usr/bin/env node
/**
 * Blog Build Script — Palm Beach Coverage
 *
 * Reads markdown files from blog-content/
 * Generates HTML in blog/[slug]/index.html
 * Generates blog/index.html listing page
 * Appends blog URLs to sitemap.xml
 */

const fs = require('fs');
const path = require('path');
const { marked } = require('marked');

const SITE_URL = 'https://palmbeachcoverage.com';
const CONTENT_DIR = path.join(__dirname, 'blog-content');
const OUTPUT_DIR = path.join(__dirname, 'blog');
const TEMPLATE_PATH = path.join(__dirname, 'blog', '_template.html');
const INDEX_TEMPLATE_PATH = path.join(__dirname, 'blog', '_index-template.html');
const SITEMAP_PATH = path.join(__dirname, 'sitemap.xml');

// Configure marked for clean output
marked.setOptions({
  gfm: true,
  breaks: false,
  headerIds: true,
  mangle: false
});

// Parse YAML-like frontmatter
function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { meta: {}, body: content };

  const meta = {};
  let currentKey = null;

  match[1].split('\n').forEach(line => {
    if (line.match(/^\s*-\s/)) {
      if (currentKey && !Array.isArray(meta[currentKey])) {
        meta[currentKey] = [];
      }
      if (currentKey) {
        meta[currentKey].push(line.replace(/^\s*-\s*/, '').trim().replace(/^["']|["']$/g, ''));
      }
    } else {
      const colonIdx = line.indexOf(':');
      if (colonIdx > -1) {
        currentKey = line.slice(0, colonIdx).trim();
        const val = line.slice(colonIdx + 1).trim().replace(/^["']|["']$/g, '');
        meta[currentKey] = val || '';
      }
    }
  });

  return { meta, body: match[2] };
}

// Format date for display
function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

// Format date for schema (ISO)
function formatDateISO(dateStr) {
  if (!dateStr) return '';
  return dateStr;
}

// Estimate read time
function readTime(text) {
  const words = text.split(/\s+/).length;
  return Math.max(1, Math.ceil(words / 225));
}

// Generate related articles HTML
function getRelatedArticles(current, allArticles, count = 3) {
  const samePillar = allArticles.filter(a => a.slug !== current.slug && a.pillar === current.pillar);
  const others = allArticles.filter(a => a.slug !== current.slug && a.pillar !== current.pillar);
  const related = [...samePillar, ...others].slice(0, count);

  if (!related.length) return '';

  return related.map(a => `
                    <li><a href="/blog/${a.slug}/">${a.title}</a></li>`).join('');
}

// Build all blog articles
function build() {
  console.log('Building blog...\n');

  if (!fs.existsSync(CONTENT_DIR)) {
    console.log('No blog-content/ directory found. Creating it.');
    fs.mkdirSync(CONTENT_DIR, { recursive: true });
    return;
  }

  if (!fs.existsSync(TEMPLATE_PATH)) {
    console.log('No blog/_template.html found. Skipping blog build.');
    return;
  }

  const template = fs.readFileSync(TEMPLATE_PATH, 'utf8');
  const files = fs.readdirSync(CONTENT_DIR).filter(f => f.endsWith('.md'));

  if (!files.length) {
    console.log('No markdown files in blog-content/. Skipping.');
    return;
  }

  const articles = [];

  for (const file of files) {
    const raw = fs.readFileSync(path.join(CONTENT_DIR, file), 'utf8');
    const { meta, body } = parseFrontmatter(raw);
    let html = marked(body);
    // Wrap tables in scrollable container for mobile
    html = html.replace(/<table>/g, '<div class="table-scroll"><table>').replace(/<\/table>/g, '</table></div>');
    const slug = meta.slug || file.replace('.md', '');

    articles.push({
      title: meta.title || slug,
      description: meta.description || '',
      keywords: meta.keywords || '',
      date: meta.date || '2026-03-22',
      pillar: meta.pillar || 'Insurance Guides',
      slug,
      html,
      body,
      file
    });
  }

  // Sort by date descending
  articles.sort((a, b) => new Date(b.date) - new Date(a.date));

  // Generate each article HTML
  for (const article of articles) {
    const dir = path.join(OUTPUT_DIR, article.slug);
    fs.mkdirSync(dir, { recursive: true });

    const relatedHtml = getRelatedArticles(article, articles);
    const minutes = readTime(article.body);

    const pageHtml = template
      .replace(/\{\{TITLE\}\}/g, article.title)
      .replace(/\{\{DESCRIPTION\}\}/g, article.description)
      .replace(/\{\{KEYWORDS\}\}/g, article.keywords)
      .replace(/\{\{SLUG\}\}/g, article.slug)
      .replace(/\{\{DATE\}\}/g, formatDateISO(article.date))
      .replace(/\{\{DATE_FORMATTED\}\}/g, formatDate(article.date))
      .replace(/\{\{CONTENT\}\}/g, article.html)
      .replace(/\{\{PILLAR\}\}/g, article.pillar)
      .replace(/\{\{READ_TIME\}\}/g, minutes + ' min read')
      .replace(/\{\{RELATED_ARTICLES\}\}/g, relatedHtml);

    fs.writeFileSync(path.join(dir, 'index.html'), pageHtml);
    console.log(`  Built: /blog/${article.slug}/`);
  }

  // Generate blog index page
  generateIndex(articles);

  // Update sitemap
  updateSitemap(articles);

  console.log(`\nBlog build complete: ${articles.length} articles`);
}

// Generate the blog listing page
function generateIndex(articles) {
  const articleCards = articles.map(a => `
        <article class="blog-card">
            <div class="blog-card-pillar">${a.pillar}</div>
            <h2><a href="/blog/${a.slug}/">${a.title}</a></h2>
            <p class="blog-card-meta">${formatDate(a.date)} &middot; ${readTime(a.body)} min read</p>
            <p class="blog-card-desc">${a.description}</p>
            <a href="/blog/${a.slug}/" class="blog-card-link">Read article &rarr;</a>
        </article>`).join('\n');

  let indexHtml;
  if (fs.existsSync(INDEX_TEMPLATE_PATH)) {
    indexHtml = fs.readFileSync(INDEX_TEMPLATE_PATH, 'utf8')
      .replace('{{ARTICLE_CARDS}}', articleCards)
      .replace('{{ARTICLE_COUNT}}', articles.length.toString());
  } else {
    indexHtml = `<!DOCTYPE html><html><head><title>Blog | Palm Beach Coverage</title></head><body>${articleCards}</body></html>`;
  }

  fs.writeFileSync(path.join(OUTPUT_DIR, 'index.html'), indexHtml);
  console.log('  Built: /blog/ (index)');
}

// Update sitemap.xml with blog entries
function updateSitemap(articles) {
  if (!fs.existsSync(SITEMAP_PATH)) return;

  let sitemap = fs.readFileSync(SITEMAP_PATH, 'utf8');

  // Remove any previously generated blog entries
  sitemap = sitemap.replace(/\n\s*<!-- Blog Articles -->[\s\S]*?(?=\n\s*<\/urlset>)/, '');

  // Build new blog entries
  let blogEntries = '\n    <!-- Blog Articles -->';

  // Blog index
  blogEntries += `
    <url>
        <loc>${SITE_URL}/blog/</loc>
        <lastmod>${articles[0]?.date || '2026-03-22'}</lastmod>
        <changefreq>daily</changefreq>
        <priority>0.8</priority>
    </url>`;

  for (const article of articles) {
    blogEntries += `
    <url>
        <loc>${SITE_URL}/blog/${article.slug}/</loc>
        <lastmod>${article.date}</lastmod>
        <changefreq>monthly</changefreq>
        <priority>0.7</priority>
    </url>`;
  }

  sitemap = sitemap.replace('</urlset>', blogEntries + '\n</urlset>');
  fs.writeFileSync(SITEMAP_PATH, sitemap);
  console.log('  Updated: sitemap.xml');
}

build();
