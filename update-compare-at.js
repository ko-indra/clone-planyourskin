const fetch = require('node-fetch');
const cheerio = require('cheerio');
require('dotenv').config();

const SHOPIFY_STORE = process.env.SHOPIFY_STORE || 'planyourskin.myshopify.com';
const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY;

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Product URLs to scrape prices from
const PRODUCT_PAGES = [
  'https://www.planyourskin.com/product/all-at-once-water-cream/',
  'https://www.planyourskin.com/product/all-at-once-gel-moisturizer/',
  'https://www.planyourskin.com/product/plan-your-skin-all-night-hpr-retinoate-repair-serum/',
  'https://www.planyourskin.com/product/cleansing-serum-facial-cleanser-lembut-hapus-makeup-kotoran-deep-cleansing-aman-untuk-kulit-sensitif-melembapkan-24-jam/',
  'https://www.planyourskin.com/product/plan-your-skin-spf-50-pa-niacinamide-hybrid-uv-protector-approve-by-bpom/',
];

// Scrape prices from a product page
async function scrapePrice(url) {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      }
    });
    const html = await response.text();
    const $ = cheerio.load(html);

    // Try to get prices from JSON-LD structured data
    let regularPrice = null;
    let salePrice = null;

    $('script[type="application/ld+json"]').each((i, el) => {
      try {
        const jsonText = $(el).html();
        const json = JSON.parse(jsonText);
        if (json['@type'] === 'Product' && json.offers) {
          const offers = Array.isArray(json.offers) ? json.offers : [json.offers];
          for (const offer of offers) {
            if (offer.price) {
              regularPrice = parseFloat(offer.price);
            }
          }
        }
      } catch (e) {}
    });

    // Try WooCommerce price HTML structure
    // Regular price (inside <del> tag = strikethrough = original price)
    const delPrice = $('p.price del .woocommerce-Price-amount, .summary del .woocommerce-Price-amount').first().text();
    // Sale price (inside <ins> tag = actual selling price)
    const insPrice = $('p.price ins .woocommerce-Price-amount, .summary ins .woocommerce-Price-amount').first().text();
    // Single price (no sale)
    const singlePrice = $('p.price > .woocommerce-Price-amount, p.price > span > .woocommerce-Price-amount').first().text();

    if (delPrice && insPrice) {
      regularPrice = parseFloat(delPrice.replace(/[^\d]/g, ''));
      salePrice = parseFloat(insPrice.replace(/[^\d]/g, ''));
    } else if (singlePrice) {
      regularPrice = parseFloat(singlePrice.replace(/[^\d]/g, ''));
    }

    // Also try to extract from raw HTML with regex
    if (!regularPrice) {
      // Look for price patterns like "Rp 99.000" or "99000" or "99.000"
      const priceMatches = html.match(/class="woocommerce-Price-amount[^"]*"[^>]*>.*?(\d[\d.,]+)/g);
      if (priceMatches && priceMatches.length > 0) {
        const prices = priceMatches.map(m => {
          const numMatch = m.match(/(\d[\d.,]+)/);
          return numMatch ? parseFloat(numMatch[1].replace(/\./g, '').replace(',', '.')) : 0;
        }).filter(p => p > 0);
        
        if (prices.length >= 2) {
          // First is usually regular (del), second is sale (ins)
          regularPrice = Math.max(...prices);
          salePrice = Math.min(...prices);
        } else if (prices.length === 1) {
          regularPrice = prices[0];
        }
      }
    }

    // Try meta tags
    if (!regularPrice) {
      const metaPrice = $('meta[property="product:price:amount"]').attr('content');
      if (metaPrice) regularPrice = parseFloat(metaPrice);
    }

    return { regularPrice, salePrice, url };
  } catch (error) {
    console.error(`   Error scraping ${url}: ${error.message}`);
    return { regularPrice: null, salePrice: null, url };
  }
}

// Get all products from Shopify
async function getShopifyProducts() {
  let allProducts = [];
  let url = `https://${SHOPIFY_STORE}/admin/api/2024-01/products.json?limit=250`;
  
  while (url) {
    const response = await fetch(url, {
      headers: {
        'X-Shopify-Access-Token': SHOPIFY_API_KEY,
      }
    });
    
    if (!response.ok) {
      console.error(`Error fetching products: ${response.status} ${await response.text()}`);
      break;
    }
    
    const data = await response.json();
    allProducts = allProducts.concat(data.products);
    
    // Check for pagination
    const linkHeader = response.headers.get('link');
    if (linkHeader && linkHeader.includes('rel="next"')) {
      const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
      url = nextMatch ? nextMatch[1] : null;
    } else {
      url = null;
    }
  }
  
  return allProducts;
}

// Update a product variant with compare_at_price
async function updateVariant(variantId, price, compareAtPrice) {
  const response = await fetch(
    `https://${SHOPIFY_STORE}/admin/api/2024-01/variants/${variantId}.json`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': SHOPIFY_API_KEY,
      },
      body: JSON.stringify({
        variant: {
          id: variantId,
          price: price.toString(),
          compare_at_price: compareAtPrice.toString(),
        }
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`${response.status}: ${errorText.substring(0, 200)}`);
  }

  return await response.json();
}

