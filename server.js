require('dotenv').config();
const express = require('express');
const path = require('path');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
const { OAuth2Client } = require('google-auth-library');

const app = express();
const PORT = process.env.PORT || 3000;

// Google Auth Client
const googleClient = process.env.GOOGLE_CLIENT_ID ? new OAuth2Client(process.env.GOOGLE_CLIENT_ID) : null;

// Shopify Storefront API config from .env
const SHOPIFY_CONFIG = {
  domain: process.env.SHOPIFY_STORE_DOMAIN,
  storefrontAccessToken: process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN
};

// Set EJS as template engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middlewares
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(cookieParser());

// Category data for the homepage grid
const CATEGORIES = [
  { name: 'Brightening Heroes', slug: 'brightening-heroes', image: '/assets/cat-brightening.webp' },
  { name: 'Value Bundles', slug: 'value-bundles', image: '/assets/cat-bundles.webp' },
  { name: 'The Essentials Kit', slug: 'the-essentials-kit', image: '/assets/cat-essentials.webp' },
  { name: 'Slow Aging Series', slug: 'slow-aging-series', image: '/assets/cat-slowaging.webp' }
];

// ========================================
// Shopify Storefront API Helper
// ========================================
async function shopifyStorefrontQuery(query, variables = {}) {
  const url = `https://${SHOPIFY_CONFIG.domain}/api/2024-10/graphql.json`;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Storefront-Access-Token': SHOPIFY_CONFIG.storefrontAccessToken
      },
      body: JSON.stringify({ query, variables })
    });
    
    if (!response.ok) {
      throw new Error(`Shopify API error: ${response.status}`);
    }
    
    const data = await response.json();
    if (data.errors) {
      console.error('Shopify GraphQL errors:', data.errors);
      throw new Error(data.errors[0].message);
    }
    return data.data;
  } catch (error) {
    console.error('Shopify API request failed:', error.message);
    return null;
  }
}

// Placeholder image for products without images
const PLACEHOLDER_IMAGE = '/assets/placeholder.svg';

// Fetch all products from Shopify (pure Shopify data, no local fallback)
async function fetchShopifyProducts() {
  const query = `
    {
      products(first: 50) {
        edges {
          node {
            id
            title
            handle
            description
            productType
            tags
            images(first: 5) {
              edges {
                node {
                  url
                  altText
                }
              }
            }
            variants(first: 5) {
              edges {
                node {
                  id
                  title
                  price {
                    amount
                    currencyCode
                  }
                  compareAtPrice {
                    amount
                    currencyCode
                  }
                }
              }
            }
          }
        }
      }
    }
  `;
  
  const data = await shopifyStorefrontQuery(query);
  if (!data || !data.products) return null;
  
  return data.products.edges.map(({ node }) => {
    const variant = node.variants.edges[0]?.node;
    const price = variant ? parseFloat(variant.price.amount) : 0;
    const compareAtPrice = variant?.compareAtPrice ? parseFloat(variant.compareAtPrice.amount) : null;
    const images = node.images.edges.map(e => e.node.url);
    
    let discount = null;
    if (compareAtPrice && compareAtPrice > price) {
      discount = Math.round((1 - price / compareAtPrice) * 100);
    }
    
    return {
      id: node.id,
      name: node.title,
      slug: node.handle,
      category: node.productType ? [node.productType] : ['Skincare'],
      price: compareAtPrice || price,
      salePrice: compareAtPrice ? price : null,
      discount,
      image: images[0] || PLACEHOLDER_IMAGE,
      hoverImage: images[1] || images[0] || PLACEHOLDER_IMAGE,
      description: node.description || '',
      rating: 5,
      concerns: node.tags.filter(t => ['Acne Prone', 'Sensitive Skin', 'Blemish', 'PIH', 'PIE', 'Large Pores'].includes(t)),
      ingredients: node.tags.filter(t => ['Niacinamide', 'HPR Retinoate', 'Glycerin', 'Ceramide'].includes(t)),
      bestSeller: node.tags.includes('Best Seller') || node.tags.includes('bestseller'),
      shopifyVariantId: variant?.id || null
    };
  });
}

