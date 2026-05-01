const express = require('express');
const fetch = require('node-fetch');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Parse JSON bodies
app.use(express.json());

// Shopify credentials
const SHOPIFY_STORE = (process.env.SHOPIFY_STORE || 'planyourskin.myshopify.com').trim();
const SHOPIFY_API_KEY = (process.env.SHOPIFY_API_KEY || '').trim();
const API_VERSION = '2024-01';

// Midtrans credentials
const MIDTRANS_SERVER_KEY = (process.env.MIDTRANS_SERVER_KEY || '').trim();
const MIDTRANS_CLIENT_KEY = (process.env.MIDTRANS_CLIENT_KEY || '').trim();
const MIDTRANS_IS_PRODUCTION = process.env.MIDTRANS_IS_PRODUCTION === 'true';

// RajaOngkir credentials (API V2 — Komerce)
const RAJAONGKIR_API_KEY = (process.env.RAJAONGKIR_API_KEY || '').trim();
const RAJAONGKIR_BASE_URL = 'https://rajaongkir.komerce.id/api/v1';
// Origin district ID (set this to your warehouse district ID from RajaOngkir V2)
const ORIGIN_DISTRICT_ID = process.env.ORIGIN_CITY_ID || '1391'; // Default: Jakarta Pusat area

// ─── Extract header/footer from homepage for product pages ─────
// Read homepage once and cache the head CSS, header HTML, and footer HTML
let _headerFooterCache = null;
function getHeaderFooter() {
  if (_headerFooterCache) return _headerFooterCache;
  
  const homePath = path.join(__dirname, 'public', 'index.html');
  if (!fs.existsSync(homePath)) return null;
  
  const homeHtml = fs.readFileSync(homePath, 'utf8');
  
  // Extract everything inside <head>...</head> (CSS, fonts, etc.)
  const headMatch = homeHtml.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
  const headContent = headMatch ? headMatch[1] : '';
  
  // Extract the header section (everything before the main page content)
  // The homepage structure: header builder is inside .page-wrapper > .header-wrapper
  // We extract from <body...> up to and including the header/nav elements
  const bodyMatch = homeHtml.match(/<body[^>]*>([\s\S]*)/i);
  const bodyContent = bodyMatch ? bodyMatch[1] : '';
  
  // Find the header — it ends before the main content sections
  // Look for the pattern where header ends (the first elementor section that's NOT the header)
  const headerEndMarkers = [
    '<!-- Elementor Page Content -->',
    'class="page-content"',
    'data-elementor-id="2"',  // Homepage content ID
    'class="elementor elementor-2 '
  ];
  
  let headerHtml = '';
  for (const marker of headerEndMarkers) {
    const idx = bodyContent.indexOf(marker);
    if (idx > 0) {
      headerHtml = bodyContent.substring(0, idx);
      break;
    }
  }
  
  // If no marker found, try to extract just the header-wrapper
  if (!headerHtml) {
    // Extract everything from body start up to a reasonable break point
    // Look for the elementor-2 class which is the homepage body content
    const el2Idx = bodyContent.indexOf('elementor-2');
    if (el2Idx > 0) {
      // Go back to find the opening tag
      const beforeEl2 = bodyContent.substring(0, el2Idx);
      const lastDiv = beforeEl2.lastIndexOf('<div');
      if (lastDiv > 0) {
        headerHtml = bodyContent.substring(0, lastDiv);
      }
    }
  }
  
  // Extract footer — everything after the main content to </body>
  // Footer typically starts after the last elementor page section
  let footerHtml = '';
  const footerMarkers = ['<!-- Shopify Injector -->', 'class="footer', 'id="footer"', 'porto-sticky-navbar'];
  for (const marker of footerMarkers) {
    const idx = homeHtml.indexOf(marker);
    if (idx > 0) {
      // Go back to find the containing div
      const beforeMarker = homeHtml.substring(0, idx);
      // Find the footer container start
      const footerStart = beforeMarker.lastIndexOf('<div class="footer') || beforeMarker.lastIndexOf('<footer');
      if (footerStart > 0) {
        footerHtml = homeHtml.substring(footerStart);
        // Remove </body></html> and trailing comments
        footerHtml = footerHtml.replace(/<\/body>[\s\S]*$/i, '');
        break;
      }
    }
  }

  _headerFooterCache = { headContent, headerHtml, footerHtml };
  return _headerFooterCache;
}