async function main() {
  console.log('='.repeat(60));
  console.log('🏷️  Update Compare-At Prices from planyourskin.com');
  console.log('='.repeat(60));

  // Step 1: Scrape prices from website
  console.log('\n📋 STEP 1: Scraping prices from planyourskin.com...\n');
  
  const scrapedPrices = [];
  for (const url of PRODUCT_PAGES) {
    console.log(`   Scraping: ${url.split('/product/')[1].replace(/\//g, '')}`);
    const result = await scrapePrice(url);
    scrapedPrices.push(result);
    console.log(`   → Regular: Rp ${result.regularPrice?.toLocaleString('id-ID') || 'N/A'} | Sale: Rp ${result.salePrice?.toLocaleString('id-ID') || 'N/A'}`);
    await delay(800);
  }

  // Also scrape the shop page to get all prices in one go
  console.log('\n   Scraping shop page for additional prices...');
  try {
    const shopResponse = await fetch('https://www.planyourskin.com/shop/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      }
    });
    const shopHtml = await shopResponse.text();
    const $shop = cheerio.load(shopHtml);
    
    // Extract all product prices from shop listing
    $shop('.products .product, .product-grid-item, li.product').each((i, el) => {
      const title = $shop(el).find('.woocommerce-loop-product__title, h2, .product-title').text().trim();
      const delPrice = $shop(el).find('del .woocommerce-Price-amount').first().text().replace(/[^\d]/g, '');
      const insPrice = $shop(el).find('ins .woocommerce-Price-amount').first().text().replace(/[^\d]/g, '');
      const singlePrice = $shop(el).find('.price .woocommerce-Price-amount').first().text().replace(/[^\d]/g, '');
      
      if (title) {
        console.log(`   Found: ${title} → Reg: ${delPrice || singlePrice || 'N/A'} | Sale: ${insPrice || 'N/A'}`);
      }
    });
  } catch (e) {
    console.log(`   Shop page scraping error: ${e.message}`);
  }

  // Step 2: Get all Shopify products
  console.log('\n\n📋 STEP 2: Fetching existing Shopify products...\n');
  const shopifyProducts = await getShopifyProducts();
  console.log(`   Found ${shopifyProducts.length} products on Shopify\n`);

  // Step 3: Define the correct pricing from the website
  // Based on scraped data and website analysis
  console.log('\n📋 STEP 3: Updating compare-at prices on Shopify...\n');

  // Map product titles to their correct pricing
  // Price = selling price, CompareAt = original price (strikethrough)
  const pricingMap = {};
  
  // From scraped data
  for (const scraped of scrapedPrices) {
    if (scraped.regularPrice && scraped.salePrice) {
      // Map URL to title later
      pricingMap[scraped.url] = {
        price: scraped.salePrice,
        compareAt: scraped.regularPrice,
      };
    }
  }

  // Log what we found
  console.log('   Scraped pricing data:');
  for (const [url, pricing] of Object.entries(pricingMap)) {
    const slug = url.split('/product/')[1]?.replace(/\//g, '') || url;
    console.log(`   • ${slug}: Sell Rp ${pricing.price.toLocaleString('id-ID')} (was Rp ${pricing.compareAt.toLocaleString('id-ID')})`);
  }

  // Now update each Shopify product
  let updated = 0;
  let failed = 0;

  for (const product of shopifyProducts) {
    const variant = product.variants[0];
    if (!variant) continue;

    const currentPrice = parseFloat(variant.price);
    
    // Try to find matching scraped price
    let matchedPricing = null;
    
    // Match by title keywords
    const titleLower = product.title.toLowerCase();
    
    for (const [url, pricing] of Object.entries(pricingMap)) {
      const urlSlug = url.split('/product/')[1]?.replace(/\//g, '').replace(/-/g, ' ') || '';
      if (titleLower.includes('water cream') && urlSlug.includes('water cream')) {
        matchedPricing = pricing;
        break;
      }
      if (titleLower.includes('gel moisturizer') && urlSlug.includes('gel moisturizer')) {
        matchedPricing = pricing;
        break;
      }
      if ((titleLower.includes('hpr') || titleLower.includes('retinoate')) && urlSlug.includes('retinoate')) {
        matchedPricing = pricing;
        break;
      }
      if (titleLower.includes('cleansing') && urlSlug.includes('cleansing')) {
        matchedPricing = pricing;
        break;
      }
      if ((titleLower.includes('uv protector') || titleLower.includes('spf')) && urlSlug.includes('spf')) {
        matchedPricing = pricing;
        break;
      }
    }

    // If no specific match, create a reasonable compare-at based on product type
    if (!matchedPricing) {
      // For bundles, add ~30-40% markup as compare-at
      const markup = currentPrice > 200000 ? 1.35 : 1.30;
      const compareAt = Math.ceil(currentPrice * markup / 1000) * 1000;
      matchedPricing = {
        price: currentPrice,
        compareAt: compareAt,
      };
    }

    try {
      console.log(`   Updating: ${product.title}`);
      console.log(`      Price: Rp ${matchedPricing.price.toLocaleString('id-ID')} → Compare-at: Rp ${matchedPricing.compareAt.toLocaleString('id-ID')}`);
      
      await updateVariant(variant.id, matchedPricing.price, matchedPricing.compareAt);
      console.log(`      ✅ Updated!`);
      updated++;
    } catch (error) {
      console.error(`      ❌ Error: ${error.message}`);
      failed++;
    }

    await delay(500);
  }

  console.log('\n\n' + '='.repeat(60));
  console.log('📊 HASIL UPDATE');
  console.log('='.repeat(60));
  console.log(`✅ Berhasil update: ${updated}`);
  console.log(`❌ Gagal: ${failed}`);
  console.log('='.repeat(60));
  console.log('\n🎉 Selesai! Compare-at prices sudah ditambahkan.');
}

main().catch(console.error);
