const express = require('express');
const fetch = require('node-fetch');
const path = require('path');
const cheerio = require('cheerio');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Shopify credentials (from environment variables, .trim() to handle newline from CLI piping)
const SHOPIFY_STORE = (process.env.SHOPIFY_STORE || 'planyourskin.myshopify.com').trim();
const SHOPIFY_API_KEY = (process.env.SHOPIFY_API_KEY || '').trim();
const API_VERSION = '2024-01';

// Original site
const ORIGIN = 'https://planyourskin.com';

// Static files (must be before proxy)
app.use('/js', express.static(path.join(__dirname, 'public', 'js')));
app.use('/css', express.static(path.join(__dirname, 'public', 'css')));

// ─── Product Cache ─────────────────────────────────
let productCache = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000;

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
    console.log(`[Cache] Loaded ${productCache.length} products from Shopify`);
    return productCache;
  } catch (error) {
    console.error('Error fetching products:', error.message);
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

// ─── API Routes ────────────────────────────────────
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

// ─── Reverse Proxy ─────────────────────────────────
app.use(async (req, res) => {
  const targetUrl = ORIGIN + req.originalUrl;

  try {
    // Forward the request to the original site
    const headers = {
      'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0',
      'Accept': req.headers['accept'] || '*/*',
      'Accept-Language': req.headers['accept-language'] || 'en-US,en;q=0.9',
      'Referer': ORIGIN + '/',
    };

    // Forward cookies if any
    if (req.headers.cookie) {
      headers['Cookie'] = req.headers.cookie;
    }

    const response = await fetch(targetUrl, {
      headers,
      redirect: 'follow',
      compress: true,
    });

    // Copy response headers
    const contentType = response.headers.get('content-type') || '';
    res.status(response.status);

    // Forward relevant headers
    const headersToForward = [
      'content-type', 'cache-control', 'set-cookie', 'vary',
      'x-content-type-options', 'last-modified', 'etag',
    ];
    headersToForward.forEach(h => {
      const val = response.headers.get(h);
      if (val) res.setHeader(h, val);
    });

    // For HTML pages: rewrite links and inject our script
    if (contentType.includes('text/html')) {
      const html = await response.text();
      const $ = cheerio.load(html, { decodeEntities: false });

      // Helper: rewrite any planyourskin.com URL (absolute, protocol-relative) to relative
      const rewriteUrl = (url) => {
        if (!url) return url;
        return url.replace(/(https?:)?\/\/(www\.)?planyourskin\.com/g, '') || '/';
      };

      // 1. Rewrite all absolute links to planyourskin.com → relative
      $('a[href]').each((_, el) => {
        const href = $(el).attr('href');
        if (href && href.includes('planyourskin.com')) {
          $(el).attr('href', rewriteUrl(href));
        }
      });

      // 2. Rewrite form actions
      $('form[action]').each((_, el) => {
        const action = $(el).attr('action');
        if (action && action.includes('planyourskin.com')) {
          $(el).attr('action', rewriteUrl(action));
        }
      });

      // 2b. Rewrite ALL src/href/srcset/data-src attributes with planyourskin.com URLs
      $('[src], [href], [data-src], [data-lazy-src]').each((_, el) => {
        ['src', 'href', 'data-src', 'data-lazy-src'].forEach(attr => {
          const val = $(el).attr(attr);
          if (val && val.includes('planyourskin.com')) {
            $(el).attr(attr, rewriteUrl(val));
          }
        });
      });

      // 2c. Rewrite srcset attributes
      $('[srcset]').each((_, el) => {
        const srcset = $(el).attr('srcset');
        if (srcset && srcset.includes('planyourskin.com')) {
          $(el).attr('srcset', srcset.replace(/(https?:)?\/\/(www\.)?planyourskin\.com/g, ''));
        }
      });

      // 3. Inject Shopify config and our injector script before </body>
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
      if ($('body').length) {
        $('body').append(injectionHTML);
      }

      // 4. Remove WooCommerce cart/checkout AJAX scripts that would conflict
      // (We want to keep the visual elements but hijack the behavior)
      $('script').each((_, el) => {
        const src = $(el).attr('src') || '';
        const content = $(el).html() || '';
        // Block WooCommerce AJAX cart handlers
        if (src.includes('add-to-cart') && src.includes('.min.js')) {
          $(el).remove();
        }
        // Block WooCommerce cart fragments
        if (src.includes('cart-fragments')) {
          $(el).remove();
        }
      });
      // 5. Rewrite inline <style> blocks that may contain absolute font/image URLs
      $('style').each((_, el) => {
        let styleContent = $(el).html();
        if (styleContent && styleContent.includes('planyourskin.com')) {
          styleContent = styleContent.replace(/(https?:)?\/\/(www\.)?planyourskin\.com/g, '');
          $(el).html(styleContent);
        }
      });

      // 6. Rewrite ALL link tags (stylesheets, preloads, etc.)
      $('link[href]').each((_, el) => {
        const href = $(el).attr('href');
        if (href && href.includes('planyourskin.com')) {
          $(el).attr('href', rewriteUrl(href));
        }
      });

      // 7. Rewrite inline scripts that may contain absolute URLs
      $('script').each((_, el) => {
        const src = $(el).attr('src');
        if (src && src.includes('planyourskin.com')) {
          $(el).attr('src', rewriteUrl(src));
        }
        // Also rewrite inline script content
        let content = $(el).html();
        if (content && content.includes('planyourskin.com')) {
          content = content.replace(/(https?:)?\/\/(www\.)?planyourskin\.com/g, '');
          $(el).html(content);
        }
      });

      const modifiedHtml = $.html();
      res.removeHeader('content-length');
      res.send(modifiedHtml);

    } else if (contentType.includes('text/css')) {
      // For CSS: rewrite absolute planyourskin.com URLs to relative (so they go through our proxy)
      let css = await response.text();
      // Convert absolute + protocol-relative URLs → relative so fonts/images load through proxy
      css = css.replace(/(https?:)?\/\/(www\.)?planyourskin\.com/g, '');
      res.removeHeader('content-length');
      res.send(css);

    } else if (
      contentType.includes('font') ||
      req.originalUrl.match(/\.(woff2?|ttf|eot|otf)(\?|$)/i)
    ) {
      // For fonts: add CORS headers and serve
      const buffer = await response.buffer();
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET');
      if (!res.getHeader('content-type')) {
        if (req.originalUrl.includes('.woff2')) res.setHeader('content-type', 'font/woff2');
        else if (req.originalUrl.includes('.woff')) res.setHeader('content-type', 'font/woff');
        else if (req.originalUrl.includes('.ttf')) res.setHeader('content-type', 'font/ttf');
        else if (req.originalUrl.includes('.eot')) res.setHeader('content-type', 'application/vnd.ms-fontobject');
      }
      res.send(buffer);

    } else {
      // For all other resources (images, JS, etc.): stream as-is
      const buffer = await response.buffer();
      res.send(buffer);
    }

  } catch (error) {
    console.error(`[Proxy Error] ${req.originalUrl}:`, error.message);
    res.status(502).send(`Proxy Error: ${error.message}`);
  }
});

// ─── Start (only when running directly, not on Vercel) ─────────
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`\n🌿 PlanYourSkin Clone running at http://localhost:${PORT}`);
    console.log(`   Proxied: ${ORIGIN}`);
    console.log(`   Shopify: ${SHOPIFY_STORE}\n`);

    // Pre-warm product cache
    fetchShopifyProducts();
  });
}

// Export for Vercel serverless
module.exports = app;
