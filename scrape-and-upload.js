const fetch = require('node-fetch');
const cheerio = require('cheerio');
require('dotenv').config();

// Shopify credentials (from environment variables)
const SHOPIFY_STORE = process.env.SHOPIFY_STORE || 'planyourskin.myshopify.com';
const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY;

// Delay helper
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// All products with accurate data (from OG descriptions + known product info)
const PRODUCTS = [
  {
    title: 'All At Once Water Cream',
    body_html: `<h2>All At Once Water Cream - 30ml</h2>
<p>Hydration that feels like nothing, but does everything. Our All At Once Water Cream is the ultimate "glass of water" for your skin. Its unique water-break technology transforms the cream into a refreshing burst of moisture the moment it touches your skin, absorbing instantly with zero sticky residue.</p>
<p>It's more than just a moisturizer; it's a skincare-makeup hybrid. With 5% Niacinamide to control excess sebum and brighten dark spots, plus a Peptide Complex to keep skin firm, it creates a smooth, matte-yet-hydrated canvas that grips makeup perfectly all day long.</p>
<h3>Key Benefits:</h3>
<ul>
<li>Super-lightweight moisturizer that bursts into water upon contact</li>
<li>Delivers instant hydration without the grease</li>
<li>Formulated with 5% Niacinamide and Peptide Complex</li>
<li>Brightens skin, controls oil, and strengthens the barrier</li>
<li>Perfect non-sticky base for makeup or daily wear</li>
<li>Best for oily & combination skin</li>
</ul>
<p><strong>Size:</strong> 30ml</p>`,
    vendor: 'Plan Your Skin',
    product_type: 'Moisturizer',
    tags: 'Plan Your Skin, Skincare, Moisturizer, Water Cream, Niacinamide, Best Seller',
    images: [
      'https://planyourskin.com/wp-content/uploads/2020/05/WB-FOR-WEB-1-of-4.jpg',
      'https://planyourskin.com/wp-content/uploads/2025/11/water-cream.webp',
    ],
    price: '99000',
    weight: 30,
  },
  {
    title: 'All At Once Gel Moisturizer',
    body_html: `<h2>All At Once Gel Moisturizer - 30gr</h2>
<p>Meet your skin's ultimate 'calming hug'. Our All At Once Gel Moisturizer is designed to quench thirsty skin instantly without the heavy, greasy feeling. The unique watery-gel texture melts upon contact, creating a protective seal that locks in moisture all night long.</p>
<p>Packed with a powerhouse blend of Peptides and Niacinamide, it works overtime to improve skin elasticity and brighten your complexion while you sleep. Whether you use it as a daily moisturizer or a thick sleeping mask, wake up to skin that feels fresh, bouncy, and fully reset.</p>
<h3>Key Benefits:</h3>
<ul>
<li>Lightweight, soothing gel moisturizer</li>
<li>Delivers deep hydration and locks it in for 24 hours</li>
<li>Formulated with Matrixyl 3000™ (Palmitoyl Tripeptide-1 & Palmitoyl Tetrapeptide-7)</li>
<li>Contains Ceramide to repair the skin barrier</li>
<li>Calms redness and leaves skin looking plumpy and glowing</li>
<li>Perfect as a sleeping mask or daily moisturizer for all skin types</li>
</ul>
<p><strong>Size:</strong> 30gr</p>`,
    vendor: 'Plan Your Skin',
    product_type: 'Moisturizer',
    tags: 'Plan Your Skin, Skincare, Moisturizer, Gel, Ceramide, Peptide, Best Seller',
    images: [
      'https://planyourskin.com/wp-content/uploads/2025/04/GM-FOR-WEB-1-of-4.jpg',
    ],
    price: '99000',
    weight: 30,
  },
  {
    title: 'All Night HPR Retinoate Repair Serum',
    body_html: `<h2>All Night HPR Retinoate Repair Serum - 20gr</h2>
<p>We formulated this serum to be your "Retinol Greenflag" in the world of actives. Using 2% HPR Solution (Hydroxypinacolone Retinoate)—a next-generation retinoid—it delivers all the anti-aging and blemish-fighting benefits of traditional retinol, but with significantly lower risk of irritation or purging.</p>
<p>It's an all-in-one night reset. While HPR works on cell turnover to refine texture and fade dark spots, the blend of Palmitoyl Tripeptide-5 and Ceramide NP works to boost collagen and strengthen your skin barrier. It's effective, it's gentle, and it gets the job done while you sleep.</p>
<h3>Key Benefits:</h3>
<ul>
<li>The "Retinol Greenflag" for beginners and sensitive skin</li>
<li>Gentle yet potent night serum with 2% HPR Solution</li>
<li>Contains Peptides to target fine lines, blemishes, and texture</li>
<li>No drama of irritation or purging</li>
<li>Wake up to smoother, renewed skin</li>
</ul>
<p><strong>Size:</strong> 20gr</p>`,
    vendor: 'Plan Your Skin',
    product_type: 'Serum',
    tags: 'Plan Your Skin, Skincare, Serum, HPR, Retinol, Retinoate, Anti-Aging, Best Seller',
    images: [
      'https://planyourskin.com/wp-content/uploads/2025/05/HPR-FOR-WEB-1-of-4.jpg',
    ],
    price: '129000',
    weight: 20,
  },
  {
    title: 'Cleansing Me Gently Cleansing Serum',
    body_html: `<h2>Cleansing Me Gently Cleansing Serum - 70gr</h2>
<p>Stop choosing between clean and hydrated. You can have both. Meet your ultimate first cleanser — the first step of your double cleansing routine. Designed to melt away the day without stripping your skin barrier, its innovative gel to oil texture glides smoothly on the skin, no cotton pads needed.</p>
<p>In just 20 seconds, it dissolves waterproof makeup, SPF, and daily pollution. More than just a cleanser, it's serum infused with a high concentration of 1% Panthenol and 20% Glycerin to treat your skin while cleansing — helping lock in moisture and calm redness.</p>
<h3>Key Benefits:</h3>
<ul>
<li>Ultimate first cleanser for double cleansing routine</li>
<li>Innovative gel to oil texture, no cotton pads needed</li>
<li>Dissolves waterproof makeup, SPF, and pollution in 20 seconds</li>
<li>Infused with 1% Panthenol and 20% Glycerin</li>
<li>Treats skin while cleansing - locks moisture and calms redness</li>
<li>Skin feels clean, soft, plump, and comfortable — never tight</li>
</ul>
<p><strong>Size:</strong> 70gr</p>`,
    vendor: 'Plan Your Skin',
    product_type: 'Cleanser',
    tags: 'Plan Your Skin, Skincare, Cleanser, Cleansing Serum, Glycerin, Panthenol, Best Seller',
    images: [
      'https://planyourskin.com/wp-content/uploads/2025/12/CS-WC-Image-Thumbnail-Alt-4-copy-1024x1024.jpg',
      'https://planyourskin.com/wp-content/uploads/2025/12/CS-GM-Image-Thumbnail-Alt-4-copy-1024x1024.jpg',
    ],
    price: '79000',
    weight: 70,
  },
  {
    title: 'UV Protector Hybrid Sun Cream with Niacinamide SPF 50+ PA++++',
    body_html: `<h2>UV Protector Hybrid Sun Cream - 40gr</h2>
<p>Sun protection you'll actually want to wear. Our UV Protector Hybrid Sun Cream with Niacinamide combines the perfect synergy of the robust defense of physical blockers and the featherlight texture of chemical filters. The result? You get protection that absorbs instantly without the sticky feel or whitecast.</p>
<p>But we didn't stop at protection. Enriched with 5% Niacinamide, it goes beyond UV defense. It helps brighten and even out skin tone, while acting as a secondary shield against Blue Light from your daily gadgets. It finishes with a healthy satin glow that acts as a gripping primer, making your makeup sit perfectly all day long.</p>
<h3>Key Benefits:</h3>
<ul>
<li>Lightweight hybrid sunscreen with SPF 50+ PA++++</li>
<li>Protects against UVA & UVB</li>
<li>Infused with 5% Niacinamide to brighten skin</li>
<li>Second layer protection against Blue Light</li>
<li>Non-greasy finish with no whitecast</li>
<li>Acts as a gripping primer for makeup</li>
</ul>
<p><strong>Size:</strong> 40gr</p>`,
    vendor: 'Plan Your Skin',
    product_type: 'Sunscreen',
    tags: 'Plan Your Skin, Skincare, Sunscreen, SPF 50, Niacinamide, UV Protection, Best Seller',
    images: [
      'https://planyourskin.com/wp-content/uploads/2025/11/Genericvb-1024x694.webp',
    ],
    price: '99000',
    weight: 40,
  },
  // ===== BUNDLE PRODUCTS =====
  {
    title: 'Bundling Pack Water Cream 30ml (2 Pcs)',
    body_html: `<h2>Bundling Pack Water Cream 30ml (2 Pcs)</h2>
<p>Hemat lebih banyak dengan bundling pack! Dapatkan 2 pcs All At Once Water Cream 30ml dalam satu paket hemat.</p>
<p>All At Once Water Cream adalah moisturizer super ringan yang berubah menjadi air saat disentuh, memberikan hidrasi instan tanpa rasa berminyak. Diformulasikan dengan 5% Niacinamide dan Peptide Complex untuk mencerahkan kulit, mengontrol minyak, dan memperkuat skin barrier.</p>`,
    vendor: 'Plan Your Skin',
    product_type: 'Bundle',
    tags: 'Plan Your Skin, Skincare, Bundle, Water Cream, Promo',
    images: [
      'https://planyourskin.com/wp-content/uploads/2025/05/RES-FOR-WEB-1-of-20.jpg',
    ],
    price: '178000',
    weight: 60,
  },
  {
    title: 'Bundling Pack Gel Moisturizer 30ml (2 Pcs)',
    body_html: `<h2>Bundling Pack Gel Moisturizer 30ml (2 Pcs)</h2>
<p>Hemat lebih banyak dengan bundling pack! Dapatkan 2 pcs All At Once Gel Moisturizer 30gr dalam satu paket hemat.</p>
<p>All At Once Gel Moisturizer adalah pelembap gel ringan yang memberikan hidrasi mendalam dan menguncinya selama 24 jam. Diformulasikan dengan Matrixyl 3000™ dan Ceramide untuk memperbaiki skin barrier, menenangkan kemerahan, dan membuat kulit tampak plump dan glowing.</p>`,
    vendor: 'Plan Your Skin',
    product_type: 'Bundle',
    tags: 'Plan Your Skin, Skincare, Bundle, Gel Moisturizer, Promo',
    images: [
      'https://planyourskin.com/wp-content/uploads/2025/05/RES-FOR-WEB-5-of-20.jpg',
    ],
    price: '178000',
    weight: 60,
  },
  {
    title: 'BUNDLE HEMAT Duo Pelembap Water Cream & Gel',
    body_html: `<h2>BUNDLE HEMAT Duo Pelembap Water Cream & Gel</h2>
<p>Paket hemat yang berisi duo pelembap terbaik dari Plan Your Skin — All At Once Water Cream dan All At Once Gel Moisturizer. Cocok untuk kamu yang ingin mencoba kedua textur pelembap kami sekaligus.</p>
<ul>
<li><strong>Water Cream:</strong> Untuk pagi hari, base makeup sempurna, ringan dan matte</li>
<li><strong>Gel Moisturizer:</strong> Untuk malam hari, sleeping mask yang menutrisi kulit saat tidur</li>
</ul>`,
    vendor: 'Plan Your Skin',
    product_type: 'Bundle',
    tags: 'Plan Your Skin, Skincare, Bundle, Duo, Water Cream, Gel Moisturizer, Promo',
    images: [
      'https://planyourskin.com/wp-content/uploads/2025/05/RES-FOR-WEB-1-of-35.jpg',
    ],
    price: '178000',
    weight: 60,
  },
  {
    title: 'Daily Hustler Plan Bundle',
    body_html: `<h2>Daily Hustler Plan Bundle</h2>
<p>Paket skincare lengkap untuk daily routine kamu! Daily Hustler Plan berisi kombinasi produk Plan Your Skin yang dirancang untuk melindungi dan merawat kulit sepanjang hari.</p>
<p>Berisi:</p>
<ul>
<li>UV Protector Hybrid Sun Cream SPF 50+ PA++++ with Niacinamide</li>
<li>All At Once Gel Moisturizer</li>
</ul>
<p>Kombinasi sempurna untuk hidrasi dan proteksi UV harian!</p>`,
    vendor: 'Plan Your Skin',
    product_type: 'Bundle',
    tags: 'Plan Your Skin, Skincare, Bundle, Daily Routine, SPF, Moisturizer, Best Seller',
    images: [
      'https://planyourskin.com/wp-content/uploads/2025/07/RES-FOR-WEB-6-of-35.jpg',
      'https://planyourskin.com/wp-content/uploads/2025/07/RES-FOR-WEB-12-of-35.jpg',
    ],
    price: '178000',
    weight: 70,
  },
  {
    title: 'Sleeping Diva Plan PM Routine',
    body_html: `<h2>Sleeping Diva Plan PM Routine</h2>
<p>Paket night routine lengkap untuk kamu yang ingin bangun dengan kulit glowing dan fresh! Sleeping Diva Plan berisi produk-produk PM routine terbaik dari Plan Your Skin.</p>
<p>Dirancang khusus untuk merawat kulit saat tidur, kombinasi ini akan membantu regenerasi kulit, melembapkan intensif, dan memperbaiki skin barrier sepanjang malam.</p>`,
    vendor: 'Plan Your Skin',
    product_type: 'Bundle',
    tags: 'Plan Your Skin, Skincare, Bundle, Night Routine, PM Routine, Sleeping Mask',
    images: [
      'https://planyourskin.com/wp-content/uploads/2025/05/RES-FOR-WEB-18-of-35.jpg',
      'https://planyourskin.com/wp-content/uploads/2025/05/RES-FOR-WEB-24-of-35.jpg',
    ],
    price: '198000',
    weight: 50,
  },
  {
    title: 'Day & Night Plan',
    body_html: `<h2>Day & Night Plan</h2>
<p>Paket skincare lengkap untuk rutinitas pagi dan malam! Day & Night Plan memberikan kamu solusi perawatan kulit 24 jam dengan produk-produk terbaik dari Plan Your Skin.</p>
<p>Dengan kombinasi produk AM dan PM routine, kulit kamu akan terjaga, terhidrasi, dan terlindungi sepanjang hari dan malam.</p>`,
    vendor: 'Plan Your Skin',
    product_type: 'Bundle',
    tags: 'Plan Your Skin, Skincare, Bundle, Day Night, AM PM, Complete Routine',
    images: [
      'https://planyourskin.com/wp-content/uploads/2025/07/RES-FOR-WEB-30-of-35.jpg',
    ],
    price: '269000',
    weight: 100,
  },
  {
    title: 'Plan Your Skin 4-in-1 Daily Perfection',
    body_html: `<h2>Plan Your Skin 4-in-1 Daily Perfection</h2>
<p>All Day Plan — paket skincare 4-in-1 yang menyederhanakan rutinitas harianmu! Satu paket lengkap berisi semua yang kamu butuhkan untuk kulit sehat optimal.</p>
<p>Berisi:</p>
<ul>
<li>HPR Retinoate Serum</li>
<li>Gel/Water Cream Moisturizer</li>
<li>Hybrid Sunscreen SPF 50+ PA++++</li>
</ul>
<p>Diperkaya dengan Niacinamide, Ceramide, dan Peptide untuk peremajaan, hidrasi, dan perlindungan kulit sepanjang hari.</p>`,
    vendor: 'Plan Your Skin',
    product_type: 'Bundle',
    tags: 'Plan Your Skin, Skincare, Bundle, 4 in 1, Daily Perfection, Complete, Best Seller',
    images: [
      'https://planyourskin.com/wp-content/uploads/2025/09/RES-FOR-WEB-11-of-15.jpg',
      'https://planyourskin.com/wp-content/uploads/2025/07/RES-FOR-WEB-1-of-15.jpg',
    ],
    price: '359000',
    weight: 120,
  },
  {
    title: 'Plan Your Skin Bundling Skincare 3in1 (New All Day Plan)',
    body_html: `<h2>Plan Your Skin Bundling Skincare 3in1 - New All Day Plan</h2>
<p>Paket skincare 3-in-1 terbaru dari Plan Your Skin! New All Day Plan berisi tiga produk esensial yang telah dikurasi untuk memberikan perawatan kulit lengkap dalam satu bundling hemat.</p>
<p>Produk-produk dalam paket ini bekerja secara sinergis untuk membersihkan, menutrisi, dan melindungi kulit kamu setiap hari.</p>`,
    vendor: 'Plan Your Skin',
    product_type: 'Bundle',
    tags: 'Plan Your Skin, Skincare, Bundle, 3 in 1, All Day Plan',
    images: [
      'https://planyourskin.com/wp-content/uploads/2025/07/RES-FOR-WEB-1-of-15.jpg',
      'https://planyourskin.com/wp-content/uploads/2025/07/RES-FOR-WEB-6-of-15.jpg',
    ],
    price: '279000',
    weight: 100,
  },
  {
    title: 'Prep and Reset Duo',
    body_html: `<h2>Prep and Reset Duo</h2>
<p>Duo esensial untuk prep dan reset kulit kamu! Paket ini berisi kombinasi cleanser dan moisturizer dari Plan Your Skin — sempurna untuk langkah awal dan akhir skincare routine kamu.</p>
<p>Cleansing Me Gently membersihkan tanpa mengeringkan, sementara moisturizer mengembalikan kelembapan dan memperbaiki skin barrier.</p>`,
    vendor: 'Plan Your Skin',
    product_type: 'Bundle',
    tags: 'Plan Your Skin, Skincare, Bundle, Duo, Prep, Reset, Cleanser, Moisturizer',
    images: [
      'https://planyourskin.com/wp-content/uploads/2025/12/CS-WC-Image-Thumbnail-Alt-4-copy-1024x1024.jpg',
    ],
    price: '158000',
    weight: 100,
  },
  {
    title: 'Calm and Restore Duo',
    body_html: `<h2>Calm and Restore Duo</h2>
<p>Duo yang dirancang khusus untuk kulit sensitif dan membutuhkan penenangan! Paket Calm and Restore berisi produk-produk Plan Your Skin yang membantu menenangkan, melembapkan, dan memulihkan skin barrier.</p>
<p>Ideal untuk kulit yang sedang iritasi, kemerahan, atau butuh ekstra care.</p>`,
    vendor: 'Plan Your Skin',
    product_type: 'Bundle',
    tags: 'Plan Your Skin, Skincare, Bundle, Duo, Calm, Restore, Sensitive Skin',
    images: [
      'https://planyourskin.com/wp-content/uploads/2025/12/CS-GM-Image-Thumbnail-Alt-4-copy-1024x1024.jpg',
    ],
    price: '158000',
    weight: 100,
  },
  {
    title: 'Day and Night Plus',
    body_html: `<h2>Day and Night Plus</h2>
<p>Upgrade dari paket Day & Night biasa! Day and Night Plus memberikan kamu routine yang lebih lengkap dengan tambahan produk premium untuk hasil yang lebih optimal.</p>
<p>Paket ini berisi kombinasi lengkap produk Plan Your Skin untuk AM dan PM routine, ditambah produk ekstra untuk perawatan lebih intensif.</p>`,
    vendor: 'Plan Your Skin',
    product_type: 'Bundle',
    tags: 'Plan Your Skin, Skincare, Bundle, Day Night Plus, Complete Routine, Premium',
    images: [
      'https://planyourskin.com/wp-content/uploads/2026/03/day-and-night-plus-1024x1024.webp',
    ],
    price: '329000',
    weight: 120,
  },
  {
    title: 'Hustler Starter (Gel, Cleansing, SPF)',
    body_html: `<h2>Hustler Starter (Gel, Cleansing, SPF)</h2>
<p>Starter pack untuk kamu yang baru mulai skincare journey! Hustler Starter berisi 3 produk esensial yang kamu butuhkan:</p>
<ul>
<li><strong>All At Once Gel Moisturizer</strong> - Hidrasi mendalam 24 jam</li>
<li><strong>Cleansing Me Gently Cleansing Serum</strong> - Pembersih lembut multi-fungsi</li>
<li><strong>UV Protector SPF 50+ PA++++</strong> - Perlindungan UV ringan tanpa whitecast</li>
</ul>
<p>Langkah pertama menuju kulit sehat yang optimal!</p>`,
    vendor: 'Plan Your Skin',
    product_type: 'Bundle',
    tags: 'Plan Your Skin, Skincare, Bundle, Starter, 3 in 1, Beginner',
    images: [
      'https://planyourskin.com/wp-content/uploads/2026/03/Hustle-Starter-1-1024x1024.webp',
      'https://planyourskin.com/wp-content/uploads/2026/03/Hustle-Starter-2-1024x1024.webp',
    ],
    price: '239000',
    weight: 140,
  },
  {
    title: 'Essentials All in One (5 in 1)',
    body_html: `<h2>Essentials All in One (5 in 1)</h2>
<p>Paket terlengkap dari Plan Your Skin! Essentials All in One berisi SEMUA 5 produk inti Plan Your Skin dalam satu bundling super hemat:</p>
<ul>
<li><strong>Cleansing Me Gently Cleansing Serum</strong> (70gr)</li>
<li><strong>All Night HPR Retinoate Repair Serum</strong> (20gr)</li>
<li><strong>All At Once Water Cream</strong> (30ml)</li>
<li><strong>All At Once Gel Moisturizer</strong> (30gr)</li>
<li><strong>UV Protector Hybrid Sun Cream SPF 50+ PA++++</strong> (40gr)</li>
</ul>
<p>Solusi lengkap untuk perawatan kulit dari pagi hingga malam. #IntinyaAjaCukup</p>`,
    vendor: 'Plan Your Skin',
    product_type: 'Bundle',
    tags: 'Plan Your Skin, Skincare, Bundle, 5 in 1, Complete, All in One, Best Value',
    images: [
      'https://planyourskin.com/wp-content/uploads/2026/03/5-in-1-1024x1024.webp',
    ],
    price: '449000',
    weight: 190,
  },
  {
    title: 'Take the Day Off Bundle',
    body_html: `<h2>Take the Day Off Bundle</h2>
<p>Paket sempurna untuk ritual "take the day off" — bersihkan dan rawat kulit setelah seharian beraktivitas! Bundle ini berisi produk-produk yang bekerja sinergis untuk:</p>
<ul>
<li>Membersihkan makeup dan kotoran harian secara mendalam</li>
<li>Menutrisi dan memperbaiki kulit saat malam</li>
<li>Mempersiapkan kulit untuk regenerasi selama tidur</li>
</ul>
<p>Bangun dengan kulit yang terasa bersih, segar, dan terhidrasi sempurna!</p>`,
    vendor: 'Plan Your Skin',
    product_type: 'Bundle',
    tags: 'Plan Your Skin, Skincare, Bundle, Take the Day Off, Night, Cleansing',
    images: [
      'https://planyourskin.com/wp-content/uploads/2026/03/Take-the-day-off-bundling-1024x1024.webp',
      'https://planyourskin.com/wp-content/uploads/2026/03/Take-The-Day-Off-Bundling-2-1024x1024.webp',
    ],
    price: '198000',
    weight: 100,
  },
  {
    title: 'Essentials 4 in 1 (Gel, SPF, HPR, Cleansing)',
    body_html: `<h2>Essentials 4 in 1 (Gel, SPF, HPR, Cleansing)</h2>
<p>Paket esensial 4-in-1 dengan pilihan produk yang dikurasi untuk routine yang lebih lengkap! Berisi:</p>
<ul>
<li><strong>All At Once Gel Moisturizer</strong> - Hidrasi dan sleeping mask</li>
<li><strong>UV Protector SPF 50+ PA++++</strong> - Perlindungan UV harian</li>
<li><strong>All Night HPR Retinoate Repair Serum</strong> - Serum anti-aging malam</li>
<li><strong>Cleansing Me Gently Cleansing Serum</strong> - Pembersih lembut</li>
</ul>
<p>4 langkah sederhana untuk kulit sehat yang optimal setiap hari!</p>`,
    vendor: 'Plan Your Skin',
    product_type: 'Bundle',
    tags: 'Plan Your Skin, Skincare, Bundle, 4 in 1, Essentials, Complete',
    images: [
      'https://planyourskin.com/wp-content/uploads/2026/03/Essential-4-in-1-B-1024x1024.webp',
    ],
    price: '369000',
    weight: 160,
  },
  {
    title: 'PROMO HEMAT Bundling All Night HPR Retinoate Repair Serum (Free Gel Moisturizer)',
    body_html: `<h2>PROMO HEMAT - All Night HPR Retinoate Repair Serum + FREE Gel Moisturizer</h2>
<p>Promo spesial! Dapatkan All Night HPR Retinoate Repair Serum dan GRATIS All At Once Gel Moisturizer!</p>
<p>Kombinasi sempurna untuk night routine yang efektif:</p>
<ul>
<li><strong>All Night HPR Retinoate Repair Serum</strong> - Serum retinol gentle yang bekerja saat kamu tidur</li>
<li><strong>All At Once Gel Moisturizer (FREE)</strong> - Pelembap gel yang mengunci active ingredients dan menghidrasi</li>
</ul>
<p>Gunakan HPR Serum terlebih dahulu, lalu seal dengan Gel Moisturizer untuk hasil maksimal!</p>`,
    vendor: 'Plan Your Skin',
    product_type: 'Bundle',
    tags: 'Plan Your Skin, Skincare, Bundle, Promo, HPR, Serum, Free, Gel Moisturizer',
    images: [
      'https://planyourskin.com/wp-content/uploads/2025/12/RES-FOR-WEB-9-of-20.jpg',
    ],
    price: '129000',
    weight: 50,
  },
];