// ─── Intercept ALL /product/* requests (BEFORE static) ─────────
app.use('/product', (req, res, next) => {
  // Skip asset files
  if (req.path.match(/\.(css|js|png|jpe?g|gif|webp|svg|woff2?|ttf|eot|ico|map|json)$/i)) {
    return next();
  }
  const handle = req.path.replace(/^\/+|\/+$/g, '');
  if (!handle || handle === '_template.html') {
    return next();
  }
  
  const templatePath = path.join(__dirname, 'public', 'product', '_template.html');
  if (!fs.existsSync(templatePath)) return next();
  
  let templateHtml = fs.readFileSync(templatePath, 'utf8');
  
  // Extract template body content (between <body> and </body>)
  const templateBody = templateHtml.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  const templateContent = templateBody ? templateBody[1] : templateHtml;
  
  // Get template's own <style> block
  const templateStyle = templateHtml.match(/<style>([\s\S]*?)<\/style>/i);
  const templateCSS = templateStyle ? `<style>${templateStyle[1]}</style>` : '';
  
  // Get header/footer from homepage
  const hf = getHeaderFooter();
  
  if (hf && hf.headerHtml) {
    // Build full page with homepage head + header + template content + footer
    const fullHtml = `<!DOCTYPE html>
<html lang="en-US">
<head>
${hf.headContent}
${templateCSS}
</head>
<body class="single-product woocommerce">
${hf.headerHtml}

<!-- Product Content -->
<div id="main" class="wide column1">
<div class="main-content" style="padding-top:0;">
${templateContent}
</div>
</div>

${hf.footerHtml}
</body></html>`;
    
    let html = typeof injectScripts === 'function' ? injectScripts(fullHtml) : fullHtml;
    return res.type('html').send(html);
  }
  
  // Fallback: serve template as-is
  let html = typeof injectScripts === 'function' ? injectScripts(templateHtml) : templateHtml;
  return res.type('html').send(html);
});

// ─── Inject our scripts into ALL HTML pages ───────────────────
// Legacy static pages may not include our cart/app/bridge scripts.
// This middleware injects only the MISSING ones before </body>.
const REQUIRED_SCRIPTS = [
  { path: '/js/cart.js', check: 'cart.js' },
  { path: '/js/product-card.js', check: 'product-card.js' },
  { path: '/js/app.js', check: 'app.js' },
  { path: '/js/shopify-injector.js', check: 'shopify-injector.js' },
  { path: '/js/dynamic-grid.js', check: 'dynamic-grid.js' },
];

// ─── Dynamic grid transform: replace hardcoded WooCommerce product grids ─
// with empty placeholders, hydrated client-side from /api/products.
// Each entry maps URL prefix → array of filters (one per grid on the page).
const DYNAMIC_GRID_PAGES = [
  { match: p => p === '/' || p === '/index.html', filters: ['all', 'all'] },
  { match: p => p === '/shop' || p === '/shop/', filters: ['all'] },
  { match: p => p === '/best-seller' || p === '/best-seller/', filters: ['tag:Best Seller'] },
  { match: p => p === '/brand/plan-your-skin' || p === '/brand/plan-your-skin/', filters: ['vendor:Plan Your Skin'] },
  { match: p => /^\/product-category\/(skincare\/)?moisturizer\/?$/.test(p), filters: ['type:Moisturizer'] },
  { match: p => /^\/product-category\/(skincare\/)?cleansing-serum\/?$/.test(p), filters: ['type:Cleanser'] },
  { match: p => /^\/product-category\/skincare\/sunscreen\/?$/.test(p), filters: ['type:Sunscreen'] },
  { match: p => /^\/product-category\/skincare\/serums\/?$/.test(p), filters: ['type:Serum'] },
  { match: p => /^\/product-category\/skincare\/?$/.test(p), filters: ['all'] },
];

function getDynamicGridFilters(reqPath) {
  const entry = DYNAMIC_GRID_PAGES.find(e => e.match(reqPath));
  return entry ? entry.filters : null;
}

