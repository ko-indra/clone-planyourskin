/* ============================================
   Plan Your Skin — Cart Management (localStorage)
   ============================================ */

const PYSCart = {
  STORAGE_KEY: 'pys_cart',

  // Get all cart items
  getItems() {
    try {
      return JSON.parse(localStorage.getItem(this.STORAGE_KEY)) || [];
    } catch {
      return [];
    }
  },

  // Save cart items
  _save(items) {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(items));
    this.updateBadge();
    this.updateMiniCart();
  },

  // Add item to cart
  addItem(product, qty = 1) {
    const items = this.getItems();
    const existing = items.find(item => item.handle === product.handle);

    if (existing) {
      existing.qty += qty;
    } else {
      items.push({
        handle: product.handle,
        title: product.title,
        price: product.price,
        compare_at_price: product.compare_at_price,
        image: product.image || product.images?.[0]?.src || '',
        product_type: product.product_type || 'Skincare',
        variant_id: product.variants?.[0]?.id || null,
        qty: qty,
      });
    }

    this._save(items);
    this.showNotification(product.title, qty);
    return items;
  },

  // Remove item from cart
  removeItem(handle) {
    const items = this.getItems().filter(item => item.handle !== handle);
    this._save(items);
    return items;
  },

  // Update item quantity
  updateQty(handle, qty) {
    const items = this.getItems();
    const item = items.find(i => i.handle === handle);
    if (item) {
      item.qty = Math.max(1, qty);
    }
    this._save(items);
    return items;
  },

  // Clear entire cart
  clear() {
    localStorage.removeItem(this.STORAGE_KEY);
    this.updateBadge();
    this.updateMiniCart();
  },

  // Get total item count
  getCount() {
    return this.getItems().reduce((sum, item) => sum + item.qty, 0);
  },

  // Get total price
  getTotal() {
    return this.getItems().reduce((sum, item) => sum + (parseFloat(item.price) * item.qty), 0);
  },

  // Get total savings
  getSavings() {
    return this.getItems().reduce((sum, item) => {
      if (item.compare_at_price && parseFloat(item.compare_at_price) > parseFloat(item.price)) {
        return sum + ((parseFloat(item.compare_at_price) - parseFloat(item.price)) * item.qty);
      }
      return sum;
    }, 0);
  },

  // Update cart badge count in header
  updateBadge() {
    const count = this.getCount();
    // Update all cart-items badges (WooCommerce header)
    document.querySelectorAll('.cart-items').forEach(el => {
      el.textContent = count;
    });
    document.querySelectorAll('.cart-items-text').forEach(el => {
      el.textContent = count;
    });
  },

  // Update mini cart dropdown
  updateMiniCart() {
    const container = document.querySelector('.widget_shopping_cart_content');
    if (!container) return;

    const items = this.getItems();
    if (items.length === 0) {
      container.innerHTML = `
        <p style="text-align:center;padding:20px 0;color:#777;font-size:13px;">
          Keranjang belanja kosong.
        </p>
        <p style="text-align:center;">
          <a href="/shop/" style="color:#b93027;text-decoration:underline;font-weight:600;">Lihat Produk</a>
        </p>
      `;
      return;
    }

    const total = this.getTotal();
    container.innerHTML = `
      <ul class="woocommerce-mini-cart cart_list product_list_widget" style="list-style:none;padding:0;margin:0 0 10px;">
        ${items.map(item => `
          <li style="display:flex;gap:10px;padding:8px 0;border-bottom:1px solid #eee;align-items:center;">
            <img src="${item.image}" alt="${item.title}" style="width:50px;height:50px;object-fit:cover;border-radius:4px;">
            <div style="flex:1;min-width:0;">
              <a href="/product/${item.handle}" style="font-size:12px;color:#222;font-weight:600;display:block;text-overflow:ellipsis;overflow:hidden;white-space:nowrap;">${item.title}</a>
              <span style="font-size:11px;color:#777;">${item.qty} × ${formatPrice(item.price)}</span>
            </div>
            <button onclick="PYSCart.removeItem('${item.handle}')" style="background:none;border:none;color:#999;cursor:pointer;font-size:16px;padding:0 4px;">×</button>
          </li>
        `).join('')}
      </ul>
      <p style="font-weight:700;font-size:14px;margin:10px 0;display:flex;justify-content:space-between;">
        <span>Subtotal:</span>
        <span>${formatPrice(total)}</span>
      </p>
      <div style="display:flex;gap:8px;">
        <a href="/cart/" style="flex:1;display:block;text-align:center;padding:8px;border:1px solid #222;color:#222;font-size:12px;font-weight:600;">KERANJANG</a>
        <a href="/checkout/" style="flex:1;display:block;text-align:center;padding:8px;background:#222;color:#fff;font-size:12px;font-weight:600;">CHECKOUT</a>
      </div>
    `;
  },

  // Show add-to-cart notification
  showNotification(title, qty) {
    // Remove existing notification
    const existing = document.getElementById('pys-cart-notification');
    if (existing) existing.remove();

    const notification = document.createElement('div');
    notification.id = 'pys-cart-notification';
    notification.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;">
        <span style="font-size:20px;">✓</span>
        <div>
          <strong style="font-size:13px;display:block;">"${title}"</strong>
          <span style="font-size:12px;color:#555;">ditambahkan ke keranjang (${qty})</span>
        </div>
      </div>
      <div style="display:flex;gap:8px;margin-top:10px;">
        <a href="/cart/" style="flex:1;text-align:center;padding:6px;border:1px solid #222;color:#222;font-size:11px;font-weight:600;text-decoration:none;">LIHAT KERANJANG</a>
        <a href="/checkout/" style="flex:1;text-align:center;padding:6px;background:#222;color:#fff;font-size:11px;font-weight:600;text-decoration:none;">CHECKOUT</a>
      </div>
    `;
    Object.assign(notification.style, {
      position: 'fixed',
      bottom: '20px',
      right: '20px',
      background: '#fff',
      border: '1px solid #e7e7e7',
      borderRadius: '8px',
      padding: '15px 20px',
      boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
      zIndex: '99999',
      maxWidth: '320px',
      width: '100%',
      animation: 'slideInRight 0.3s ease-out',
    });

    // Add animation keyframes if not exists
    if (!document.getElementById('pys-cart-animations')) {
      const style = document.createElement('style');
      style.id = 'pys-cart-animations';
      style.textContent = `
        @keyframes slideInRight {
          from { transform: translateX(100px); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes slideOutRight {
          from { transform: translateX(0); opacity: 1; }
          to { transform: translateX(100px); opacity: 0; }
        }
      `;
      document.head.appendChild(style);
    }

    document.body.appendChild(notification);

    // Auto-remove after 4 seconds
    setTimeout(() => {
      notification.style.animation = 'slideOutRight 0.3s ease-in forwards';
      setTimeout(() => notification.remove(), 300);
    }, 4000);
  },

  // Initialize cart on page load
  init() {
    this.updateBadge();
    this.updateMiniCart();
  }
};

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', () => {
  PYSCart.init();
});
