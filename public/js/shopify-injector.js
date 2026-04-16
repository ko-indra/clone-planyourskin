/**
 * ═══════════════════════════════════════════════════════════════
 * Shopify Injector — Seamless WooCommerce → Shopify Bridge
 * ═══════════════════════════════════════════════════════════════
 * 
 * This script runs on the proxied planyourskin.com pages and:
 * 1. Fetches product data from our Shopify store via /api/products
 * 2. Replaces WooCommerce prices with Shopify prices
 * 3. Hijacks "Add to Cart" buttons to add to Shopify cart
 * 4. Redirects cart/checkout links to Shopify checkout
 * 5. Intercepts WooCommerce AJAX to prevent original store actions
 */

(function () {
  'use strict';

  const SHOPIFY_STORE_URL = window.__SHOPIFY_CONFIG__?.storeUrl || 'https://planyourskin.myshopify.com';
  let shopifyProducts = [];
  let productMap = new Map(); // title (normalized) → product

  // ─── Utility Functions ───────────────────────────

  function normalize(str) {
    return (str || '').toLowerCase().trim()
      .replace(/\s+/g, ' ')
      .replace(/[^a-z0-9\s]/g, '');
  }

  function formatRupiah(price) {
    const num = parseInt(price) || 0;
    return 'Rp' + num.toLocaleString('id-ID');
  }

  function findShopifyProduct(title) {
    if (!title) return null;
    const norm = normalize(title);

    // Exact match first
    if (productMap.has(norm)) return productMap.get(norm);

    // Contains match — only for substantial strings (>15 chars) to avoid false positives
    for (const [key, product] of productMap) {
      if (key.length >= 15 && norm.length >= 15) {
        if (norm.includes(key) || key.includes(norm)) return product;
      }
    }

    // Word overlap match — require at least 60% overlap AND minimum 2 matching words
    const titleWords = norm.split(' ').filter(w => w.length > 2);
    let bestMatch = null;
    let bestScore = 0;

    for (const [key, product] of productMap) {
      const keyWords = key.split(' ').filter(w => w.length > 2);
      const overlap = titleWords.filter(w => keyWords.includes(w)).length;
      if (overlap < 2) continue; // Need at least 2 matching words
      const score = overlap / Math.max(titleWords.length, keyWords.length);
      if (score > bestScore && score >= 0.6) {
        bestScore = score;
        bestMatch = product;
      }
    }

    return bestMatch;
  }

  function getFirstVariantId(product) {
    return product?.variants?.[0]?.id;
  }

  // ─── Block WooCommerce AJAX ──────────────────────

  function blockWooCommerceAjax() {
    // Override WooCommerce's AJAX add-to-cart
    if (window.jQuery) {
      jQuery(document).off('click', '.add_to_cart_button');
      jQuery(document.body).off('adding_to_cart');
      jQuery(document.body).off('added_to_cart');
    }

    // Intercept XMLHttpRequest to block WooCommerce cart operations
    const origOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
      if (typeof url === 'string' && (
        url.includes('wc-ajax=add_to_cart') ||
        url.includes('wc-ajax=get_refreshed_fragments') ||
        url.includes('?add-to-cart=')
      )) {
        console.log('[Shopify Injector] Blocked WooCommerce AJAX:', url);
        // Return a dummy – don't actually send
        this._blocked = true;
        return;
      }
      return origOpen.call(this, method, url, ...rest);
    };

    const origSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function (...args) {
      if (this._blocked) return;
      return origSend.apply(this, args);
    };
  }

  // ─── Redirect Cart/Checkout Links ────────────────

  function hijackCartCheckoutLinks() {
    // Replace cart & checkout links with Shopify URLs
    document.querySelectorAll('a[href]').forEach(link => {
      const href = link.getAttribute('href') || '';

      // Cart page links
      if (href === '/cart/' || href === '/cart' || href.endsWith('/cart/')) {
        link.href = SHOPIFY_STORE_URL + '/cart';
        link.target = '_blank';
      }

      // Checkout links
      if (href.includes('/checkout') || href === '/checkout/' || href === '/checkout') {
        link.href = SHOPIFY_STORE_URL + '/checkout';
        link.target = '_blank';
      }

      // WooCommerce add-to-cart links (e.g., ?add-to-cart=123)
      if (href.includes('add-to-cart=')) {
        link.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          handleAddToCartClick(link);
        }, true);
      }
    });
  }

  // ─── Handle Add to Cart Click ────────────────────

  function handleAddToCartClick(element) {
    // Find the parent product container
    const card = element.closest('.product, .product-item, li.product, .type-product, [class*="product"]');
    if (!card) {
      console.warn('[Shopify Injector] Could not find product card');
      return;
    }

    // Get title
    const titleEl = card.querySelector(
      '.woocommerce-loop-product__title, .product_title, h2, h3, .product-title'
    );
    const title = titleEl?.textContent?.trim();
    const sp = findShopifyProduct(title);

    if (sp && sp.variants?.[0]) {
      const variantId = sp.variants[0].id;
      const qty = 1;
      const checkoutUrl = `${SHOPIFY_STORE_URL}/cart/${variantId}:${qty}`;

      // Visual feedback
      const btn = element.closest('.add_to_cart_button') || element;
      const originalText = btn.textContent;
      btn.textContent = 'Redirecting...';
      btn.style.opacity = '0.7';

      window.open(checkoutUrl, '_blank');

      setTimeout(() => {
        btn.textContent = originalText;
        btn.style.opacity = '1';
      }, 1500);
    } else {
      console.warn('[Shopify Injector] Product not found in Shopify:', title);
      // Fallback: open shop
      window.open(SHOPIFY_STORE_URL + '/collections/all', '_blank');
    }
  }

  // ─── Process Homepage Product Cards ──────────────

  function processProductCards() {
    // Select all product cards (WooCommerce uses these classes)
    const cards = document.querySelectorAll(
      '.product.type-product, li.product, .products .product'
    );

    cards.forEach(card => {
      // Find the title
      const titleEl = card.querySelector(
        '.woocommerce-loop-product__title, h2.woocommerce-loop-product__title, .product-title, h2 a, h3 a'
      );
      if (!titleEl) return;

      const title = titleEl.textContent?.trim();
      const sp = findShopifyProduct(title);
      if (!sp) return;

      // Update Price
      const priceEl = card.querySelector('.price');
      if (priceEl && sp.price) {
        updatePriceElement(priceEl, sp);
      }

      // Hijack Add to Cart button
      const addToCartBtns = card.querySelectorAll(
        '.add_to_cart_button, a.button.product_type_simple, a[href*="add-to-cart"]'
      );
      addToCartBtns.forEach(btn => {
        btn.classList.remove('ajax_add_to_cart');
        btn.removeAttribute('data-product_id');
        btn.removeAttribute('data-product_sku');

        // Clone to remove all event listeners
        const newBtn = btn.cloneNode(true);
        btn.parentNode?.replaceChild(newBtn, btn);

        newBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();

          if (sp.variants?.[0]) {
            const url = `${SHOPIFY_STORE_URL}/cart/${sp.variants[0].id}:1`;
            newBtn.textContent = 'Redirecting...';
            window.open(url, '_blank');
            setTimeout(() => { newBtn.textContent = 'Add to cart'; }, 1500);
          }
        }, true);
      });
    });
  }

  // ─── Process Single Product Page ─────────────────

  function processSingleProductPage() {
    const isSingle = document.body.classList.contains('single-product') ||
      document.querySelector('.single-product') ||
      document.querySelector('.product_title.entry-title');

    if (!isSingle) return;

    const mainTitle = document.querySelector('.product_title.entry-title, h1.product_title');
    if (!mainTitle) return;

    const title = mainTitle.textContent?.trim();
    const sp = findShopifyProduct(title);
    if (!sp) {
      console.warn('[Shopify Injector] Single product not found in Shopify:', title);
      return;
    }

    console.log('[Shopify Injector] Matched single product:', sp.title);

    // Update price in summary
    const priceEl = document.querySelector('.summary .price, .product-info .price, .entry-summary .price');
    if (priceEl && sp.price) {
      updatePriceElement(priceEl, sp);
    }

    // Hijack the Add to Cart form
    const form = document.querySelector('form.cart');
    if (form) {
      // Prevent default form submission
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        e.stopPropagation();

        const qty = form.querySelector('input.qty')?.value || 1;
        if (sp.variants?.[0]) {
          const url = `${SHOPIFY_STORE_URL}/cart/${sp.variants[0].id}:${qty}`;
          window.open(url, '_blank');
        }
      }, true);

      // Also hijack the submit button directly
      const submitBtn = form.querySelector('button[type="submit"], .single_add_to_cart_button');
      if (submitBtn) {
        const newBtn = submitBtn.cloneNode(true);
        submitBtn.parentNode?.replaceChild(newBtn, submitBtn);

        newBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();

          const qty = form.querySelector('input.qty')?.value || 1;
          if (sp.variants?.[0]) {
            const url = `${SHOPIFY_STORE_URL}/cart/${sp.variants[0].id}:${qty}`;
            const origText = newBtn.textContent;
            newBtn.textContent = 'Redirecting to checkout...';
            newBtn.style.opacity = '0.7';
            window.open(url, '_blank');
            setTimeout(() => {
              newBtn.textContent = origText;
              newBtn.style.opacity = '1';
            }, 2000);
          }
        }, true);
      }
    }

    // Also handle if there's a standalone button (no form)
    const standaloneAddBtn = document.querySelector(
      '.summary .single_add_to_cart_button:not(form .single_add_to_cart_button)'
    );
    if (standaloneAddBtn && sp.variants?.[0]) {
      standaloneAddBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const url = `${SHOPIFY_STORE_URL}/cart/${sp.variants[0].id}:1`;
        window.open(url, '_blank');
      }, true);
    }
  }

  // ─── Update Price Element ────────────────────────

  function updatePriceElement(priceEl, product) {
    const price = parseInt(product.price) || 0;
    const comparePrice = parseInt(product.compare_at_price) || 0;
    const formattedPrice = formatRupiah(price);

    if (comparePrice > price) {
      const formattedCompare = formatRupiah(comparePrice);
      priceEl.innerHTML = `
        <del aria-hidden="true">
          <span class="woocommerce-Price-amount amount">
            <bdi><span class="woocommerce-Price-currencySymbol">Rp</span>${comparePrice.toLocaleString('id-ID')}</bdi>
          </span>
        </del>
        <ins>
          <span class="woocommerce-Price-amount amount">
            <bdi><span class="woocommerce-Price-currencySymbol">Rp</span>${price.toLocaleString('id-ID')}</bdi>
          </span>
        </ins>
      `;
    } else {
      priceEl.innerHTML = `
        <span class="woocommerce-Price-amount amount">
          <bdi><span class="woocommerce-Price-currencySymbol">Rp</span>${price.toLocaleString('id-ID')}</bdi>
        </span>
      `;
    }
  }

  // ─── Hijack WooCommerce Wishlist Links ───────────

  function hijackWishlistLinks() {
    document.querySelectorAll('a[href*="add_to_wishlist"]').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        // Could implement Shopify wishlist logic here
        // For now, show a nice feedback
        const origText = link.textContent;
        link.textContent = '♥';
        link.style.color = '#e74c3c';
        setTimeout(() => {
          link.textContent = origText;
        }, 2000);
      });
    });
  }

  // ─── Initialize ──────────────────────────────────

  async function init() {
    console.log('[Shopify Injector] Initializing...');

    try {
      // 1. Fetch products from our API
      const response = await fetch('/api/products');
      const data = await response.json();
      shopifyProducts = data.products || [];

      console.log(`[Shopify Injector] Loaded ${shopifyProducts.length} products`);

      // 2. Build product map for fast title lookup
      shopifyProducts.forEach(p => {
        const key = normalize(p.title);
        productMap.set(key, p);
      });

      // 3. Block WooCommerce AJAX
      blockWooCommerceAjax();

      // 4. Process all product cards on the page
      processProductCards();

      // 5. Process single product page if applicable
      processSingleProductPage();

      // 6. Hijack cart/checkout navigation links
      hijackCartCheckoutLinks();

      // 7. Handle wishlist links
      hijackWishlistLinks();

      console.log('[Shopify Injector] ✅ Injection complete');

    } catch (error) {
      console.error('[Shopify Injector] ❌ Error:', error);
    }
  }

  // Wait for DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    // DOM already loaded, run after a short delay to ensure WooCommerce scripts are loaded
    setTimeout(init, 500);
  }

})();
