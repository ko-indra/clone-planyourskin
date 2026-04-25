const express = require('express');
const fetch = require('node-fetch');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Shopify credentials
const SHOPIFY_STORE = (process.env.SHOPIFY_STORE || 'planyourskin.myshopify.com').trim();
const SHOPIFY_API_KEY = (process.env.SHOPIFY_API_KEY || '').trim();
const API_VERSION = '2024-01';

// ─── Static files ONLY (100% local, NO proxy) ─────────────────
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '1h',
  extensions: ['html'],  // allows /best-seller to match /best-seller/index.html
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
    const product = products.find(p => p.handle === req.params.handle);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json({ product: transformProduct(product) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── SPA-style fallback: serve index.html for directory paths ──
// This handles /best-seller, /about-us, /shop/?filter=... etc.
app.use((req, res, next) => {
  // Only for non-asset, non-API GET requests
  if (req.method !== 'GET') return next();
  if (req.path.startsWith('/api/')) return next();
  if (req.path.match(/\.(css|js|png|jpe?g|gif|webp|svg|woff2?|ttf|eot|ico|map)$/i)) return next();

  // Try to find an index.html in the requested path
  const tryPaths = [
    path.join(__dirname, 'public', req.path, 'index.html'),
    path.join(__dirname, 'public', req.path + '.html'),
  ];

  for (const p of tryPaths) {
    if (require('fs').existsSync(p)) {
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
    console.log(`   Mode: 100% Static (NO proxy to planyourskin.com)`);
    console.log(`   Shopify: ${SHOPIFY_STORE}\n`);

    // Pre-warm product cache
    fetchShopifyProducts();
  });
}

// Export for Vercel serverless
module.exports = app;
