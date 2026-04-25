const fetch = require('node-fetch');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const ORIGIN = 'https://planyourskin.com';
const SHOPIFY_STORE = process.env.SHOPIFY_STORE || 'planyourskin.myshopify.com';

// Regex used everywhere to strip planyourskin.com domain
const PYS_REGEX = /(https?:)?\/\/(www\.)?planyourskin\.com/g;

async function fetchAndSave(urlPath, savePath) {
  console.log(`Fetching ${ORIGIN}${urlPath} ...`);
  const res = await fetch(`${ORIGIN}${urlPath}`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
  });
  if (!res.ok) {
    console.error(`  ⚠ Failed to fetch ${urlPath}: ${res.status} ${res.statusText}`);
    return;
  }
  let html = await res.text();

  // ── STEP 0: Global text-level rewrite ────────────────────────
  // This catches EVERYTHING including <noscript>, inline content, schema, meta, etc.
  html = html.replace(PYS_REGEX, '');
  // Also catch URL-encoded variants (e.g. https%3A%2F%2Fplanyourskin.com)
  html = html.replace(/https?%3A%2F%2F(www\.)?planyourskin\.com/gi, '');

  // Now load into cheerio for structural changes
  const $ = cheerio.load(html, { decodeEntities: false });

  // ── STEP 1: Remove WooCommerce scripts ───────────────────────
  $('script').each((_, el) => {
    const src = $(el).attr('src') || '';
    if (src.includes('add-to-cart') && src.includes('.min.js')) $(el).remove();
    if (src.includes('cart-fragments')) $(el).remove();
  });

  // ── STEP 2: De-lazyload images (Litespeed Cache) ─────────────
  // Convert data-src → src and data-srcset → srcset
  $('img[data-src]').each((_, el) => {
    const dataSrc = $(el).attr('data-src');
    if (dataSrc && !dataSrc.startsWith('data:')) {
      $(el).attr('src', dataSrc);
    }
    $(el).removeAttr('data-src');
    $(el).removeAttr('data-lazyloaded');
  });
  $('img[data-srcset]').each((_, el) => {
    const dataSrcset = $(el).attr('data-srcset');
    if (dataSrcset) {
      $(el).attr('srcset', dataSrcset);
    }
    $(el).removeAttr('data-srcset');
  });
  // Also handle data-lazy-src
  $('img[data-lazy-src]').each((_, el) => {
    const dataSrc = $(el).attr('data-lazy-src');
    if (dataSrc && !dataSrc.startsWith('data:')) {
      $(el).attr('src', dataSrc);
    }
    $(el).removeAttr('data-lazy-src');
  });

  // ── STEP 3: Inject Shopify bridge ────────────────────────────
  const injectionHTML = `
<!-- Shopify Injector -->
<script>
  window.__SHOPIFY_CONFIG__ = {
    storeUrl: 'https://${SHOPIFY_STORE}',
    storeDomain: '${SHOPIFY_STORE}',
  };
</script>
<script src="/js/shopify-injector.js"></script>
`;
  $('body').append(injectionHTML);

  // ── STEP 4: Final output ─────────────────────────────────────
  const modifiedHtml = $.html();

  const fullPath = path.join(__dirname, 'public', savePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, modifiedHtml);
  console.log(`  ✓ Saved to public/${savePath}`);
}

async function main() {
  console.log('═══════════════════════════════════════');
  console.log('  Plan Your Skin — Full Site Clone');
  console.log('═══════════════════════════════════════\n');

  // ── Main pages ───────────────────────────────────────────────
  const pages = [
    ['/', 'index.html'],
    ['/shop/', 'shop/index.html'],
    ['/best-seller/', 'best-seller/index.html'],
    ['/about-us/', 'about-us/index.html'],
    ['/product-category/skincare/', 'product-category/skincare/index.html'],
    ['/my-account/', 'my-account/index.html'],
    ['/cart/', 'cart/index.html'],
  ];

  console.log('── Cloning pages ──────────────────────');
  for (const [urlPath, savePath] of pages) {
    await fetchAndSave(urlPath, savePath);
  }

  // ── Product pages (auto-discovered from shop page) ───────────
  console.log('\n── Discovering product pages ───────────');
  const shopHtml = fs.readFileSync(path.join(__dirname, 'public', 'shop', 'index.html'), 'utf8');
  const $ = cheerio.load(shopHtml);
  const productLinks = new Set();
  $('a[href*="/product/"]').each((_, el) => {
    const href = $(el).attr('href');
    if (href && href.startsWith('/product/')) {
      productLinks.add(href);
    }
  });

  // Also scan homepage for product links
  const homeHtml = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
  const $h = cheerio.load(homeHtml);
  $h('a[href*="/product/"]').each((_, el) => {
    const href = $h(el).attr('href');
    if (href && href.startsWith('/product/')) {
      productLinks.add(href);
    }
  });

  const productPaths = Array.from(productLinks);
  console.log(`Found ${productPaths.length} product pages to clone...\n`);

  for (const p of productPaths) {
    const savePath = p.endsWith('/') ? `${p}index.html` : `${p}/index.html`;
    await fetchAndSave(p, savePath.substring(1));
  }

  // ── Verify: count remaining external references ──────────────
  console.log('\n── Verification ───────────────────────');
  const findFiles = (dir, ext, fileList = []) => {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const full = path.join(dir, file);
      if (fs.statSync(full).isDirectory()) {
        findFiles(full, ext, fileList);
      } else if (file.endsWith(ext)) {
        fileList.push(full);
      }
    }
    return fileList;
  };

  let totalRefs = 0;
  const htmlFiles = findFiles(path.join(__dirname, 'public'), '.html');
  for (const f of htmlFiles) {
    const content = fs.readFileSync(f, 'utf8');
    const matches = content.match(/planyourskin\.com/g);
    if (matches) {
      totalRefs += matches.length;
      console.log(`  ⚠ ${f.replace(__dirname, '.')}: ${matches.length} refs remaining`);
    }
  }

  if (totalRefs === 0) {
    console.log('  ✅ ZERO references to planyourskin.com in all HTML files!');
  } else {
    console.log(`\n  ⚠ Total remaining references: ${totalRefs}`);
  }

  console.log('\n═══════════════════════════════════════');
  console.log('  Clone complete! Run: node download-assets.js');
  console.log('═══════════════════════════════════════\n');
}

main().catch(console.error);