// Replace each <div class="posts-wrap products-container ...">...</div> block with
// an empty placeholder div carrying the same classes + pys-dynamic-grid + data-pys-filter.
// Walks the HTML to find balanced </div> for each grid.
function transformProductGrids(html, filters) {
  if (!filters || !filters.length) return html;
  const marker = 'posts-wrap products-container';
  let result = '';
  let cursor = 0;
  let gridIndex = 0;

  while (cursor < html.length) {
    const matchIdx = html.indexOf(marker, cursor);
    if (matchIdx === -1) {
      result += html.slice(cursor);
      break;
    }

    // Find <div tag start (the marker is inside class="...")
    const divStart = html.lastIndexOf('<div', matchIdx);
    if (divStart === -1 || divStart < cursor) {
      result += html.slice(cursor, matchIdx + marker.length);
      cursor = matchIdx + marker.length;
      continue;
    }

    // Find end of opening tag
    const tagEnd = html.indexOf('>', matchIdx);
    if (tagEnd === -1) {
      result += html.slice(cursor);
      break;
    }

    // Extract original class attribute (so placeholder keeps layout classes like ccols-xl-4)
    const openTag = html.slice(divStart, tagEnd + 1);
    const classMatch = openTag.match(/class="([^"]*)"/);
    const origClass = classMatch ? classMatch[1] : marker;

    // Walk forward counting <div ... > / </div> to find balanced close
    let depth = 1;
    let pos = tagEnd + 1;
    while (depth > 0 && pos < html.length) {
      const nextOpen = html.indexOf('<div', pos);
      const nextClose = html.indexOf('</div>', pos);
      if (nextClose === -1) { pos = html.length; break; }
      if (nextOpen !== -1 && nextOpen < nextClose) {
        // Make sure it's a real div tag (followed by space or >), not e.g. <divider>
        const after = html.charAt(nextOpen + 4);
        if (after === ' ' || after === '>' || after === '\t' || after === '\n') {
          depth++;
        }
        pos = nextOpen + 4;
      } else {
        depth--;
        pos = nextClose + 6;
      }
    }

    const filter = filters[gridIndex] != null ? filters[gridIndex] : filters[filters.length - 1];
    gridIndex++;
    const placeholder =
      '<div class="' + origClass + ' pys-dynamic-grid" data-pys-filter="' + filter + '"></div>';

    result += html.slice(cursor, divStart) + placeholder;
    cursor = pos;
  }

  return result;
}

function injectScripts(html) {
  if (!html.includes('</body>')) return html;

  let toInject = '';
  for (const script of REQUIRED_SCRIPTS) {
    if (!html.includes(script.check)) {
      toInject += `<script src="${script.path}"></script>\n`;
    }
  }

  if (toInject) {
    html = html.replace('</body>', toInject + '</body>');
  }
  return html;
}

// Custom static middleware for HTML files — serves with script injection
const staticDir = path.join(__dirname, 'public');
app.use((req, res, next) => {
  // Skip assets and API
  if (req.path.match(/\.(css|js|png|jpe?g|gif|webp|svg|woff2?|ttf|eot|ico|map|json|xml|txt)$/i) || req.path.startsWith('/api/')) {
    return next();
  }

  // Resolve HTML file path
  let filePath = path.join(staticDir, req.path);
  
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  } else if (!filePath.endsWith('.html') && fs.existsSync(filePath + '.html')) {
    filePath = filePath + '.html';
  }

  if (fs.existsSync(filePath) && filePath.endsWith('.html')) {
    let html = fs.readFileSync(filePath, 'utf8');
    const gridFilters = getDynamicGridFilters(req.path);
    if (gridFilters) {
      html = transformProductGrids(html, gridFilters);
      // Fallback: page has no posts-wrap container — inject a placeholder.
      if (!html.includes('pys-dynamic-grid')) {
        const insertMarker = '<div class="page-content">';
        const idx = html.indexOf(insertMarker);
        if (idx !== -1) {
          const insertAt = idx + insertMarker.length;
          const placeholder =
            '<div class="posts-wrap products-container has-ccols ccols-xl-4 ccols-md-3 ccols-sm-2 ccols-1 has-ccols-spacing pys-dynamic-grid" data-pys-filter="' +
            gridFilters[0] +
            '" style="padding:40px 5%;max-width:1400px;margin:0 auto;"></div>';
          html = html.slice(0, insertAt) + placeholder + html.slice(insertAt);
        }
      }
    }
    html = injectScripts(html);
    return res.type('html').send(html);
  }

  next();
});

// Static assets (CSS, JS, images, etc.)
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: 0, // No cache during development
}));

// ─── Product Cache ─────────────────────────────────────────────
let productCache = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function fetchShopifyProducts() {
  const now = Date.now();
  if (productCache && (now - cacheTimestamp) < CACHE_TTL) {
    return productCache;
  }
  try {
    const response = await fetch(
      `https://${SHOPIFY_STORE}/admin/api/${API_VERSION}/products.json?limit=250&status=active`,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': SHOPIFY_API_KEY,
        },
      }
    );
    if (!response.ok) throw new Error(`Shopify API error: ${response.status}`);
    const data = await response.json();
    productCache = data.products;
    cacheTimestamp = now;
    console.log(`[Shopify] Loaded ${productCache.length} products`);
    return productCache;
  } catch (error) {
    console.error('[Shopify] Error:', error.message);
    return productCache || [];
  }
}

