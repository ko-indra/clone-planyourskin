/* ============================================
   Plan Your Skin — Main Application JS
   ============================================ */

// Format price to Indonesian Rupiah
function formatPrice(price) {
  const num = parseFloat(price);
  if (isNaN(num)) return 'Rp 0';
  return 'Rp ' + num.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

// Create product card HTML
function createProductCard(product) {
  const mainImg = product.image || product.images?.[0]?.src || '';
  const hoverImg = product.images?.[1]?.src || '';
  const isBestSeller = (product.tags || '').toLowerCase().includes('best seller');
  const isBundle = (product.product_type || '').toLowerCase() === 'bundle';
  const hasDiscount = product.compare_at_price && parseFloat(product.compare_at_price) > parseFloat(product.price);

  let badgeHTML = '';
  if (hasDiscount) {
    const discount = Math.round((1 - parseFloat(product.price) / parseFloat(product.compare_at_price)) * 100);
    badgeHTML = `<div class="product-badge"><span class="badge-sale">-${discount}%</span></div>`;
  } else if (isBestSeller) {
    badgeHTML = `<div class="product-badge"><span class="badge-bestseller">Best Seller</span></div>`;
  }

  return `
    <div class="product-card" data-handle="${product.handle}">
      <a href="/product/${product.handle}">
        <div class="product-card-image">
          ${badgeHTML}
          <img class="product-img-main" src="${mainImg}" alt="${product.title}" loading="lazy">
          ${hoverImg ? `<img class="product-img-hover" src="${hoverImg}" alt="${product.title}" loading="lazy">` : ''}
          <div class="product-card-actions">
            <span class="btn-add-cart" onclick="event.preventDefault(); event.stopPropagation();">Add to Cart</span>
            <button class="btn-wishlist" onclick="event.preventDefault(); event.stopPropagation();">♡</button>
          </div>
        </div>
        <div class="product-card-info">
          <p class="product-card-category">${product.product_type || 'Skincare'}</p>
          <h3 class="product-card-title">${product.title}</h3>
          <div class="product-card-price">
            <span class="price-current">${formatPrice(product.price)}</span>
            ${hasDiscount ? `<span class="price-compare">${formatPrice(product.compare_at_price)}</span>` : ''}
          </div>
        </div>
      </a>
    </div>
  `;
}

// Fetch products from API
async function fetchProducts() {
  try {
    const response = await fetch('/api/products');
    const data = await response.json();
    return data.products || [];
  } catch (error) {
    console.error('Error fetching products:', error);
    return [];
  }
}

// Hero Slider
function initHeroSlider() {
  const slides = document.querySelectorAll('.hero-slide');
  const dots = document.querySelectorAll('.hero-dot');
  if (slides.length === 0) return;

  let currentSlide = 0;
  const totalSlides = slides.length;

  function goToSlide(index) {
    slides.forEach(s => s.classList.remove('active'));
    dots.forEach(d => d.classList.remove('active'));
    slides[index].classList.add('active');
    dots[index].classList.add('active');
    currentSlide = index;
  }

  // Auto-advance
  let interval = setInterval(() => {
    goToSlide((currentSlide + 1) % totalSlides);
  }, 5000);

  dots.forEach(dot => {
    dot.addEventListener('click', () => {
      clearInterval(interval);
      goToSlide(parseInt(dot.dataset.slide));
      interval = setInterval(() => {
        goToSlide((currentSlide + 1) % totalSlides);
      }, 5000);
    });
  });
}

// Header scroll effect
function initHeaderScroll() {
  const header = document.getElementById('header');
  if (!header) return;

  window.addEventListener('scroll', () => {
    if (window.scrollY > 50) {
      header.classList.add('scrolled');
    } else {
      header.classList.remove('scrolled');
    }
  });
}

// Mobile menu
function initMobileMenu() {
  const toggle = document.getElementById('mobileMenuToggle');
  const nav = document.getElementById('mainNav');
  if (!toggle || !nav) return;

  toggle.addEventListener('click', () => {
    nav.classList.toggle('open');
    toggle.classList.toggle('active');
  });

  // Toggle mega menus on mobile
  const navItems = nav.querySelectorAll(':scope > li');
  navItems.forEach(item => {
    const link = item.querySelector(':scope > a');
    const mega = item.querySelector('.mega-menu');
    if (mega && link) {
      link.addEventListener('click', (e) => {
        if (window.innerWidth <= 768) {
          e.preventDefault();
          item.classList.toggle('menu-open');
        }
      });
    }
  });
}

// Intersection Observer for fade-in animations
function initScrollAnimations() {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.1 }
  );

  document.querySelectorAll('.fade-in, .section-header, .product-card, .category-card, .feature-banner').forEach(el => {
    observer.observe(el);
  });
}

// Render best sellers on homepage
async function renderBestSellers() {
  const grid = document.getElementById('bestSellerGrid');
  if (!grid) return;

  const products = await fetchProducts();
  
  // Filter individual products (not bundles) for best sellers
  const bestSellers = products.filter(p => 
    (p.product_type || '').toLowerCase() !== 'bundle'
  ).slice(0, 5);

  if (bestSellers.length === 0) {
    grid.innerHTML = '<p style="text-align:center;color:var(--color-text-muted);grid-column:1/-1;">No products found. Please check your Shopify connection.</p>';
    return;
  }

  grid.innerHTML = bestSellers.map(p => createProductCard(p)).join('');
}

// Render bundles on homepage
async function renderBundles() {
  const grid = document.getElementById('bundlesGrid');
  if (!grid) return;

  const products = await fetchProducts();
  
  const bundles = products.filter(p => 
    (p.product_type || '').toLowerCase() === 'bundle'
  ).slice(0, 4);

  if (bundles.length === 0) {
    grid.innerHTML = '<p style="text-align:center;color:var(--color-text-muted);grid-column:1/-1;">No bundles found</p>';
    return;
  }

  grid.innerHTML = bundles.map(p => createProductCard(p)).join('');
}

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', () => {
  initHeroSlider();
  initHeaderScroll();
  initMobileMenu();
  
  // Render homepage sections
  renderBestSellers();
  renderBundles();

  // Delayed scroll animations
  setTimeout(initScrollAnimations, 500);
});