// Fetch single product from Shopify (pure Shopify data)
async function fetchShopifyProduct(handle) {
  const query = `
    query getProduct($handle: String!) {
      productByHandle(handle: $handle) {
        id
        title
        handle
        description
        descriptionHtml
        productType
        tags
        images(first: 10) {
          edges {
            node {
              url
              altText
            }
          }
        }
        variants(first: 10) {
          edges {
            node {
              id
              title
              price {
                amount
                currencyCode
              }
              compareAtPrice {
                amount
                currencyCode
              }
              availableForSale
            }
          }
        }
      }
    }
  `;
  
  const data = await shopifyStorefrontQuery(query, { handle });
  if (!data || !data.productByHandle) return null;
  
  const node = data.productByHandle;
  const variant = node.variants.edges[0]?.node;
  const price = variant ? parseFloat(variant.price.amount) : 0;
  const compareAtPrice = variant?.compareAtPrice ? parseFloat(variant.compareAtPrice.amount) : null;
  const images = node.images.edges.map(e => e.node.url);
  
  let discount = null;
  if (compareAtPrice && compareAtPrice > price) {
    discount = Math.round((1 - price / compareAtPrice) * 100);
  }
  
  return {
    id: node.id,
    name: node.title,
    slug: node.handle,
    category: node.productType ? [node.productType] : ['Skincare'],
    price: compareAtPrice || price,
    salePrice: compareAtPrice ? price : null,
    discount,
    image: images[0] || PLACEHOLDER_IMAGE,
    hoverImage: images[1] || images[0] || PLACEHOLDER_IMAGE,
    description: node.description || '',
    descriptionHtml: node.descriptionHtml || '',
    rating: 5,
    concerns: node.tags.filter(t => ['Acne Prone', 'Sensitive Skin', 'Blemish', 'PIH', 'PIE', 'Large Pores'].includes(t)),
    ingredients: node.tags.filter(t => ['Niacinamide', 'HPR Retinoate', 'Glycerin', 'Ceramide'].includes(t)),
    bestSeller: node.tags.includes('Best Seller') || node.tags.includes('bestseller'),
    shopifyVariantId: variant?.id || null,
    allImages: images,
    variants: node.variants.edges.map(({ node: v }) => ({
      id: v.id,
      title: v.title,
      price: parseFloat(v.price.amount),
      compareAtPrice: v.compareAtPrice ? parseFloat(v.compareAtPrice.amount) : null,
      available: v.availableForSale
    }))
  };
}

// Helper to format IDR
function formatPrice(price) {
  return 'Rp' + Math.round(price).toLocaleString('id-ID');
}

// ========================================
// Authentication APIs
// ========================================

app.post('/api/auth/register', async (req, res) => {
  const { firstName, lastName, email, password } = req.body;
  const query = `
    mutation customerCreate($input: CustomerCreateInput!) {
      customerCreate(input: $input) {
        customer { id firstName lastName email }
        customerUserErrors { field message }
      }
    }
  `;
  const variables = { input: { firstName, lastName, email, password } };
  const data = await shopifyStorefrontQuery(query, variables);
  
  if (!data || !data.customerCreate) return res.status(500).json({ error: 'Shopify API error' });
  
  const errors = data.customerCreate.customerUserErrors;
  if (errors && errors.length > 0) return res.status(400).json({ error: errors[0].message });
  
  res.json({ success: true, customer: data.customerCreate.customer });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const query = `
    mutation customerAccessTokenCreate($input: CustomerAccessTokenCreateInput!) {
      customerAccessTokenCreate(input: $input) {
        customerAccessToken { accessToken expiresAt }
        customerUserErrors { field message }
      }
    }
  `;
  const variables = { input: { email, password } };
  const data = await shopifyStorefrontQuery(query, variables);

  if (!data || !data.customerAccessTokenCreate) return res.status(500).json({ error: 'Shopify API error' });

  const tokenData = data.customerAccessTokenCreate.customerAccessToken;
  if (!tokenData) {
    const error = data.customerAccessTokenCreate.customerUserErrors[0]?.message || 'Invalid credentials';
    return res.status(401).json({ error });
  }

  res.cookie('shopify_customer_token', tokenData.accessToken, { httpOnly: true, secure: process.env.NODE_ENV === 'production', maxAge: 30 * 24 * 60 * 60 * 1000 });
  res.json({ success: true, token: tokenData.accessToken });
});