// Transform products for the API response
function transformProduct(p) {
  return {
    id: p.id,
    title: p.title,
    handle: p.handle,
    body_html: p.body_html,
    vendor: p.vendor,
    product_type: p.product_type,
    tags: p.tags,
    price: p.variants?.[0]?.price || '0',
    compare_at_price: p.variants?.[0]?.compare_at_price || null,
    images: p.images?.map(img => ({
      src: img.src,
      alt: img.alt || p.title,
    })) || [],
    image: p.images?.[0]?.src || '',
    variants: p.variants,
  };
}

// ─── Shopify API Routes ────────────────────────────────────────
app.get('/api/products', async (req, res) => {
  try {
    const products = await fetchShopifyProducts();
    res.json({ products: products.map(transformProduct) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/products/:handle', async (req, res) => {
  try {
    const products = await fetchShopifyProducts();
    const handle = req.params.handle.toLowerCase();
    
    // 1. Exact match
    let product = products.find(p => p.handle === handle);
    
    // 2. Fuzzy match: URL handle is contained in Shopify handle (or vice versa)
    if (!product) {
      product = products.find(p => 
        p.handle.includes(handle) || handle.includes(p.handle)
      );
    }
    
    // 3. Title-based match: convert title to slug and compare
    if (!product) {
      const urlSlug = handle.replace(/-/g, ' ');
      product = products.find(p => {
        const titleSlug = p.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
        return titleSlug.includes(urlSlug) || urlSlug.includes(titleSlug);
      });
    }
    
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json({ product: transformProduct(product) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── Midtrans Configuration ───────────────────────────────────
app.get('/api/midtrans/client-key', (req, res) => {
  res.json({ clientKey: MIDTRANS_CLIENT_KEY });
});

// ─── Midtrans Checkout ────────────────────────────────────────
app.post('/api/checkout', async (req, res) => {
  try {
    const { items, customer, shipping_cost } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ error: 'Keranjang kosong' });
    }

    if (!MIDTRANS_SERVER_KEY) {
      return res.status(500).json({ error: 'Midtrans belum dikonfigurasi. Tambahkan MIDTRANS_SERVER_KEY di .env' });
    }

    const orderId = 'PYS-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4).toUpperCase();

    const itemDetails = items.map(item => ({
      id: item.id,
      name: item.name.substring(0, 50), // Midtrans max 50 chars
      price: item.price,
      quantity: item.quantity,
    }));

    // Add shipping cost as an item if present
    if (shipping_cost && shipping_cost > 0) {
      itemDetails.push({
        id: 'SHIPPING',
        name: 'Ongkos Kirim',
        price: shipping_cost,
        quantity: 1,
      });
    }

    const grossAmount = itemDetails.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    const midtransPayload = {
      transaction_details: {
        order_id: orderId,
        gross_amount: grossAmount,
      },
      item_details: itemDetails,
      customer_details: {
        first_name: customer.name,
        email: customer.email,
        phone: customer.phone,
        shipping_address: {
          first_name: customer.name,
          phone: customer.phone,
          address: customer.address,
          city: customer.city,
          postal_code: customer.postal_code,
          country_code: 'IDN',
        },
      },
    };

    const midtransUrl = MIDTRANS_IS_PRODUCTION
      ? 'https://app.midtrans.com/snap/v1/transactions'
      : 'https://app.sandbox.midtrans.com/snap/v1/transactions';

    const authString = Buffer.from(MIDTRANS_SERVER_KEY + ':').toString('base64');

    const response = await fetch(midtransUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Basic ' + authString,
      },
      body: JSON.stringify(midtransPayload),
    });

    const data = await response.json();

    if (data.token) {
      res.json({ token: data.token, order_id: orderId });
    } else {
      console.error('[Midtrans] Error:', data);
      res.status(400).json({ error: data.error_messages?.join(', ') || 'Gagal membuat transaksi' });
    }
  } catch (error) {
    console.error('[Checkout] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ─── Midtrans Webhook (Notification) ──────────────────────────
app.post('/api/checkout/notification', async (req, res) => {
  try {
    const notification = req.body;
    console.log('[Midtrans Notification]', JSON.stringify(notification, null, 2));

    const orderId = notification.order_id;
    const transactionStatus = notification.transaction_status;
    const fraudStatus = notification.fraud_status;

    let status = 'unknown';
    if (transactionStatus === 'capture') {
      status = fraudStatus === 'accept' ? 'paid' : 'challenge';
    } else if (transactionStatus === 'settlement') {
      status = 'paid';
    } else if (transactionStatus === 'pending') {
      status = 'pending';
    } else if (['deny', 'cancel', 'expire'].includes(transactionStatus)) {
      status = 'failed';
    }

    console.log(`[Order ${orderId}] Status: ${status}`);
    // TODO: Save order status to database

    res.status(200).json({ status: 'ok' });
  } catch (error) {
    console.error('[Webhook] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ─── RajaOngkir API V2 Routes (Komerce) ───────────────────────
app.get('/api/shipping/provinces', async (req, res) => {
  try {
    if (!RAJAONGKIR_API_KEY) {
      return res.status(500).json({ error: 'RajaOngkir belum dikonfigurasi. Tambahkan RAJAONGKIR_API_KEY di .env' });
    }
    const response = await fetch(`${RAJAONGKIR_BASE_URL}/destination/province`, {
      headers: { 'Key': RAJAONGKIR_API_KEY },
    });
    const data = await response.json();
    // V2 format: { meta: {...}, data: [{ id, name }] }
    res.json(data.data || []);
  } catch (error) {
    console.error('[RajaOngkir] Province error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/shipping/cities', async (req, res) => {
  try {
    if (!RAJAONGKIR_API_KEY) {
      return res.status(500).json({ error: 'RajaOngkir belum dikonfigurasi' });
    }
    const provinceId = req.query.province;
    if (!provinceId) {
      return res.status(400).json({ error: 'Province ID diperlukan' });
    }
    // V2: province_id is in the URL path, not query param
    const response = await fetch(`${RAJAONGKIR_BASE_URL}/destination/city/${provinceId}`, {
      headers: { 'Key': RAJAONGKIR_API_KEY },
    });
    const data = await response.json();
    res.json(data.data || []);
  } catch (error) {
    console.error('[RajaOngkir] City error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/shipping/cost', async (req, res) => {
  try {
    if (!RAJAONGKIR_API_KEY) {
      return res.status(500).json({ error: 'RajaOngkir belum dikonfigurasi' });
    }
    const { destination, weight, courier } = req.body;

    // V2: endpoint is /calculate/district/domestic-cost
    const response = await fetch(`${RAJAONGKIR_BASE_URL}/calculate/district/domestic-cost`, {
      method: 'POST',
      headers: {
        'Key': RAJAONGKIR_API_KEY,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        origin: ORIGIN_DISTRICT_ID,
        destination: destination,
        weight: weight || 500,
        courier: courier || 'jne:sicepat:tiki:pos',
        price: 'lowest',
      }),
    });
    const data = await response.json();
    res.json(data.data || []);
  } catch (error) {
    console.error('[RajaOngkir] Cost error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// (Product route moved before static middleware above)

// ─── SPA-style fallback: serve index.html for directory paths ──
app.use((req, res, next) => {
  if (req.method !== 'GET') return next();
  if (req.path.startsWith('/api/')) return next();
  if (req.path.match(/\.(css|js|png|jpe?g|gif|webp|svg|woff2?|ttf|eot|ico|map|json)$/i)) return next();

  const tryPaths = [
    path.join(__dirname, 'public', req.path, 'index.html'),
    path.join(__dirname, 'public', req.path + '.html'),
  ];

  for (const p of tryPaths) {
    if (fs.existsSync(p)) {
      return res.sendFile(p);
    }
  }

  // If nothing found, serve 404
  res.status(404).send(`
    <!DOCTYPE html>
    <html><head><title>Page Not Found - Plan Your Skin</title>
    <style>
      body { font-family: 'Poppins', sans-serif; text-align: center; padding: 80px 20px; background: #fff; color: #333; }
      h1 { font-size: 4em; margin-bottom: 0; color: #222529; }
      p { font-size: 1.2em; color: #777; }
      a { color: #b93027; text-decoration: none; font-weight: 600; }
      a:hover { text-decoration: underline; }
    </style></head>
    <body>
      <h1>404</h1>
      <p>Halaman tidak ditemukan.</p>
      <p><a href="/">← Kembali ke Beranda</a> | <a href="/shop/">Lihat Produk</a></p>
    </body></html>
  `);
});

// ─── Start ─────────────────────────────────────────────────────
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`\n🌿 PlanYourSkin running at http://localhost:${PORT}`);
    console.log(`   Shopify: ${SHOPIFY_STORE}`);
    console.log(`   Midtrans: ${MIDTRANS_SERVER_KEY ? '✅ Configured' : '⚠️  Not configured (add to .env)'}`);
    console.log(`   RajaOngkir: ${RAJAONGKIR_API_KEY ? '✅ Configured' : '⚠️  Not configured (add to .env)'}\n`);

    // Pre-warm product cache
    fetchShopifyProducts();
  });
}

// Export for Vercel serverless
module.exports = app;
