/* ============================================
   Plan Your Skin — Product Detail Page JS
   ============================================ */

async function initProductPage() {
  // Get handle from URL
  const pathParts = window.location.pathname.split('/');
  const handle = pathParts[pathParts.length - 1];

  if (!handle) {
    document.getElementById('productTitle').textContent = 'Product not found';
    return;
  }

  try {
    const response = await fetch(`/api/products/${handle}`);
    if (!response.ok) throw new Error('Product not found');
    
    const data = await response.json();
    const product = data.product;

    renderProduct(product);
    renderRelatedProducts(product);
    
    // Update page title
    document.title = `${product.title} - Plan Your Skin`;
    
  } catch (error) {
    console.error('Error:', error);
    document.getElementById('productTitle').textContent = 'Product not found';
    document.getElementById('productDesc').innerHTML = '<p>Sorry, this product could not be found. <a href="/shop" style="color:var(--color-accent);text-decoration:underline;">Browse all products</a></p>';
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

  // Category
  document.getElementById('productCategory').textContent = product.product_type || 'Skincare';

  // Title
  document.getElementById('productTitle').textContent = product.title;

  // Price
  const priceContainer = document.getElementById('productPrice');
  const hasDiscount = product.compare_at_price && parseFloat(product.compare_at_price) > parseFloat(product.price);
  
  let priceHTML = `<span class="price-current">${formatPrice(product.price)}</span>`;
  if (hasDiscount) {
    const saved = parseFloat(product.compare_at_price) - parseFloat(product.price);
    priceHTML += `<span class="price-compare">${formatPrice(product.compare_at_price)}</span>`;
    priceHTML += `<span class="price-save">Hemat ${formatPrice(saved)}</span>`;
  }
  priceContainer.innerHTML = priceHTML;

  // Description
  document.getElementById('productDesc').innerHTML = product.body_html || '<p>No description available.</p>';

  // Meta
  const metaContainer = document.getElementById('productMeta');
  metaContainer.innerHTML = `
    <div class="product-meta-item">
      <strong>Brand:</strong>
      <span>${product.vendor || 'Plan Your Skin'}</span>
    </div>
    <div class="product-meta-item">
      <strong>Type:</strong>
      <span>${product.product_type || 'Skincare'}</span>
    </div>
    ${product.tags ? `
    <div class="product-meta-item">
      <strong>Tags:</strong>
      <span>${product.tags}</span>
    </div>
    ` : ''}
  `;

  // Add to cart button
  document.getElementById('btnAddCart').addEventListener('click', () => {
    alert(`"${product.title}" akan ditambahkan ke keranjang.\n\nFitur checkout terintegrasi dengan Shopify store.`);
  });
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