app.post('/api/auth/google', async (req, res) => {
  const { credential } = req.body;
  if (!googleClient) return res.status(500).json({ error: 'Google Client ID is not configured.' });
  
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const { email, given_name, family_name, sub } = payload;
    
    // Generate deterministic password
    const generatedPassword = crypto.createHmac('sha256', process.env.SESSION_SECRET || 'fallback_secret')
                                    .update(sub)
                                    .digest('hex').substring(0, 16) + 'G!';

    // Attempt login
    let loginData = await shopifyStorefrontQuery(`
      mutation customerAccessTokenCreate($input: CustomerAccessTokenCreateInput!) {
        customerAccessTokenCreate(input: $input) {
          customerAccessToken { accessToken expiresAt }
          customerUserErrors { field message }
        }
      }
    `, { input: { email, password: generatedPassword } });

    let tokenData = loginData?.customerAccessTokenCreate?.customerAccessToken;

    // Attempt registration if login failed
    if (!tokenData) {
      const regData = await shopifyStorefrontQuery(`
        mutation customerCreate($input: CustomerCreateInput!) {
          customerCreate(input: $input) {
            customer { id }
            customerUserErrors { field message }
          }
        }
      `, { input: { firstName: given_name, lastName: family_name, email, password: generatedPassword } });
      
      const regErrors = regData?.customerCreate?.customerUserErrors;
      if (regErrors && regErrors.length > 0) {
        return res.status(400).json({ error: "Email clearly registered. Please use manual login or try again." });
      }

      // Re-login
      loginData = await shopifyStorefrontQuery(`
        mutation customerAccessTokenCreate($input: CustomerAccessTokenCreateInput!) {
          customerAccessTokenCreate(input: $input) {
            customerAccessToken { accessToken expiresAt }
          }
        }
      `, { input: { email, password: generatedPassword } });
      tokenData = loginData?.customerAccessTokenCreate?.customerAccessToken;
    }

    if (!tokenData) throw new Error("Could not authenticate Google user.");

    res.cookie('shopify_customer_token', tokenData.accessToken, { httpOnly: true, secure: process.env.NODE_ENV === 'production', maxAge: 30 * 24 * 60 * 60 * 1000 });
    res.json({ success: true, token: tokenData.accessToken, firstName: given_name });
  } catch (error) {
    console.error('Google Auth Error:', error);
    res.status(401).json({ error: error.message });
  }
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('shopify_customer_token');
  res.json({ success: true });
});

// Middleware to inject user state
app.use(async (req, res, next) => {
  const token = req.cookies.shopify_customer_token;
  res.locals.customer = null;
  res.locals.googleClientId = process.env.GOOGLE_CLIENT_ID;
  
  if (token) {
    const query = `
      query {
        customer(customerAccessToken: "${token}") {
          id
          firstName
          lastName
          email
        }
      }
    `;
    const data = await shopifyStorefrontQuery(query);
    if (data && data.customer) {
      res.locals.customer = data.customer;
    } else {
      res.clearCookie('shopify_customer_token'); // Token invalid/expired
    }
  }
  next();
});

// ========================================
// API Routes (for Shopify Cart / Checkout)
// ========================================

// Create Shopify cart
app.post('/api/cart/create', async (req, res) => {
  const query = `
    mutation cartCreate($input: CartInput!) {
      cartCreate(input: $input) {
        cart {
          id
          checkoutUrl
          lines(first: 10) {
            edges {
              node {
                id
                quantity
                merchandise {
                  ... on ProductVariant {
                    id
                    title
                    price {
                      amount
                    }
                    product {
                      title
                      images(first: 1) {
                        edges {
                          node { url }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
          cost {
            totalAmount { amount currencyCode }
            subtotalAmount { amount currencyCode }
          }
        }
        userErrors { field message }
      }
    }
  `;
  
  const { variantId, quantity = 1 } = req.body;
  const variables = {
    input: {
      lines: [{ merchandiseId: variantId, quantity }]
    }
  };
  
  const data = await shopifyStorefrontQuery(query, variables);
  if (!data) return res.status(500).json({ error: 'Failed to create cart' });
  
  res.json(data.cartCreate);
});

