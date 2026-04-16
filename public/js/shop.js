/* ============================================
   Plan Your Skin — Shop Page JS
   ============================================ */

let allProducts = [];
let currentFilter = 'all';

async function initShop() {
  const grid = document.getElementById('shopProductsGrid');
  const resultsCount = document.getElementById('resultsCount');
  const filterBtns = document.querySelectorAll('.filter-btn');
  const shopTitle = document.getElementById('shopTitle');
  const shopDesc = document.getElementById('shopDesc');

  if (!grid) return;

  // Check URL params for initial filter
  const urlParams = new URLSearchParams(window.location.search);
  const typeParam = urlParams.get('type');
  if (typeParam) {
    currentFilter = typeParam;
    filterBtns.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.filter === typeParam);
    });
    if (shopTitle) shopTitle.textContent = typeParam === 'Bundle' ? 'All Bundles' : typeParam;
    if (shopDesc) shopDesc.textContent = `Shop our ${typeParam.toLowerCase()} collection`;
  }

  // Fetch products
  allProducts = await fetchProducts();
  renderFilteredProducts();

  // Filter button handlers
  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter;
      
      // Update title
      if (shopTitle) {
        shopTitle.textContent = currentFilter === 'all' ? 'All Products' : 
                                currentFilter === 'Bundle' ? 'All Bundles' : currentFilter;
      }
      if (shopDesc) {
        shopDesc.textContent = currentFilter === 'all' ? 
          'Shop our complete range of essentials skincare' :
          `Shop our ${currentFilter.toLowerCase()} collection`;
      }

      renderFilteredProducts();
      
      // Update URL without reload
      const url = new URL(window.location);
      if (currentFilter === 'all') {
        url.searchParams.delete('type');
      } else {
        url.searchParams.set('type', currentFilter);
      }
      window.history.replaceState({}, '', url);
    });
  });
}

function renderFilteredProducts() {
  const grid = document.getElementById('shopProductsGrid');
  const resultsCount = document.getElementById('resultsCount');
  
  let filtered = allProducts;
  if (currentFilter !== 'all') {
    filtered = allProducts.filter(p => 
      (p.product_type || '').toLowerCase() === currentFilter.toLowerCase()
    );
  }

  if (resultsCount) {
    resultsCount.textContent = `${filtered.length} product${filtered.length !== 1 ? 's' : ''}`;
  }

  if (filtered.length === 0) {
    grid.innerHTML = '<p style="text-align:center;color:var(--color-text-muted);grid-column:1/-1;padding:60px 0;">No products found in this category.</p>';
    return;
  }

  grid.innerHTML = filtered.map(p => createProductCard(p)).join('');

  // Animate in
  const cards = grid.querySelectorAll('.product-card');
  cards.forEach((card, i) => {
    card.style.opacity = '0';
    card.style.transform = 'translateY(20px)';
    setTimeout(() => {
      card.style.transition = 'all 0.4s ease';
      card.style.opacity = '1';
      card.style.transform = 'translateY(0)';
    }, i * 80);
  });
}

document.addEventListener('DOMContentLoaded', initShop);
