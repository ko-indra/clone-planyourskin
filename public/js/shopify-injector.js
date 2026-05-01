/**
 * ═══════════════════════════════════════════════════════════════
 * Local Cart Bridge — WooCommerce Legacy → PYSCart
 * ═══════════════════════════════════════════════════════════════
 * 
 * Intercepts legacy WooCommerce "Add to Cart" buttons and routes
 * them through our local PYSCart (localStorage-based cart).
 */

(function () {
  'use strict';

  // Prevent double initialization
  if (window.__LOCAL_CART_BRIDGE_LOADED__) return;
  window.__LOCAL_CART_BRIDGE_LOADED__ = true;

  let localProducts = [];
  let productMap = new Map();

  function normalize(str) {
    return (str || '').toLowerCase().trim()
      .replace(/\s+/g, ' ')
      .replace(/[^a-z0-9\s]/g, '');
  }

  // ─── Fetch Products ──────────────────────────────

  async function fetchLocalProducts() {
    try {
      const cached = sessionStorage.getItem('pys_products_cache');
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (parsed.length > 0) {
            localProducts = parsed;
            buildProductMap();
            return;
          }
        } catch (e) {}
      }

      const resp = await fetch('/api/products');
      const data = await resp.json();
      localProducts = data.products || [];
      
      if (localProducts.length > 0) {
        sessionStorage.setItem('pys_products_cache', JSON.stringify(localProducts));
      }
      buildProductMap();
    } catch (error) {
      console.error('[Cart Bridge] Error fetching products:', error);
    }
  }

  function buildProductMap() {
    localProducts.forEach(p => {
      productMap.set(normalize(p.title), p);
    });
  }

  // ─── Wait for PYSCart ────────────────────────────

  function waitForPYSCart(maxWait) {
    return new Promise((resolve) => {
      if (typeof PYSCart !== 'undefined') return resolve(true);
      const start = Date.now();
      const check = setInterval(() => {
        if (typeof PYSCart !== 'undefined') {
          clearInterval(check);
          resolve(true);
        } else if (Date.now() - start > maxWait) {
          clearInterval(check);
          resolve(false);
        }
      }, 100);
    });
  }

  // ─── Block WooCommerce AJAX ──────────────────────

  const origXHR = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, ...args) {
    if (typeof url === 'string' && (url.includes('wc-ajax') || url.includes('add-to-cart'))) {
      return;
    }
    return origXHR.apply(this, [method, url, ...args]);
  };

  // ─── Add to Cart handler ─────────────────────────

  function addProductToCart(productTitle, link) {
    const product = productMap.get(normalize(productTitle));

    if (product && typeof PYSCart !== 'undefined') {
      PYSCart.addItem(product, 1);
      
      // Success feedback
      const originalHTML = link.innerHTML;
      if (link.querySelector('i')) {
        link.innerHTML = '<i class="porto-icon-shopping-cart"></i> ✓ Added!';
      } else {
        link.textContent = '✓ Ditambahkan!';
      }
      link.style.pointerEvents = 'none';
      
      setTimeout(() => {
        link.innerHTML = originalHTML;
        link.style.pointerEvents = '';
      }, 1500);

      return true;
    }
    return false;
  }

  // ─── Extract product title from button ───────────

  function extractTitle(link) {
    // From aria-label: 'Add to cart: "Product Name"' (handles all quote types)
    const ariaLabel = link.getAttribute('aria-label') || '';
    if (ariaLabel) {
      // Strip "Add to cart:" prefix, then remove any surrounding quotes
      let title = ariaLabel.replace(/^add\s+to\s+cart\s*:\s*/i, '').trim();
      // Remove all types of quotes: straight ", curly "", guillemets, etc.
      title = title.replace(/^[\u0022\u0027\u2018\u2019\u201C\u201D\u00AB\u00BB\u2039\u203A]+/, '')
                    .replace(/[\u0022\u0027\u2018\u2019\u201C\u201D\u00AB\u00BB\u2039\u203A]+$/, '')
                    .trim();
      if (title) return title;
    }

    // From nearby product card elements (broader selectors for all page types)
    const card = link.closest('.product, .product-card, [class*="product"], .e-loop-item, .swiper-slide, .elementor-element');
    if (card) {
      const titleEl = card.querySelector(
        '.woocommerce-loop-product__title, .product-card-title, .product_title, .entry-title, ' +
        '[class*="product-title"], [class*="product_title"], ' +
        'h2 a, h3 a, h2, h3, p.product_title'
      );
      if (titleEl) return titleEl.textContent.trim();
    }

    return '';
  }

  // ─── Intercept clicks ────────────────────────────

  function interceptClicks() {
    document.addEventListener('click', async (e) => {
      const link = e.target.closest(
        'a.add_to_cart_button, a[href*="add-to-cart"], .single_add_to_cart_button, a.porto-tb-addcart'
      );
      if (!link) return;

      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      const title = extractTitle(link);
      if (!title) {
        console.warn('[Cart Bridge] No title found for button');
        return;
      }

      // Wait for PYSCart if not ready yet
      if (typeof PYSCart === 'undefined') {
        link.style.opacity = '0.5';
        await waitForPYSCart(3000);
        link.style.opacity = '';
      }

      // Wait for products if not loaded
      if (localProducts.length === 0) {
        await fetchLocalProducts();
      }

      const success = addProductToCart(title, link);
      if (!success) {
        console.warn('[Cart Bridge] Product not found:', title);
        // Fallback: go to product page
        const handle = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        window.location.href = '/product/' + handle;
      }
    }, true); // capture phase
  }

  // ─── Redirect cart/checkout links ────────────────

  function interceptNavigation() {
    document.addEventListener('click', (e) => {
      const link = e.target.closest('a');
      if (!link) return;
      const href = link.getAttribute('href') || '';

      if (href.includes('myshopify.com/cart')) {
        e.preventDefault();
        window.location.href = '/cart/';
      } else if (href.includes('myshopify.com/checkout')) {
        e.preventDefault();
        window.location.href = '/checkout/';
      }
    });
  }

  // ─── Initialize ──────────────────────────────────

  async function init() {
    console.log('[Cart Bridge] Initializing...');
    interceptClicks();
    interceptNavigation();
    await fetchLocalProducts();
    console.log('[Cart Bridge] ✅ Ready (' + localProducts.length + ' products)');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