// Add item to cart
app.post('/api/cart/add', async (req, res) => {
  const query = `
    mutation cartLinesAdd($cartId: ID!, $lines: [CartLineInput!]!) {
      cartLinesAdd(cartId: $cartId, lines: $lines) {
        cart {
          id
          checkoutUrl
          lines(first: 20) {
            edges {
              node {
                id
                quantity
                merchandise {
                  ... on ProductVariant {
                    id
                    title
                    price {
                      amount
                    }
                    product {
                      title
                      images(first: 1) {
                        edges {
                          node { url }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
          cost {
            totalAmount { amount currencyCode }
            subtotalAmount { amount currencyCode }
          }
        }
        userErrors { field message }
      }
    }
  `;
  
  const { cartId, variantId, quantity = 1 } = req.body;
  const variables = {
    cartId,
    lines: [{ merchandiseId: variantId, quantity }]
  };
  
  const data = await shopifyStorefrontQuery(query, variables);
  if (!data) return res.status(500).json({ error: 'Failed to add to cart' });
  
  res.json(data.cartLinesAdd);
});

// Update cart lines
app.post('/api/cart/update', async (req, res) => {
  const query = `
    mutation cartLinesUpdate($cartId: ID!, $lines: [CartLineUpdateInput!]!) {
      cartLinesUpdate(cartId: $cartId, lines: $lines) {
        cart {
          id
          totalQuantity
          cost {
            subtotalAmount { amount currencyCode }
          }
        }
        userErrors { field message }
      }
    }
  `;
  const { cartId, lineId, quantity } = req.body;
  const variables = {
    cartId,
    lines: [{ id: lineId, quantity }]
  };
  const data = await shopifyStorefrontQuery(query, variables);
  if (!data) return res.status(500).json({ error: 'Failed to update cart' });
  res.json(data.cartLinesUpdate);
});

// Remove cart lines
app.post('/api/cart/remove', async (req, res) => {
  const query = `
    mutation cartLinesRemove($cartId: ID!, $lineIds: [ID!]!) {
      cartLinesRemove(cartId: $cartId, lineIds: $lineIds) {
        cart {
          id
          totalQuantity
          cost {
            subtotalAmount { amount currencyCode }
          }
        }
        userErrors { field message }
      }
    }
  `;
  const { cartId, lineId } = req.body;
  const variables = {
    cartId,
    lineIds: [lineId]
  };
  const data = await shopifyStorefrontQuery(query, variables);
  if (!data) return res.status(500).json({ error: 'Failed to remove from cart' });
  res.json(data.cartLinesRemove);
});

// Get cart
app.get('/api/cart/:cartId', async (req, res) => {
  const query = `
    query getCart($cartId: ID!) {
      cart(id: $cartId) {
        id
        checkoutUrl
        totalQuantity
        lines(first: 20) {
          edges {
            node {
              id
              quantity
              merchandise {
                ... on ProductVariant {
                  id
                  title
                  price {
                    amount
                  }
                  product {
                    title
                    images(first: 1) {
                      edges {
                        node { url }
                      }
                    }
                  }
                }
              }
            }
          }
        }
        cost {
          totalAmount { amount currencyCode }
          subtotalAmount { amount currencyCode }
        }
      }
    }
  `;
  
  const data = await shopifyStorefrontQuery(query, { cartId: req.params.cartId });
  if (!data) return res.status(500).json({ error: 'Failed to get cart' });
  
  res.json(data);
});

