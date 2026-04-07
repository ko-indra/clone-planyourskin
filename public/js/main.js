// ========================================
// Plan Your Skin Clone - Main JavaScript
// ========================================

document.addEventListener('DOMContentLoaded', () => {
  initSlider();
  initMobileMenu();
  initBackToTop();
  initStickyHeader();
  initCart();
  initLoginModal();
});

// ========================================
// Hero Slider
// ========================================
function initSlider() {
  const slides = document.querySelectorAll('.slide');
  const prevBtn = document.getElementById('slider-prev');
  const nextBtn = document.getElementById('slider-next');

  if (!slides.length) return;

  let currentSlide = 0;
  let autoSlideInterval;

  function goToSlide(index) {
    slides.forEach(s => s.classList.remove('active'));
    currentSlide = (index + slides.length) % slides.length;
    slides[currentSlide].classList.add('active');
  }

  function nextSlide() {
    goToSlide(currentSlide + 1);
  }

  function prevSlide() {
    goToSlide(currentSlide - 1);
  }

  function startAutoSlide() {
    autoSlideInterval = setInterval(nextSlide, 5000);
  }

  function resetAutoSlide() {
    clearInterval(autoSlideInterval);
    startAutoSlide();
  }

  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      prevSlide();
      resetAutoSlide();
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      nextSlide();
      resetAutoSlide();
    });
  }

  // Touch/Swipe support
  const sliderEl = document.getElementById('hero-slider');
  if (sliderEl) {
    let touchStartX = 0;
    let touchEndX = 0;

    sliderEl.addEventListener('touchstart', (e) => {
      touchStartX = e.changedTouches[0].screenX;
    }, { passive: true });

    sliderEl.addEventListener('touchend', (e) => {
      touchEndX = e.changedTouches[0].screenX;
      const diff = touchStartX - touchEndX;
      if (Math.abs(diff) > 50) {
        if (diff > 0) nextSlide();
        else prevSlide();
        resetAutoSlide();
      }
    }, { passive: true });
  }

  startAutoSlide();
}

// ========================================
// Mobile Menu
// ========================================
function initMobileMenu() {
  const menuBtn = document.getElementById('mobile-menu-btn');
  const nav = document.getElementById('main-nav');

  if (!menuBtn || !nav) return;

  menuBtn.addEventListener('click', () => {
    nav.classList.toggle('open');
    const isOpen = nav.classList.contains('open');
    menuBtn.setAttribute('aria-expanded', isOpen);
  });

  // Toggle dropdown on mobile
  document.querySelectorAll('.has-dropdown > .nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
      if (window.innerWidth <= 768) {
        e.preventDefault();
        link.parentElement.classList.toggle('open');
      }
    });
  });

  // Close menu on outside click
  document.addEventListener('click', (e) => {
    if (!nav.contains(e.target) && !menuBtn.contains(e.target)) {
      nav.classList.remove('open');
    }
  });
}

// ========================================
// Back to Top
// ========================================
function initBackToTop() {
  const btn = document.getElementById('back-to-top');
  if (!btn) return;

  window.addEventListener('scroll', () => {
    if (window.scrollY > 400) {
      btn.classList.add('visible');
    } else {
      btn.classList.remove('visible');
    }
  });

  btn.addEventListener('click', (e) => {
    e.preventDefault();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

// ========================================
// Sticky Header
// ========================================
function initStickyHeader() {
  const header = document.getElementById('main-header');
  if (!header) return;

  let lastScroll = 0;

  window.addEventListener('scroll', () => {
    const currentScroll = window.scrollY;

    if (currentScroll > 150) {
      header.style.boxShadow = '0 2px 16px rgba(0,0,0,0.06)';
    } else {
      header.style.boxShadow = 'none';
    }

    lastScroll = currentScroll;
  });
}

// ========================================
// Shopify Cart
// ========================================
function initCart() {
  fetchCartOnLoad();

  const addToCartBtn = document.getElementById('add-to-cart');
  if (!addToCartBtn) return;

  addToCartBtn.addEventListener('click', async () => {
    const variantId = addToCartBtn.dataset.variantId;
    const productName = addToCartBtn.dataset.productName;
    const qtyInput = document.getElementById('product-qty');
    const quantity = parseInt(qtyInput?.value || '1');

    if (!variantId || variantId === 'null') {
      showCartNotification('Product not available for purchase', null);
      return;
    }

    // Disable button while processing
    addToCartBtn.disabled = true;
    addToCartBtn.textContent = 'ADDING...';

    try {
      const cartId = localStorage.getItem('shopify_cart_id');

      let result;
      if (cartId) {
        // Add to existing cart
        const response = await fetch('/api/cart/add', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cartId, variantId, quantity })
        });
        result = await response.json();

        if (result.error || result.userErrors?.length > 0) {
          // Cart might be expired, create a new one
          const newResponse = await fetch('/api/cart/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ variantId, quantity })
          });
          result = await newResponse.json();
          if (result.cart) {
            localStorage.setItem('shopify_cart_id', result.cart.id);
          }
        }
      } else {
        // Create new cart
        const response = await fetch('/api/cart/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ variantId, quantity })
        });
        result = await response.json();
        if (result.cart) {
          localStorage.setItem('shopify_cart_id', result.cart.id);
        }
      }

      if (result.cart) {
        // Update cart count in header
        updateCartCount(result.cart);
        // Show notification with checkout link
        showCartNotification(
          `${productName} added to cart!`,
          '/checkout'
        );
      } else if (result.userErrors?.length > 0) {
        showCartNotification(result.userErrors[0].message, null);
      } else {
        showCartNotification('Failed to add to cart. Please try again.', null);
      }
    } catch (error) {
      console.error('Cart error:', error);
      showCartNotification('Something went wrong. Please try again.', null);
    } finally {
      addToCartBtn.disabled = false;
      addToCartBtn.textContent = 'ADD TO CART';
    }
  });
}

