/**
 * Dynamic Product Grid — replaces hardcoded WooCommerce grids with live Shopify data.
 *
 * Server-side middleware inserts <div class="... pys-dynamic-grid" data-pys-filter="...">
 * placeholders into list pages. This script fetches /api/products, applies the filter,
 * and renders Porto-style cards into each placeholder.
 */
(function () {
  'use strict';

  if (window.__PYS_DYNAMIC_GRID_LOADED__) return;
  window.__PYS_DYNAMIC_GRID_LOADED__ = true;

  let _productsPromise = null;

  function getProducts() {
    if (_productsPromise) return _productsPromise;
    _productsPromise = (async () => {
      try {
        const cached = sessionStorage.getItem('pys_products_cache');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length) return parsed;
        }
      } catch (e) {}
      try {
        const r = await fetch('/api/products');
        const j = await r.json();
        const products = j.products || [];
        try { sessionStorage.setItem('pys_products_cache', JSON.stringify(products)); } catch (e) {}
        return products;
      } catch (e) {
        console.error('[Dynamic Grid] fetch failed', e);
        return [];
      }
    })();
    return _productsPromise;
  }

  function applyFilter(products, spec) {
    if (!spec || spec === 'all') return products;
    const colon = spec.indexOf(':');
    const key = colon === -1 ? spec : spec.slice(0, colon);
    const value = colon === -1 ? '' : spec.slice(colon + 1);
    const v = value.toLowerCase().trim();

    switch (key) {
      case 'type':
        return products.filter(p => (p.product_type || '').toLowerCase() === v);
      case 'vendor':
        return products.filter(p => (p.vendor || '').toLowerCase() === v);
      case 'tag':
        return products.filter(p => (p.tags || '').toLowerCase().split(',').map(s => s.trim()).includes(v));
      case 'not-type':
        return products.filter(p => (p.product_type || '').toLowerCase() !== v);
      default:
        return products;
    }
  }

  function fmtRp(value) {
    const n = parseFloat(value);
    if (isNaN(n)) return 'Rp 0';
    return n.toLocaleString('id-ID');
  }

  function escapeAttr(s) {
    return String(s || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function renderCard(p) {
    if (window.PYSProductCard) {
      return window.PYSProductCard.render(p);
    }

    const main = p.image || (p.images && p.images[0] && p.images[0].src) || '';
    const hover = (p.images && p.images[1] && p.images[1].src) || '';
    const hasDiscount = p.compare_at_price && parseFloat(p.compare_at_price) > parseFloat(p.price);
    const discount = hasDiscount ? Math.round((1 - parseFloat(p.price) / parseFloat(p.compare_at_price)) * 100) : 0;
    const cat = p.product_type || 'Skincare';
    const catSlug = cat.toLowerCase().replace(/\s+/g, '-');
    const titleAttr = escapeAttr(p.title);

    let priceHtml;
    if (hasDiscount) {
      priceHtml =
        '<del aria-hidden="true"><span class="woocommerce-Price-amount amount"><bdi><span class="woocommerce-Price-currencySymbol">Rp</span>' +
        fmtRp(p.compare_at_price) +
        '</bdi></span></del> <ins aria-hidden="true"><span class="woocommerce-Price-amount amount"><bdi><span class="woocommerce-Price-currencySymbol">Rp</span>' +
        fmtRp(p.price) +
        '</bdi></span></ins>';
    } else {
      priceHtml =
        '<span class="woocommerce-Price-amount amount"><bdi><span class="woocommerce-Price-currencySymbol">Rp</span>' +
        fmtRp(p.price) +
        '</bdi></span>';
    }

    return (
      '<div class="porto-tb-item product product-col instock sale taxable shipping-taxable purchasable product-type-simple">' +
        '<div class="porto-section product-type-advanced p-0">' +
          '<div class="porto-tb-featured-image tb-image-type-hover product-image" data-title="' + titleAttr + '">' +
            (hasDiscount ? '<div class="labels"><div class="onsale">-' + discount + '%</div></div>' : '') +
            '<a aria-label="post featured image" href="/product/' + p.handle + '/" class="img-thumbnail">' +
              '<img src="' + main + '" loading="lazy" class="img-responsive" alt="' + titleAttr + '">' +
              (hover ? '<img src="' + hover + '" loading="lazy" class="img-responsive hover-image" alt="">' : '') +
            '</a>' +
            '<div class="tb-hover-content with-link">' +
              '<a aria-label="post content" href="/product/' + p.handle + '/" class="porto-tb-link"></a>' +
              '<a title="Add to cart" href="#" data-product-handle="' + p.handle + '" class="porto-tb-woo-link porto-tb-icon-left no-tooltip d-none d-sm-flex justify-content-center align-items-center cs-bottom porto-tb-addcart product_type_simple add_to_cart_button" aria-label=\'Add to cart: "' + titleAttr + '"\' rel="nofollow"><i class="porto-icon-shopping-cart"></i>Add to cart</a>' +
            '</div>' +
          '</div>' +
          '<div class="porto-section product-content m-0">' +
            '<span class="porto-tb-meta tb-meta-product_cat text-truncate d-block"><a href="/product-category/skincare/' + catSlug + '/" rel="tag">' + cat + '</a></span>' +
            '<h3 class="porto-heading post-title"><a aria-label="Post Title" href="/product/' + p.handle + '/">' + p.title + '</a></h3>' +
            '<div class="tb-woo-price"><span class="price">' + priceHtml + '</span></div>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
  }

  async function hydrate() {
    const placeholders = document.querySelectorAll('.pys-dynamic-grid');
    if (!placeholders.length) return;
    const products = await getProducts();

    placeholders.forEach(el => {
      const filter = el.getAttribute('data-pys-filter') || 'all';
      const limit = parseInt(el.getAttribute('data-pys-limit') || '0', 10);
      let filtered = applyFilter(products, filter);
      if (limit > 0) filtered = filtered.slice(0, limit);

      if (!filtered.length) {
        el.innerHTML = '<p style="text-align:center;color:#999;padding:40px 0;width:100%;">Tidak ada produk dalam kategori ini.</p>';
        return;
      }
      el.innerHTML = filtered.map(renderCard).join('');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', hydrate);
  } else {
    hydrate();
  }
})();