// Create product on Shopify
async function createShopifyProduct(productData) {
  console.log(`\n🚀 Uploading: ${productData.title}`);
  
  const shopifyProduct = {
    product: {
      title: productData.title,
      body_html: productData.body_html,
      vendor: productData.vendor,
      product_type: productData.product_type,
      tags: productData.tags,
      status: 'active',
      variants: [
        {
          price: (parseInt(productData.price) / 1).toString(), // already in IDR whole number
          inventory_management: null,
          inventory_policy: 'continue',
          requires_shipping: true,
          taxable: true,
          weight: productData.weight,
          weight_unit: 'g',
        }
      ],
      images: productData.images.map((src, i) => ({
        src: src,
        position: i + 1,
      })),
    }
  };

  try {
    const response = await fetch(
      `https://${SHOPIFY_STORE}/admin/api/2024-01/products.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': SHOPIFY_API_KEY,
        },
        body: JSON.stringify(shopifyProduct),
      }
    );

    const responseText = await response.text();
    
    if (!response.ok) {
      console.error(`   ❌ Error (${response.status}): ${responseText.substring(0, 200)}`);
      return false;
    }

    const result = JSON.parse(responseText);
    console.log(`   ✅ Success! ID: ${result.product.id} — ${result.product.title}`);
    return true;
  } catch (error) {
    console.error(`   ❌ Error: ${error.message}`);
    return false;
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('🌿 Plan Your Skin → Shopify Product Uploader');
  console.log('='.repeat(60));
  console.log(`Store: ${SHOPIFY_STORE}`);
  console.log(`Total products: ${PRODUCTS.length}`);
  console.log('='.repeat(60));

  let success = 0;
  let failed = 0;

  for (let i = 0; i < PRODUCTS.length; i++) {
    const product = PRODUCTS[i];
    console.log(`\n[${i + 1}/${PRODUCTS.length}]`);
    
    const result = await createShopifyProduct(product);
    if (result) {
      success++;
    } else {
      failed++;
    }
    
    // Respect Shopify rate limits (2 req/s for basic plan)
    await delay(600);
  }

  console.log('\n\n' + '='.repeat(60));
  console.log('📊 HASIL UPLOAD');
  console.log('='.repeat(60));
  console.log(`✅ Berhasil: ${success}/${PRODUCTS.length}`);
  console.log(`❌ Gagal: ${failed}/${PRODUCTS.length}`);
  console.log('='.repeat(60));
  console.log('\n🎉 Selesai!');
}

main().catch(console.error);
