/**
 * sync-to-shopify.js
 * Sync planyourskin.com (WooCommerce) catalog into our Shopify store.
 *  - Backup all current Shopify products
 *  - Update 21 matched products (title, body_html, price, compare, type, tags, images)
 *  - Create 10 new products from PYS that don't exist yet
 *
 * Source data: sync-data.json (built by the discovery step)
 */

require('dotenv').config();
const fetch = require('node-fetch');
const fs = require('fs');

const STORE = (process.env.SHOPIFY_STORE || '').trim();
const KEY   = (process.env.SHOPIFY_API_KEY || '').trim();
const V     = '2024-01';

if (!STORE || !KEY) { console.error('Missing SHOPIFY_STORE / SHOPIFY_API_KEY'); process.exit(1); }

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function shopify(method, path, body) {
  const r = await fetch(`https://${STORE}/admin/api/${V}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': KEY },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Shopify ${method} ${path} → ${r.status}: ${text.slice(0,400)}`);
  return text ? JSON.parse(text) : {};
}

const decodeEntities = s => (s || '')
  .replace(/&#038;/g, '&').replace(/&amp;/g, '&')
  .replace(/&#8217;/g, "'").replace(/&#8211;/g, '–').replace(/&#8212;/g, '—')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ');

// Map PYS categories -> a single Shopify product_type
function deriveType(catNames) {
  const specific = catNames.filter(c => c !== 'Skincare' && c !== 'Plan Your Skin');
  if (specific.length === 0) return 'Skincare';
  if (specific.length >= 2) return 'Bundle';
  const c = specific[0];
  if (c === 'Cleansing Serum') return 'Cleanser';
  if (c === 'Serums')          return 'Serum';
  return c; // Moisturizer | Sunscreen | …
}

function buildShopifyPayload(pys, { keepHandle, existingVariantId } = {}) {
  const cats   = (pys.categories || []).map(c => decodeEntities(c.name));
  const title  = decodeEntities(pys.name);
  const type   = deriveType(cats);
  const tags   = [...new Set(['Plan Your Skin', ...cats])].join(', ');
  const images = (pys.images || []).map(img => ({
    src: img.src,
    alt: decodeEntities(img.alt || img.name || title),
  }));

  const minor   = pys.prices?.currency_minor_unit ?? 0;
  const div     = Math.pow(10, minor);
  const sale    = pys.prices?.sale_price    ? parseInt(pys.prices.sale_price)    / div : null;
  const regular = pys.prices?.regular_price ? parseInt(pys.prices.regular_price) / div : null;
  const onSale  = sale != null && regular != null && sale < regular;
  const price   = (sale != null ? sale : regular) ?? 0;
  const compare = onSale ? regular : null;

  const variant = {
    price: String(price),
    compare_at_price: compare != null ? String(compare) : null,
    sku: pys.sku || '',
  };
  if (existingVariantId) variant.id = existingVariantId;

  const payload = {
    title,
    body_html: pys.description || pys.short_description || '',
    vendor: 'Plan Your Skin',
    product_type: type,
    tags,
    status: 'active',
    images,
    variants: [variant],
  };
  if (!keepHandle && pys.slug) payload.handle = pys.slug;
  return payload;
}

// Same matching logic used in discovery, deduped (PYS->Shopify is 1:1, highest score wins).
function buildMatchPlan(pysList, shopifyList) {
  const norm = s => decodeEntities(s||'').toLowerCase()
    .replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
  const tokens = s => new Set(norm(s).split(' ').filter(w => w.length > 3));

  const candidates = pysList.map(p => {
    let best = null, bestScore = 0;
    const pSet = tokens(p.name);
    for (const s of shopifyList) {
      const sSet = tokens(s.title);
      const inter = [...pSet].filter(w => sSet.has(w)).length;
      const union = new Set([...pSet, ...sSet]).size;
      const score = union ? inter / union : 0;
      if (score > bestScore) { bestScore = score; best = s; }
    }
    return { pys: p, match: best, score: bestScore };
  });

  // Dedupe: each Shopify product can only match one PYS (highest score wins)
  const used = new Map();
  candidates.sort((a,b) => b.score - a.score);
  for (const c of candidates) {
    if (!c.match) continue;
    if (used.has(c.match.id)) {
      c.match = null; c.score = 0;
    } else if (c.score >= 0.4) {
      used.set(c.match.id, c);
    } else {
      c.match = null; c.score = 0;
    }
  }
  return candidates;
}

async function main() {
  console.log('=== sync-to-shopify ===');
  console.log('Store:', STORE);

  // 1. Load PYS data
  const data = JSON.parse(fs.readFileSync('sync-data.json', 'utf8'));
  const pysList = data.pys;
  console.log('PYS products loaded:', pysList.length);

  // 2. Fetch fresh Shopify state (don't trust cached sync-data.json)
  const fresh = await shopify('GET', '/products.json?limit=250&status=active');
  const shopifyList = fresh.products || [];
  console.log('Shopify products fetched:', shopifyList.length);

  // 3. Backup
  const ts = new Date().toISOString().replace(/[:.]/g,'-');
  const backupPath = `shopify-backup-${ts}.json`;
  fs.writeFileSync(backupPath, JSON.stringify(fresh, null, 2));
  console.log(`✓ Backup written: ${backupPath}`);

  // 4. Match
  const plan = buildMatchPlan(pysList, shopifyList);
  const updates = plan.filter(c => c.match);
  const creates = plan.filter(c => !c.match);
  console.log(`Plan: ${updates.length} updates, ${creates.length} creates\n`);

  let okU=0, failU=0, okC=0, failC=0;

  // 5. Updates
  console.log('── UPDATING 21 matched products ──');
  for (const { pys, match, score } of updates) {
    const variantId = match.variants?.[0]?.id;
    const payload = buildShopifyPayload(pys, { keepHandle: true, existingVariantId: variantId });
    delete payload.handle; // never change existing handles
    try {
      await shopify('PUT', `/products/${match.id}.json`, { product: payload });
      console.log(`  ✓ [${match.id}] ${payload.title}  (score ${score.toFixed(2)})`);
      okU++;
    } catch (e) {
      console.error(`  ✗ [${match.id}] ${payload.title}: ${e.message}`);
      failU++;
    }
    await sleep(600);
  }

  // 6. Creates
  console.log('\n── CREATING 10 new products ──');
  for (const { pys } of creates) {
    const payload = buildShopifyPayload(pys, { keepHandle: false });
    try {
      const res = await shopify('POST', `/products.json`, { product: payload });
      const id = res.product?.id; const handle = res.product?.handle;
      console.log(`  ✓ [${id}] ${payload.title}  (handle=${handle})`);
      okC++;
    } catch (e) {
      console.error(`  ✗ ${payload.title}: ${e.message}`);
      failC++;
    }
    await sleep(600);
  }

  console.log('\n=== SUMMARY ===');
  console.log(`Updates: ${okU} ok, ${failU} failed`);
  console.log(`Creates: ${okC} ok, ${failC} failed`);
  console.log(`Backup : ${backupPath}`);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
