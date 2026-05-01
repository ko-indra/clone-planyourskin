/* ============================================
   Plan Your Skin — Checkout (Midtrans Snap)
   ============================================ */

async function initCheckoutPage() {
  const items = PYSCart.getItems();
  
  if (items.length === 0) {
    document.getElementById('checkoutContent').innerHTML = `
      <div style="text-align:center;padding:60px 20px;">
        <h2 style="margin-bottom:10px;">Keranjang Kosong</h2>
        <p style="color:#777;">Tambahkan produk ke keranjang sebelum checkout.</p>
        <a href="/shop/" style="display:inline-block;margin-top:20px;padding:12px 30px;background:#222;color:#fff;text-decoration:none;font-weight:600;">BELANJA SEKARANG</a>
      </div>
    `;
    return;
  }

  renderOrderSummary(items);
}

function renderOrderSummary(items) {
  const summaryContainer = document.getElementById('orderSummary');
  if (!summaryContainer) return;

  const total = PYSCart.getTotal();
  const savings = PYSCart.getSavings();

  summaryContainer.innerHTML = `
    <h3 style="font-family:'Playfair Display',serif;font-size:1.3em;margin-bottom:15px;font-weight:700;">Ringkasan Pesanan</h3>
    <div style="border:1px solid #eee;border-radius:8px;overflow:hidden;">
      ${items.map(item => `
        <div style="display:flex;gap:12px;padding:12px;border-bottom:1px solid #f0f0f0;align-items:center;">
          <img src="${item.image}" alt="${item.title}" style="width:60px;height:60px;object-fit:cover;border-radius:6px;border:1px solid #eee;">
          <div style="flex:1;min-width:0;">
            <p style="font-size:13px;font-weight:600;color:#222;margin:0 0 4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${item.title}</p>
            <p style="font-size:12px;color:#777;margin:0;">${item.qty} × ${formatPrice(item.price)}</p>
          </div>
          <p style="font-size:13px;font-weight:700;color:#222;margin:0;white-space:nowrap;">${formatPrice(parseFloat(item.price) * item.qty)}</p>
        </div>
      `).join('')}
    </div>
    <div style="padding:15px 0;border-top:2px solid #222;margin-top:15px;">
      ${savings > 0 ? `
        <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
          <span style="color:#777;font-size:13px;">Hemat</span>
          <span style="color:#b93027;font-weight:600;font-size:13px;">- ${formatPrice(savings)}</span>
        </div>
      ` : ''}
      <div style="display:flex;justify-content:space-between;">
        <span style="font-weight:700;font-size:16px;">Total</span>
        <span style="font-weight:700;font-size:16px;">${formatPrice(total)}</span>
      </div>
    </div>
  `;
}

async function handleCheckout(e) {
  e.preventDefault();

  const form = document.getElementById('checkoutForm');
  const btn = document.getElementById('btnPay');
  const items = PYSCart.getItems();

  if (items.length === 0) {
    alert('Keranjang kosong!');
    return;
  }

  // Validate form
  const name = form.querySelector('#custName').value.trim();
  const email = form.querySelector('#custEmail').value.trim();
  const phone = form.querySelector('#custPhone').value.trim();
  const address = form.querySelector('#custAddress').value.trim();
  const city = form.querySelector('#custCity').value.trim();
  const postalCode = form.querySelector('#custPostal').value.trim();

  if (!name || !email || !phone || !address || !city || !postalCode) {
    alert('Mohon lengkapi semua data.');
    return;
  }

  // Disable button
  btn.disabled = true;
  btn.textContent = 'Memproses...';

  try {
    const response = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: items.map(item => ({
          id: item.handle,
          name: item.title,
          price: Math.round(parseFloat(item.price)),
          quantity: item.qty,
        })),
        customer: { name, email, phone, address, city, postal_code: postalCode },
      }),
    });

    const data = await response.json();

    if (data.error) {
      throw new Error(data.error);
    }

    if (data.token) {
      // Open Midtrans Snap popup
      window.snap.pay(data.token, {
        onSuccess: function(result) {
          PYSCart.clear();
          window.location.href = '/checkout/success.html?order_id=' + result.order_id;
        },
        onPending: function(result) {
          alert('Pembayaran pending. Silakan selesaikan pembayaran Anda.');
        },
        onError: function(result) {
          alert('Pembayaran gagal. Silakan coba lagi.');
          btn.disabled = false;
          btn.textContent = 'BAYAR SEKARANG';
        },
        onClose: function() {
          btn.disabled = false;
          btn.textContent = 'BAYAR SEKARANG';
        },
      });
    }
  } catch (error) {
    console.error('Checkout error:', error);
    alert('Terjadi kesalahan: ' + error.message);
    btn.disabled = false;
    btn.textContent = 'BAYAR SEKARANG';
  }
}

document.addEventListener('DOMContentLoaded', initCheckoutPage);
