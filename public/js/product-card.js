(function () {
  'use strict';

  if (window.PYSProductCard) return;

  function ensureStyles() {
    if (document.querySelector('link[href="/css/pys-product-card.css"]')) return;
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/css/pys-product-card.css';
    document.head.appendChild(link);
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escapeAttr(value) {
    return escapeHtml(value);
  }

  function formatRp(value) {
    var num = parseFloat(value);
    if (isNaN(num)) return '0';
    return num.toLocaleString('id-ID', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
  }

  function getImage(product, index) {
    if (index === 0 && product.image) return product.image;
    return product.images && product.images[index] && product.images[index].src
      ? product.images[index].src
      : '';
  }

  function getDiscount(product) {
    var price = parseFloat(product.price);
    var compare = parseFloat(product.compare_at_price);
    if (!compare || !price || compare <= price) return 0;
    return Math.round((1 - price / compare) * 100);
  }

  function slugify(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }

  function addToCart(handle) {
    if (typeof window.addToCartFromCard === 'function') {
      window.addToCartFromCard(handle);
      return;
    }

    window.dispatchEvent(new CustomEvent('pys:add-to-cart', {
      detail: { handle: handle }
    }));
  }

  function priceHtml(product) {
    var discount = getDiscount(product);
    var current = '<span class="woocommerce-Price-amount amount"><bdi><span class="woocommerce-Price-currencySymbol">Rp</span>' +
      formatRp(product.price) +
      '</bdi></span>';

    if (!discount) {
      return '<span class="price">' + current + '</span>';
    }

    var original = '<span class="woocommerce-Price-amount amount"><bdi><span class="woocommerce-Price-currencySymbol">Rp</span>' +
      formatRp(product.compare_at_price) +
      '</bdi></span>';

    return '<span class="price">' +
      '<del aria-hidden="true">' + original + '</del> ' +
      '<span class="screen-reader-text">Original price was: Rp' + formatRp(product.compare_at_price) + '.</span>' +
      '<ins aria-hidden="true">' + current + '</ins>' +
      '<span class="screen-reader-text">Current price is: Rp' + formatRp(product.price) + '.</span>' +
      '</span>';
  }

  function render(product) {
    ensureStyles();

    var title = escapeHtml(product.title || '');
    var titleAttr = escapeAttr(product.title || '');
    var handle = escapeAttr(product.handle || '');
    var productUrl = '/product/' + handle + '/';
    var category = product.product_type || 'Skincare';
    var categoryHtml = escapeHtml(category);
    var categorySlug = slugify(category);
    var mainImg = escapeAttr(getImage(product, 0));
    var hoverImg = escapeAttr(getImage(product, 1));
    var discount = getDiscount(product);

    return '' +
      '<div class="porto-tb-item product product-col instock ' + (discount ? 'sale ' : '') + 'taxable shipping-taxable purchasable product-type-simple pys-product-card-shell" data-handle="' + handle + '">' +
        '<div class="porto-section product-type-advanced p-0">' +
          '<div class="porto-tb-featured-image tb-image-type-hover product-image porto-gb-3172d9f7080eaf7ce4ee603450eaff13" data-title="' + titleAttr + '">' +
            (discount ? '<div class="labels"><div class="onsale">-' + discount + '%</div></div>' : '') +
            '<a aria-label="post featured image" href="' + productUrl + '" class="img-thumbnail">' +
              '<img src="' + mainImg + '" loading="lazy" width="300" height="300" class="img-responsive" alt="' + titleAttr + '" decoding="async">' +
              (hoverImg ? '<img src="' + hoverImg + '" loading="lazy" width="300" height="300" class="img-responsive hover-image" alt="" decoding="async">' : '') +
            '</a>' +
            '<div class="tb-hover-content with-link">' +
              '<a aria-label="post content" href="' + productUrl + '" class="porto-tb-link"></a>' +
              '<a title="Add to cart" href="#" data-product-handle="' + handle + '" onclick="event.preventDefault();event.stopPropagation();PYSProductCard.addToCart(\'' + handle + '\');" class="porto-tb-woo-link porto-tb-icon-left no-tooltip d-none d-sm-flex justify-content-center align-items-center cs-bottom porto-tb-addcart product_type_simple add_to_cart_button" aria-label="Add to cart: &quot;' + titleAttr + '&quot;" rel="nofollow"><i class="porto-icon-shopping-cart"></i>Add to cart</a>' +
            '</div>' +
          '</div>' +
          '<div class="porto-section product-content m-0 porto-gb-84f638dc4fa0a1e503997126ad3e73a1">' +
            '<span class="porto-tb-meta tb-meta-product_cat text-truncate d-block porto-gb-c1d7588732ae1cb92c819504ec40584d"><a href="/product-category/skincare/' + categorySlug + '/" rel="tag">' + categoryHtml + '</a>, <a href="/product-category/skincare/" rel="tag">Skincare</a></span>' +
            '<h3 class="porto-heading porto-gb-deca2c9b8ead905f0634da90b723739a post-title" style=""><a aria-label="Post Title" href="' + productUrl + '">' + title + '</a></h3>' +
            '<div class="porto-tb-woo-rating porto-gb-b00e1b7353a2782ff28d0f023f576c2a">' +
              '<div class="rating-content"><div class="star-rating" title="0"><span style="width:0%"><strong class="rating">0</strong> out of 5</span></div></div>' +
            '</div>' +
            '<div class="tb-woo-price porto-gb-8e3470c6224b098bb08318f8978e311d">' +
              priceHtml(product) +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';
  }

  window.PYSProductCard = {
    render: render,
    addToCart: addToCart,
    ensureStyles: ensureStyles,
  };

  ensureStyles();
})();
