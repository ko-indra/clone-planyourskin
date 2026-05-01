/* ============================================
   Plan Your Skin — Product Detail Page JS
   ============================================ */

let currentProduct = null;

// Toast notification for cart feedback
function showCartToast(productTitle, qty) {
  // Remove existing toast
  const existing = document.getElementById('cartToast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'cartToast';
  toast.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;">
      <span style="font-size:20px;">🛒</span>
      <div>
        <strong style="color:#222;font-size:14px;">${qty}x ${productTitle}</strong>
        <p style="margin:4px 0 0;font-size:12px;color:#666;">berhasil ditambahkan ke keranjang</p>
      </div>
    </div>
    <a href="/cart/" style="display:inline-block;margin-top:10px;padding:6px 16px;background:#222;color:#fff;border-radius:4px;font-size:12px;font-weight:600;text-decoration:none;">LIHAT KERANJANG</a>
  `;
  Object.assign(toast.style, {
    position: 'fixed', top: '20px', right: '20px', zIndex: '99999',
    background: '#fff', border: '1px solid #e0e0e0', borderLeft: '4px solid #2e7d32',
    borderRadius: '8px', padding: '16px 20px', maxWidth: '340px',
    boxShadow: '0 8px 30px rgba(0,0,0,0.15)', transform: 'translateX(120%)',
    transition: 'transform 0.4s ease', fontFamily: "'Poppins', sans-serif"
  });
  document.body.appendChild(toast);

  // Slide in
  requestAnimationFrame(() => {
    toast.style.transform = 'translateX(0)';
  });

  // Auto-remove after 4 seconds
  setTimeout(() => {
    toast.style.transform = 'translateX(120%)';
    setTimeout(() => toast.remove(), 400);
  }, 4000);
}

async function initProductPage() {
  // Get handle from URL — support both /product/handle and /product/handle/
  const pathParts = window.location.pathname.replace(/\/+$/, '').split('/');
  const handle = pathParts[pathParts.length - 1];

  if (!handle || handle === 'product') {
    document.getElementById('productTitle').textContent = 'Product not found';
    return;
  }

  try {
    const response = await fetch(`/api/products/${handle}`);
    if (!response.ok) throw new Error('Product not found');
    
    const data = await response.json();
    currentProduct = data.product;

    renderProduct(currentProduct);
    renderRelatedProducts(currentProduct);
    
    // Update page title
    document.title = `${currentProduct.title} - Plan Your Skin`;
    
  } catch (error) {
    console.error('Error:', error);
    document.getElementById('productTitle').textContent = 'Product not found';
    document.getElementById('productDesc').innerHTML = '<p>Sorry, this product could not be found. <a href="/shop" style="color:#b93027;text-decoration:underline;">Browse all products</a></p>';
  }
}

function renderProduct(product) {
  // Gallery
  const mainImage = document.getElementById('mainImage');
  const thumbsContainer = document.getElementById('galleryThumbs');
  
  if (product.images && product.images.length > 0) {
    mainImage.src = product.images[0].src;
    mainImage.alt = product.title;

    thumbsContainer.innerHTML = product.images.map((img, i) => `
      <div class="product-gallery-thumb ${i === 0 ? 'active' : ''}" data-index="${i}">
        <img src="${img.src}" alt="${product.title} - Image ${i + 1}">
      </div>
    `).join('');

    // Thumb click handler
    thumbsContainer.querySelectorAll('.product-gallery-thumb').forEach(thumb => {
      thumb.addEventListener('click', () => {
        const index = parseInt(thumb.dataset.index);
        mainImage.src = product.images[index].src;
        thumbsContainer.querySelectorAll('.product-gallery-thumb').forEach(t => t.classList.remove('active'));
        thumb.classList.add('active');
      });
    });
  }

  // Category (optional in template)
  const categoryEl = document.getElementById('productCategory');
  if (categoryEl) categoryEl.textContent = product.product_type || 'Skincare';

  // Title
  document.getElementById('productTitle').textContent = product.title;

  // Price
  const priceContainer = document.getElementById('productPrice');
  const hasDiscount = product.compare_at_price && parseFloat(product.compare_at_price) > parseFloat(product.price);
  
  let priceHTML = `<span class="price-current">${formatPrice(product.price)}</span>`;
  if (hasDiscount) {
    const saved = parseFloat(product.compare_at_price) - parseFloat(product.price);
    priceHTML += `<span class="price-compare">${formatPrice(product.compare_at_price)}</span>`;
  }
  priceContainer.innerHTML = priceHTML;

  // Description — render directly (no heading, matching original)
  document.getElementById('productDesc').innerHTML = product.body_html || '<p>No description available.</p>';

  // Meta — match original: SKU, Categories, Brand
  const metaContainer = document.getElementById('productMeta');
  const sku = product.variants?.[0]?.sku || '';
  metaContainer.innerHTML = `
    ${sku ? `<div class="product-meta-item"><strong>SKU:</strong> <span>${sku}</span></div>` : ''}
    ${product.product_type ? `<div class="product-meta-item"><strong>Categories:</strong> <a href="/product-category/${product.product_type.toLowerCase().replace(/\s+/g,'-')}/">${product.product_type}</a>, <a href="/shop/">Skincare</a></div>` : ''}
    <div class="product-meta-item"><strong>Brand:</strong> <a href="/shop/">${product.vendor || 'Plan Your Skin'}</a></div>
  `;

  // Quantity controls
  const qtyInput = document.getElementById('qtyInput');
  document.getElementById('qtyMinus').addEventListener('click', () => {
    const val = parseInt(qtyInput.value) || 1;
    qtyInput.value = Math.max(1, val - 1);
  });
  document.getElementById('qtyPlus').addEventListener('click', () => {
    const val = parseInt(qtyInput.value) || 1;
    qtyInput.value = val + 1;
  });

  // Add to cart button
  const btnAddCart = document.getElementById('btnAddCart');
  btnAddCart.addEventListener('click', () => {
    const qty = parseInt(qtyInput.value) || 1;
    PYSCart.addItem(product, qty);
    
    // Visual feedback: change button text
    const origText = btnAddCart.textContent;
    btnAddCart.textContent = '✓ BERHASIL DITAMBAHKAN!';
    btnAddCart.style.background = '#2e7d32';
    setTimeout(() => {
      btnAddCart.textContent = origText;
      btnAddCart.style.background = '';
    }, 2000);

    // Show toast notification
    showCartToast(product.title, qty);
  });

  // Buy now button
  const btnBuyNow = document.getElementById('btnBuyNow');
  if (btnBuyNow) {
    btnBuyNow.addEventListener('click', () => {
      const qty = parseInt(qtyInput.value) || 1;
      PYSCart.addItem(product, qty);
      window.location.href = '/checkout/';
    });
  }
}

async function renderRelatedProducts(currentProduct) {
  const container = document.getElementById('relatedProducts');
  if (!container) return;

  try {
    const products = await fetchProducts();
    
    // Filter related products (same type, exclude current)
    let related = products.filter(p => 
      p.handle !== currentProduct.handle && 
      p.product_type === currentProduct.product_type
    );

    // If not enough, add other products
    if (related.length < 4) {
      const others = products.filter(p => 
        p.handle !== currentProduct.handle && 
        !related.find(r => r.handle === p.handle)
      );
      related = [...related, ...others].slice(0, 4);
    } else {
      related = related.slice(0, 4);
    }

    container.innerHTML = related.map(p => createProductCard(p)).join('');
  } catch (error) {
    console.error('Error loading related products:', error);
  }
}

document.addEventListener('DOMContentLoaded', initProductPage);