function updateCartCount(cart) {
  const countEl = document.querySelector('.cart-count');
  
  let totalItems = 0;
  if (cart && cart.lines && cart.lines.edges) {
    totalItems = cart.lines.edges.reduce((sum, line) => sum + line.node.quantity, 0);
  }
  
  if (countEl) {
    countEl.textContent = totalItems;
    countEl.style.display = totalItems > 0 ? 'flex' : 'none';
  }

  // Update hover dropdown content
  const hoverCount = document.getElementById('cart-hover-count');
  const hoverItems = document.getElementById('cart-hover-items');
  const hoverFooter = document.getElementById('cart-hover-footer');
  const hoverSubtotal = document.getElementById('cart-hover-subtotal');
  const hoverCheckout = document.getElementById('cart-hover-checkout');
  
  if (!hoverCount || !hoverItems) return;
  
  hoverCount.textContent = `${totalItems} ITEM${totalItems !== 1 ? 'S' : ''}`;
  
  if (totalItems === 0) {
    hoverItems.innerHTML = '<div class="cart-dropdown-empty">Your cart is currently empty.</div>';
    if (hoverFooter) hoverFooter.style.display = 'none';
    return;
  }
  
  let itemsHtml = '';
  cart.lines.edges.forEach(edge => {
    const line = edge.node;
    const variant = line.merchandise;
    const product = variant.product;
    const title = product ? product.title : variant.title;
    const price = parseFloat(variant.price.amount);
    const imageUrl = (product && product.images && product.images.edges.length > 0) 
      ? product.images.edges[0].node.url : '/assets/placeholder.svg';
    
    // Quick formatter for Rp without decimals
    const rpFormat = 'Rp' + Math.round(price).toLocaleString('id-ID');

    itemsHtml += `
      <div class="cart-dropdown-item">
        <div class="cart-dropdown-item-details">
          <div class="cart-dropdown-item-title">${title}</div>
          <div class="cart-dropdown-item-price">${line.quantity} &times; ${rpFormat}</div>
        </div>
        <img src="${imageUrl}" class="cart-dropdown-item-img" alt="${title}">
        <button class="cart-dropdown-item-remove" data-line-id="${line.id}" aria-label="Remove item">&times;</button>
      </div>
    `;
  });
  
  hoverItems.innerHTML = itemsHtml;
  
  if (cart.cost && hoverSubtotal) {
    const subtotal = parseFloat(cart.cost.subtotalAmount.amount);
    hoverSubtotal.textContent = 'Rp' + Math.round(subtotal).toLocaleString('id-ID');
  }
  
  if (hoverFooter) hoverFooter.style.display = 'block';
  if (hoverCheckout) hoverCheckout.href = '/checkout';
}

async function fetchCartOnLoad() {
  const cartId = localStorage.getItem('shopify_cart_id');
  if (!cartId) return;
  try {
    const response = await fetch(`/api/cart/${encodeURIComponent(cartId)}`);
    const result = await response.json();
    if (result && result.cart) {
      updateCartCount(result.cart);
    }
  } catch (e) {
    console.error('Failed to load cart on page load', e);
  }
}

function showCartNotification(message, checkoutUrl) {
  const notification = document.getElementById('cart-notification');
  const textEl = document.getElementById('cart-notification-text');
  const checkoutBtn = document.getElementById('cart-notification-checkout');

  if (!notification) return;

  textEl.textContent = message;

  if (checkoutUrl) {
    checkoutBtn.href = checkoutUrl;
    checkoutBtn.style.display = 'inline-block';
  } else {
    checkoutBtn.style.display = 'none';
  }

  notification.classList.add('show');

  // Auto-hide after 5 seconds
  setTimeout(() => {
    notification.classList.remove('show');
  }, 5000);
}