// iPaymu Integration Route
app.post('/api/checkout/ipaymu', async (req, res) => {
  try {
    const { cartId, customer } = req.body;
    if (!cartId) return res.status(400).json({ error: 'Missing cartId' });
    if (!process.env.IPAYMU_VA || !process.env.IPAYMU_API_KEY) {
       return res.status(500).json({ error: 'iPaymu credentials missing in server config' });
    }
    
    // 1. Get cart details to calculate exact total amount
    const query = `
      query getCart($cartId: ID!) {
        cart(id: $cartId) {
          id
          lines(first: 20) {
            edges { node { merchandise { ... on ProductVariant { title product { title } } } quantity } }
          }
          cost { subtotalAmount { amount } }
        }
      }
    `;
    const cartData = await shopifyStorefrontQuery(query, { cartId });
    if (!cartData || !cartData.cart) throw new Error('Cart not found in Shopify');
    
    const subtotal = parseFloat(cartData.cart.cost.subtotalAmount.amount);
    const fee = 2500;
    const totalAmount = subtotal + fee;

    // 2. Prepare iPaymu Payload
    const ipaymuVa = process.env.IPAYMU_VA;
    const ipaymuApiKey = process.env.IPAYMU_API_KEY;
    const ipaymuUrl = process.env.IPAYMU_URL || 'https://sandbox.ipaymu.com';
    
    // For references, usually max string length apply, just slice cartId loosely
    const refId = cartId.replace('gid://shopify/Cart/', '').substring(0, 20);
    const buyerName = customer.firstName + (customer.lastName ? ' ' + customer.lastName : '');
    
    const payload = {
      product: ['Plan Your Skin Order - ' + refId],
      qty: ['1'],
      price: [Math.round(totalAmount).toString()],
      description: ['Shopify Cart Checkout via Custom Gateway'],
      returnUrl: `http://localhost:3000/checkout`,
      notifyUrl: `http://localhost:3000/api/payment/callback`,
      cancelUrl: `http://localhost:3000/cart`,
      buyerName: buyerName.trim() || 'Guest Customer',
      buyerEmail: customer.email || 'guest@planyourskin.com',
      buyerPhone: customer.phone || '08000000000',
      referenceId: refId
    };
    
    const jsonBody = JSON.stringify(payload);
    
    // 3. Generate HMAC SHA256 Signature
    const hashBody = crypto.createHash('sha256').update(jsonBody).digest('hex').toLowerCase();
    const stringToSign = `POST:${ipaymuVa}:${hashBody}:${ipaymuApiKey}`;
    const signature = crypto.createHmac('sha256', ipaymuApiKey).update(stringToSign).digest('hex');
    
    const now = new Date();
    const timestamp = now.getFullYear().toString() + 
                      String(now.getMonth() + 1).padStart(2, '0') + 
                      String(now.getDate()).padStart(2, '0') + 
                      String(now.getHours()).padStart(2, '0') + 
                      String(now.getMinutes()).padStart(2, '0') + 
                      String(now.getSeconds()).padStart(2, '0');
    
    // 4. Send request to iPaymu
    const response = await fetch(`${ipaymuUrl}/api/v2/payment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'va': ipaymuVa,
        'signature': signature,
        'timestamp': timestamp
      },
      body: jsonBody
    });
    
    const result = await response.json();
    
    if (result.Status === 200 && result.Data && result.Data.SessionID) {
      // Return payment Url to client
      const paymentUrl = result.Data.Url || `${ipaymuUrl}/payment/${result.Data.SessionID}`;
      res.json({ success: true, paymentUrl });
    } else {
      console.error('iPaymu Error:', result);
      res.status(500).json({ error: 'Failed to generate payment url', details: result });
    }
  } catch (err) {
    console.error('iPaymu integration error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ========================================
// Page Routes — Shopify Only (No Local Fallback)
// ========================================

app.get('/', async (req, res) => {
  let products = await fetchShopifyProducts();
  
  if (!products || products.length === 0) {
    console.log('⚠️  No products from Shopify');
    products = [];
  } else {
    console.log(`✅ ${products.length} products loaded from Shopify`);
  }
  
  res.render('index', {
    title: 'Home - Plan Your Skin',
    description: 'Melt Away The Day. Keep The Walk Of Slay',
    products,
    categories: CATEGORIES,
    formatPrice,
    currentPage: 'home',
    shopifyConfig: SHOPIFY_CONFIG,
    useShopify: true
  });
});

app.get('/shop', async (req, res) => {
  let products = await fetchShopifyProducts();
  
  if (!products) {
    products = [];
  }
  
  let filtered = [...products];
  const { category, concern, sort } = req.query;

  if (category) {
    filtered = filtered.filter(p => p.category.some(c => c.toLowerCase().includes(category.toLowerCase())));
  }
  if (concern) {
    filtered = filtered.filter(p => p.concerns && p.concerns.some(c => c.toLowerCase().includes(concern.toLowerCase())));
  }
  if (sort === 'price-low') filtered.sort((a, b) => (a.salePrice || a.price) - (b.salePrice || b.price));
  if (sort === 'price-high') filtered.sort((a, b) => (b.salePrice || b.price) - (a.salePrice || a.price));
  if (sort === 'name') filtered.sort((a, b) => a.name.localeCompare(b.name));

  res.render('shop', {
    title: 'Shop - Plan Your Skin',
    description: 'Shop all Plan Your Skin essentials skincare',
    products: filtered,
    categories: CATEGORIES,
    formatPrice,
    currentPage: 'shop',
    query: req.query,
    shopifyConfig: SHOPIFY_CONFIG,
    useShopify: true
  });
});

app.get('/product/:slug', async (req, res) => {
  let product = await fetchShopifyProduct(req.params.slug);
  let allProducts = await fetchShopifyProducts();
  
  if (!product) {
    return res.status(404).render('404', { title: '404 - Plan Your Skin', currentPage: '' });
  }

  const related = (allProducts || [])
    .filter(p => p.slug !== product.slug)
    .slice(0, 4);

  res.render('product', {
    title: `${product.name} - Plan Your Skin`,
    description: product.description,
    product,
    relatedProducts: related,
    formatPrice,
    currentPage: 'shop',
    shopifyConfig: SHOPIFY_CONFIG,
    useShopify: true
  });
});

app.get('/cart', (req, res) => {
  res.render('cart', {
    title: 'Cart - Plan Your Skin',
    description: 'Your shopping cart',
    currentPage: 'cart',
    formatPrice
  });
});

app.get('/checkout', (req, res) => {
  res.render('checkout', {
    title: 'Checkout - Plan Your Skin',
    description: 'Complete your purchase',
    currentPage: 'checkout',
    formatPrice
  });
});

app.get('/about-us', (req, res) => {
  res.render('about', {
    title: 'About Us - Plan Your Skin',
    description: 'Plan Your Skin lahir dari keyakinan bahwa merawat kulit secara efektif tidak perlu rumit.',
    currentPage: 'about'
  });
});

app.get('/best-seller', async (req, res) => {
  let products = await fetchShopifyProducts();
  
  if (!products) {
    products = [];
  }
  
  const bestSellers = products.filter(p => p.bestSeller);
  
  res.render('shop', {
    title: 'Best Seller - Plan Your Skin',
    description: 'Our most loved skincare products',
    products: bestSellers.length > 0 ? bestSellers : products,
    categories: CATEGORIES,
    formatPrice,
    currentPage: 'best-seller',
    query: {},
    shopifyConfig: SHOPIFY_CONFIG,
    useShopify: true
  });
});

// Pass Shopify config to frontend
app.get('/api/config', (req, res) => {
  res.json({
    shopDomain: SHOPIFY_CONFIG.domain,
    storefrontAccessToken: SHOPIFY_CONFIG.storefrontAccessToken
  });
});

// 404
app.use((req, res) => {
  res.status(404).render('404', { title: '404 - Plan Your Skin', currentPage: '' });
});

app.listen(PORT, () => {
  console.log(`\n  Plan Your Skin Clone is running at:`);
  console.log(`  → http://localhost:${PORT}`);
  console.log(`  → Shopify Store: ${SHOPIFY_CONFIG.domain}`);
  console.log(`  → Storefront Token: ${SHOPIFY_CONFIG.storefrontAccessToken ? '✅ Set' : '❌ Missing'}`);
  console.log(`  → Data Source: Shopify Only (no local fallback)\n`);
});