// ========================================
// Login / Register Modal
// ========================================
function initLoginModal() {
  const accountIcon = document.getElementById('account-icon');
  const accountLogout = document.getElementById('account-logout');
  const modalOverlay = document.getElementById('login-modal-overlay');
  const closeBtn = document.getElementById('login-modal-close');

  const loginView = document.getElementById('login-view');
  const registerView = document.getElementById('register-view');
  const showRegisterLink = document.getElementById('show-register');
  const showLoginLink = document.getElementById('show-login');

  const loginForm = document.getElementById('auth-login-form');
  const registerForm = document.getElementById('auth-register-form');
  
  const loginError = document.getElementById('login-error');
  const registerError = document.getElementById('register-error');

  // Handle Logout
  if (accountLogout) {
    accountLogout.addEventListener('click', async (e) => {
      e.preventDefault();
      try {
        await fetch('/api/auth/logout', { method: 'POST' });
        window.location.reload();
      } catch (err) {
        console.error(err);
      }
    });
  }

  if (!modalOverlay) return;

  const closeModal = () => {
    modalOverlay.classList.remove('open');
    document.body.style.overflow = '';
    // Reset views
    if (loginView && registerView) {
      loginView.style.display = 'flex';
      registerView.style.display = 'none';
      loginError.style.display = 'none';
      registerError.style.display = 'none';
      loginForm.reset();
      registerForm.reset();
    }
  };

  if (accountIcon) {
    accountIcon.addEventListener('click', (e) => {
      e.preventDefault();
      modalOverlay.classList.add('open');
      document.body.style.overflow = 'hidden';
    });
  }

  if (closeBtn) closeBtn.addEventListener('click', closeModal);

  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) closeModal();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modalOverlay.classList.contains('open')) closeModal();
  });

  // Toggle UI
  if (showRegisterLink && showLoginLink) {
    showRegisterLink.addEventListener('click', (e) => {
      e.preventDefault();
      loginView.style.display = 'none';
      registerView.style.display = 'flex';
    });
    
    showLoginLink.addEventListener('click', (e) => {
      e.preventDefault();
      registerView.style.display = 'none';
      loginView.style.display = 'flex';
    });
  }

  // Handle Login
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('login-email').value;
      const password = document.getElementById('login-password').value;
      const btn = document.getElementById('btn-login-submit');

      loginError.style.display = 'none';
      btn.textContent = 'Signing in...';
      btn.disabled = true;

      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        
        if (res.ok && data.success) {
          window.location.reload();
        } else {
          loginError.textContent = data.error || 'Login failed.';
          loginError.style.display = 'block';
        }
      } catch (err) {
        loginError.textContent = 'Network error. Please try again.';
        loginError.style.display = 'block';
      } finally {
        btn.textContent = 'Sign in now';
        btn.disabled = false;
      }
    });
  }

  // Handle Register
  if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const firstName = document.getElementById('reg-firstname').value;
      const lastName = document.getElementById('reg-lastname').value;
      const email = document.getElementById('reg-email').value;
      const password = document.getElementById('reg-password').value;
      const btn = document.getElementById('btn-register-submit');

      registerError.style.display = 'none';
      btn.textContent = 'Creating account...';
      btn.disabled = true;

      try {
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ firstName, lastName, email, password })
        });
        const data = await res.json();
        
        if (res.ok && data.success) {
          // Success, logic to auto login or switch back to login
          registerView.style.display = 'none';
          loginView.style.display = 'flex';
          loginError.style.color = 'green';
          loginError.textContent = 'Account created successfully! Please login.';
          loginError.style.display = 'block';
          document.getElementById('login-email').value = email;
          registerForm.reset();
        } else {
          registerError.textContent = data.error || 'Registration failed.';
          registerError.style.display = 'block';
        }
      } catch (err) {
        registerError.textContent = 'Network error. Please try again.';
        registerError.style.display = 'block';
      } finally {
        btn.textContent = 'Create Account';
        btn.disabled = false;
      }
    });
  }
}

// ========================================
// Google JS Callback
// ========================================
window.handleGoogleSignIn = async function(response) {
  const credential = response.credential;
  if (!credential) return;

  const loginError = document.getElementById('login-error');
  if (loginError) loginError.style.display = 'none';

  try {
    const res = await fetch('/api/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential })
    });
    const data = await res.json();

    if (res.ok && data.success) {
      window.location.reload();
    } else {
      if (loginError) {
        loginError.style.color = 'red';
        loginError.textContent = data.error || 'Failed to authenticate via Google.';
        loginError.style.display = 'block';
      }
    }
  } catch (err) {
    if (loginError) {
      loginError.style.color = 'red';
      loginError.textContent = 'Network error during Google Sign In.';
      loginError.style.display = 'block';
    }
  }
};
