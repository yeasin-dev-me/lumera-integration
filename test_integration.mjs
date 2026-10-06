/**
 * Integration Test Suite for Lumera Platform
 * STEP 8 — FULFILLMENT, ORDER LIFECYCLE & NOTIFICATIONS VERTICAL SLICE
 *
 * Verifies the end-to-end multi-app integration flow across:
 * - Auth, Storefront, Catalog
 * - Cart & Wishlist
 * - Checkout, Stock Deduction & Historical Immutability
 * - Payments (SSLCommerz gateway, verification, idempotent webhooks)
 * - Fulfillment & Order Lifecycle (Transitions, Tracking, Customer Cancellation with Stock Restoration)
 * - Audit History, Customer Isolation, and Catalog Archiving (BR-05)
 */

const BASE_URL = process.env.API_BASE_URL || "http://127.0.0.1:8000/api/v1";

console.log(`\n==================================================================`);
console.log(` LUMERA INTEGRATION SUITE: Fulfillment, Lifecycle & Payments Slice`);
console.log(` Target Backend API: ${BASE_URL}`);
console.log(`==================================================================\n`);

let passedTests = 0;
let totalTests = 0;

async function runTest(name, fn) {
  totalTests++;
  process.stdout.write(`• Testing: ${name}... `);
  try {
    await fn();
    console.log(`\x1b[32mPASS\x1b[0m`);
    passedTests++;
  } catch (err) {
    console.log(`\x1b[31mFAIL\x1b[0m`);
    console.error(`  Error:`, err.message);
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || "Assertion failed");
  }
}

async function main() {
  // Test 1: Health check
  await runTest("System Health Endpoint (/health/)", async () => {
    const res = await fetch(`${BASE_URL}/health/`);
    assert(res.status === 200, `Expected 200 but got ${res.status}`);
    const data = await res.json();
    assert(data.status === "ok", `Expected { status: "ok" } but got ${JSON.stringify(data)}`);
  });

  // Test 2: Storefront public config
  await runTest("Storefront Public Config API (/storefront/config/)", async () => {
    const res = await fetch(`${BASE_URL}/storefront/config/`);
    assert(res.status === 200, `Expected 200 but got ${res.status}`);
    const data = await res.json();
    assert(data.site_name === "Lumera", `Expected site_name 'Lumera' but got ${data.site_name}`);
    assert(data.currency === "USD", `Expected currency 'USD'`);
  });

  // Test 3: Customer Registration Flow
  const testEmail = `cust_${Date.now()}@example.com`;
  const testPassword = "StrongPassword2026!";
  let customerAccessToken = "";

  await runTest("Customer Registration Flow (/auth/register/)", async () => {
    const res = await fetch(`${BASE_URL}/auth/register/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: testEmail,
        password: testPassword,
        first_name: "Customer",
        last_name: "One",
      }),
    });
    assert(res.status === 201, `Expected 201 Created but got ${res.status}`);
    const data = await res.json();
    assert(data.access && data.refresh, "Expected access and refresh tokens");
    customerAccessToken = data.access;
  });

  // Test 4: Staff Login Flow
  let staffAccessToken = "";
  await runTest("Staff CMS Login Flow (/admin/auth/login/)", async () => {
    const res = await fetch(`${BASE_URL}/admin/auth/login/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "staff@lumera.internal",
        password: "StaffPassword123!",
      }),
    });
    assert(res.status === 200, `Expected 200 OK for staff login but got ${res.status}`);
    const data = await res.json();
    assert(data.access && data.refresh, "Expected staff tokens");
    assert(data.user?.is_staff === true, "User must be staff");
    staffAccessToken = data.access;
  });

  // Test 5: CMS Staff creates a Category
  const categorySlug = `botanicals-${Date.now()}`;
  let categoryId = 0;
  await runTest("Staff Creates Category in CMS (/admin/categories/)", async () => {
    const res = await fetch(`${BASE_URL}/admin/categories/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${staffAccessToken}`,
      },
      body: JSON.stringify({
        name: "Botanical Elixirs",
        slug: categorySlug,
        description: "Potent plant-derived facial elixirs",
        status: "active",
        sort_order: 1,
      }),
    });
    assert(res.status === 201, `Expected 201 Created but got ${res.status}`);
    const data = await res.json();
    assert(data.slug === categorySlug, `Expected slug '${categorySlug}'`);
    assert(data.id, "Expected numeric category id");
    categoryId = data.id;
  });

  // Test 6: Backend Authoritative Price & Stock Rejection
  await runTest("Backend Rejects Negative Price (< 0)", async () => {
    const res = await fetch(`${BASE_URL}/admin/products/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${staffAccessToken}`,
      },
      body: JSON.stringify({
        name: "Faulty Price Serum",
        slug: `faulty-price-${Date.now()}`,
        sku: `FLT-${Date.now()}`,
        category_id: categoryId,
        price: "-15.00",
        stock_quantity: 10,
        status: "active",
      }),
    });
    assert(res.status === 400, `Expected 400 Bad Request for negative price but got ${res.status}`);
  });

  await runTest("Backend Rejects Negative Stock (< 0)", async () => {
    const res = await fetch(`${BASE_URL}/admin/products/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${staffAccessToken}`,
      },
      body: JSON.stringify({
        name: "Faulty Stock Serum",
        slug: `faulty-stock-${Date.now()}`,
        sku: `STK-${Date.now()}`,
        category_id: categoryId,
        price: "45.00",
        stock_quantity: -5,
        status: "active",
      }),
    });
    assert(res.status === 400, `Expected 400 Bad Request for negative stock but got ${res.status}`);
  });

  // Test 7: Staff creates a Product
  const productSlug = `luminous-glow-oil-${Date.now()}`;
  const productSku = `LGO-${Date.now()}`;
  let productId = 0;
  let productPublicId = "";
  await runTest("Staff Creates Valid Product with Authoritative Price & Stock", async () => {
    const res = await fetch(`${BASE_URL}/admin/products/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${staffAccessToken}`,
      },
      body: JSON.stringify({
        name: "Luminous Glow Facial Oil",
        slug: productSlug,
        sku: productSku,
        category_id: categoryId,
        price: "50.00",
        discount_price: "42.00",
        stock_quantity: 20,
        status: "active",
        is_visible: true,
        is_featured: true,
        description: "Enriched with cold-pressed rosehip and squalane.",
        images: [
          {
            image_url: "https://images.unsplash.com/photo-1608248597359-00918712217c",
            alt_text: "Bottle of Luminous Glow Oil",
            is_primary: true,
          },
        ],
      }),
    });
    assert(res.status === 201, `Expected 201 Created but got ${res.status}`);
    const data = await res.json();
    assert(data.id, "Expected product id");
    assert(data.public_id, "Expected product public_id (UUID)");
    assert(data.price === "50.00", `Expected regular price 50.00 but got ${data.price}`);
    assert(data.discount_price === "42.00", `Expected discount price 42.00 but got ${data.discount_price}`);
    assert(data.effective_price === "42.00", `Expected effective price 42.00 but got ${data.effective_price}`);
    assert(data.stock_quantity === 20, `Expected stock 20 but got ${data.stock_quantity}`);
    assert(data.is_in_stock === true, "Expected is_in_stock true");
    productId = data.id;
    productPublicId = data.public_id;
  });

  // Test 8: Duplicate SKU Rejection
  await runTest("Backend Rejects Duplicate SKU", async () => {
    const res = await fetch(`${BASE_URL}/admin/products/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${staffAccessToken}`,
      },
      body: JSON.stringify({
        name: "Duplicate SKU Oil",
        slug: `dup-oil-${Date.now()}`,
        sku: productSku,
        category_id: categoryId,
        price: "50.00",
        stock_quantity: 5,
      }),
    });
    assert(res.status === 400, `Expected 400 Bad Request for duplicate SKU but got ${res.status}`);
  });

  // Test 9: Customer Storefront retrieves Categories
  await runTest("Customer Storefront Lists Active Categories (/storefront/categories/)", async () => {
    const res = await fetch(`${BASE_URL}/storefront/categories/`);
    assert(res.status === 200, `Expected 200 OK but got ${res.status}`);
    const data = await res.json();
    assert(Array.isArray(data), "Expected category array");
    const found = data.find((c) => c.slug === categorySlug);
    assert(found, `Newly created category '${categorySlug}' must be present in storefront`);
  });

  // Test 10: Customer Storefront retrieves Products
  await runTest("Customer Storefront Lists Published Products (/storefront/products/)", async () => {
    const res = await fetch(`${BASE_URL}/storefront/products/?category=${categorySlug}`);
    assert(res.status === 200, `Expected 200 OK but got ${res.status}`);
    const data = await res.json();
    assert(data.count >= 1, `Expected at least 1 product under category '${categorySlug}'`);
    const item = data.results.find((p) => p.slug === productSlug);
    assert(item, `Published product '${productSlug}' must appear in storefront catalog`);
    assert(item.effective_price === "42.00", "Storefront must display authoritative backend effective price");
    assert(item.is_in_stock === true, "Storefront must display stock availability");
  });

  // Test 11: Customer Storefront retrieves Product Detail
  await runTest("Customer Storefront Product Detail (/storefront/products/{slug}/)", async () => {
    const res = await fetch(`${BASE_URL}/storefront/products/${productSlug}/`);
    assert(res.status === 200, `Expected 200 OK but got ${res.status}`);
    const data = await res.json();
    assert(data.name === "Luminous Glow Facial Oil", "Expected correct product name");
    assert(data.effective_price === "42.00", "Expected backend calculated effective_price 42.00");
    assert(data.stock_quantity === 20, "Expected authoritative stock quantity 20");
    assert(data.images && data.images.length === 1, "Expected gallery image");
  });

  // =================================================================
  // STEP 5: CART & WISHLIST SCENARIOS
  // =================================================================

  // Test 12: Customer retrieves empty cart
  await runTest("Customer Retrieves Empty Cart (/customer/cart/)", async () => {
    const res = await fetch(`${BASE_URL}/customer/cart/`, {
      headers: { Authorization: `Bearer ${customerAccessToken}` },
    });
    assert(res.status === 200, `Expected 200 OK but got ${res.status}`);
    const data = await res.json();
    assert(Array.isArray(data.items), "Expected items array");
    assert(data.item_count === 0, `Expected item_count 0 but got ${data.item_count}`);
    assert(data.subtotal === "0.00", `Expected subtotal '0.00' but got ${data.subtotal}`);
    assert(data.total === "0.00", `Expected total '0.00' but got ${data.total}`);
  });

  // Test 13: Customer adds product with authoritative backend pricing
  await runTest("Customer Adds Product to Cart with Authoritative Pricing (/customer/cart/items/)", async () => {
    const res = await fetch(`${BASE_URL}/customer/cart/items/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${customerAccessToken}`,
      },
      body: JSON.stringify({
        product_id: productPublicId,
        quantity: 2,
      }),
    });
    assert(res.status === 201, `Expected 201 Created but got ${res.status}`);
    const data = await res.json();
    assert(data.item_count === 2, `Expected item_count 2 but got ${data.item_count}`);
    assert(data.subtotal === "84.00", `Expected subtotal '84.00' (42.00 * 2) but got ${data.subtotal}`);
    assert(data.items.length === 1, "Expected 1 cart line");

    const line = data.items[0];
    assert(line.product.public_id === productPublicId, "Expected matching product public_id");
    assert(line.quantity === 2, "Expected quantity 2");
    assert(line.unit_price === "42.00", `Expected unit price '42.00' but got ${line.unit_price}`);
    assert(line.line_total === "84.00", `Expected line total '84.00' but got ${line.line_total}`);
    assert(line.availability_status === "available", "Expected availability_status 'available'");
    assert(line.is_purchasable === true, "Expected is_purchasable true");
  });

  // Test 14: Customer updates cart line quantity
  await runTest("Customer Updates Cart Line Quantity (/customer/cart/items/{product_id}/)", async () => {
    const res = await fetch(`${BASE_URL}/customer/cart/items/${productPublicId}/`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${customerAccessToken}`,
      },
      body: JSON.stringify({ quantity: 3 }),
    });
    assert(res.status === 200, `Expected 200 OK but got ${res.status}`);
    const data = await res.json();
    assert(data.item_count === 3, `Expected item_count 3 but got ${data.item_count}`);
    assert(data.subtotal === "126.00", `Expected subtotal '126.00' (42.00 * 3) but got ${data.subtotal}`);
    assert(data.items[0].quantity === 3, "Expected quantity 3");
  });

  // Test 15: Backend rejects quantity exceeding available stock (stock=10, requested=15)
  await runTest("Backend Rejects Quantity Exceeding Available Stock (409 insufficient_stock)", async () => {
    // CMS adjusts product stock to 10
    await fetch(`${BASE_URL}/admin/products/${productId}/`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${staffAccessToken}`,
      },
      body: JSON.stringify({ stock_quantity: 10 }),
    });

    const res = await fetch(`${BASE_URL}/customer/cart/items/${productPublicId}/`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${customerAccessToken}`,
      },
      body: JSON.stringify({ quantity: 15 }),
    });
    assert(res.status === 409, `Expected 409 Conflict for overstock but got ${res.status}`);
    const data = await res.json();
    assert(data.error?.code === "insufficient_stock", `Expected code 'insufficient_stock' but got ${data.error?.code}`);

    // Restore stock to 20 for subsequent tests
    await fetch(`${BASE_URL}/admin/products/${productId}/`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${staffAccessToken}`,
      },
      body: JSON.stringify({ stock_quantity: 20 }),
    });
  });

  // Test 16: Customer adds same product again; quantity increments authoritatively
  await runTest("Customer Adds Same Product Again; Increments Quantity Authoritatively", async () => {
    const res = await fetch(`${BASE_URL}/customer/cart/items/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${customerAccessToken}`,
      },
      body: JSON.stringify({
        product_id: productPublicId,
        quantity: 2,
      }),
    });
    assert(res.status === 200, `Expected 200 OK for line update but got ${res.status}`);
    const data = await res.json();
    assert(data.item_count === 5, `Expected merged quantity 5 but got ${data.item_count}`);
    assert(data.subtotal === "210.00", `Expected subtotal '210.00' (42.00 * 5) but got ${data.subtotal}`);
    assert(data.items.length === 1, "Must remain single unique line");
  });

  // Test 17: Customer removes item from cart
  await runTest("Customer Removes Item From Cart (/customer/cart/items/{product_id}/ -> 204)", async () => {
    const res = await fetch(`${BASE_URL}/customer/cart/items/${productPublicId}/`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${customerAccessToken}` },
    });
    assert(res.status === 204, `Expected 204 No Content but got ${res.status}`);

    // Verify cart is now empty
    const checkRes = await fetch(`${BASE_URL}/customer/cart/`, {
      headers: { Authorization: `Bearer ${customerAccessToken}` },
    });
    const checkData = await checkRes.json();
    assert(checkData.item_count === 0, "Cart must be empty after removal");
  });

  // Test 18: Customer clears cart
  await runTest("Customer Clears Entire Cart (/customer/cart/ -> 204)", async () => {
    // Add item first
    await fetch(`${BASE_URL}/customer/cart/items/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${customerAccessToken}`,
      },
      body: JSON.stringify({ product_id: productPublicId, quantity: 1 }),
    });

    const res = await fetch(`${BASE_URL}/customer/cart/`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${customerAccessToken}` },
    });
    assert(res.status === 204, `Expected 204 No Content for clear cart but got ${res.status}`);

    const checkRes = await fetch(`${BASE_URL}/customer/cart/`, {
      headers: { Authorization: `Bearer ${customerAccessToken}` },
    });
    const checkData = await checkRes.json();
    assert(checkData.item_count === 0, "Cart must be empty after clear");
  });

  // Test 19: Customer retrieves empty wishlist
  await runTest("Customer Retrieves Empty Wishlist (/customer/wishlist/)", async () => {
    const res = await fetch(`${BASE_URL}/customer/wishlist/`, {
      headers: { Authorization: `Bearer ${customerAccessToken}` },
    });
    assert(res.status === 200, `Expected 200 OK but got ${res.status}`);
    const data = await res.json();
    assert(Array.isArray(data.items), "Expected items array");
    assert(data.item_count === 0, `Expected item_count 0 but got ${data.item_count}`);
  });

  // Test 20: Customer adds product to wishlist
  await runTest("Customer Adds Product to Wishlist (/customer/wishlist/items/)", async () => {
    const res = await fetch(`${BASE_URL}/customer/wishlist/items/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${customerAccessToken}`,
      },
      body: JSON.stringify({ product_id: productPublicId }),
    });
    assert(res.status === 201, `Expected 201 Created but got ${res.status}`);
    const data = await res.json();
    assert(data.item_count === 1, `Expected item_count 1 but got ${data.item_count}`);
    assert(data.items[0].product.public_id === productPublicId, "Expected matching public_id");
    assert(data.items[0].is_available === true, "Expected is_available true");
  });

  // Test 21: Backend prevents duplicate wishlist item (409 conflict)
  await runTest("Backend Prevents Duplicate Wishlist Item (409 conflict)", async () => {
    const res = await fetch(`${BASE_URL}/customer/wishlist/items/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${customerAccessToken}`,
      },
      body: JSON.stringify({ product_id: productPublicId }),
    });
    assert(res.status === 409, `Expected 409 Conflict for duplicate wishlist item but got ${res.status}`);
    const data = await res.json();
    assert(data.error?.code === "conflict", `Expected error code 'conflict' but got ${data.error?.code}`);
  });

  // Test 22: Customer removes product from wishlist
  await runTest("Customer Removes Product From Wishlist (/customer/wishlist/items/{product_id}/ -> 204)", async () => {
    const res = await fetch(`${BASE_URL}/customer/wishlist/items/${productPublicId}/`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${customerAccessToken}` },
    });
    assert(res.status === 204, `Expected 204 No Content but got ${res.status}`);

    const checkRes = await fetch(`${BASE_URL}/customer/wishlist/`, {
      headers: { Authorization: `Bearer ${customerAccessToken}` },
    });
    const checkData = await checkRes.json();
    assert(checkData.item_count === 0, "Wishlist must be empty after removal");
  });

  // Test 23: Customer Isolation Verification
  let cust2Token = "";
  await runTest("Customer Cart & Wishlist Isolation Verification", async () => {
    // 1. Customer 1 adds product to cart and wishlist
    await fetch(`${BASE_URL}/customer/cart/items/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${customerAccessToken}`,
      },
      body: JSON.stringify({ product_id: productPublicId, quantity: 2 }),
    });
    await fetch(`${BASE_URL}/customer/wishlist/items/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${customerAccessToken}`,
      },
      body: JSON.stringify({ product_id: productPublicId }),
    });

    // 2. Register Customer 2
    const cust2Email = `cust2_${Date.now()}@example.com`;
    const regRes = await fetch(`${BASE_URL}/auth/register/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: cust2Email,
        password: "StrongPassword2026!",
        first_name: "Customer",
        last_name: "Two",
      }),
    });
    const cust2Tokens = await regRes.json();
    cust2Token = cust2Tokens.access;

    // 3. Customer 2 queries own cart and wishlist -> must be empty
    const c2CartRes = await fetch(`${BASE_URL}/customer/cart/`, {
      headers: { Authorization: `Bearer ${cust2Token}` },
    });
    const c2Cart = await c2CartRes.json();
    assert(c2Cart.item_count === 0, "Customer 2 cart must be empty");

    const c2WishRes = await fetch(`${BASE_URL}/customer/wishlist/`, {
      headers: { Authorization: `Bearer ${cust2Token}` },
    });
    const c2Wish = await c2WishRes.json();
    assert(c2Wish.item_count === 0, "Customer 2 wishlist must be empty");

    // 4. Customer 2 attempts to delete Customer 1's cart item
    await fetch(`${BASE_URL}/customer/cart/items/${productPublicId}/`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${cust2Token}` },
    });

    // 5. Customer 1's cart must remain intact
    const c1CartRes = await fetch(`${BASE_URL}/customer/cart/`, {
      headers: { Authorization: `Bearer ${customerAccessToken}` },
    });
    const c1Cart = await c1CartRes.json();
    assert(c1Cart.item_count === 2, "Customer 1 cart must be untouched");
  });

  // =================================================================
  // STEP 6: CHECKOUT & ORDERS VERTICAL SLICE
  // =================================================================

  let createdOrderPublicId = "";
  let createdOrderNumber = "";

  // Test 24: Customer Fetches Checkout Preview
  await runTest("Customer Fetches Authoritative Checkout Preview (/customer/checkout/)", async () => {
    const res = await fetch(`${BASE_URL}/customer/checkout/`, {
      headers: { Authorization: `Bearer ${customerAccessToken}` },
    });
    assert(res.status === 200, `Expected 200 OK for checkout preview but got ${res.status}`);
    const data = await res.json();
    assert(data.is_ready_for_checkout === true, "Checkout should be ready with valid items");
    assert(data.subtotal === "84.00", `Expected subtotal '84.00' (42.00 * 2) but got ${data.subtotal}`);
    assert(data.total === "84.00", `Expected total '84.00' but got ${data.total}`);
    assert(data.shipping_cost === "0.00", "Shipping cost should be 0.00");
    assert(data.customer?.email, "Customer email must be populated");
  });

  // Test 25: Customer Places Order from Cart
  await runTest("Customer Submits Valid Order Creation (/customer/orders/)", async () => {
    const res = await fetch(`${BASE_URL}/customer/orders/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${customerAccessToken}`,
      },
      body: JSON.stringify({
        shipping_address: {
          full_name: "Jane Doe Integration",
          phone: "+8801700000000",
          address: "House 10, Road 4, Sector 3",
          city: "Dhaka",
          area: "Uttara",
          postal_code: "1230",
          country: "Bangladesh",
        },
        customer_notes: "Leave package at front reception",
      }),
    });
    assert(res.status === 201, `Expected 201 Created for order placement but got ${res.status}`);
    const data = await res.json();

    assert(data.public_id, "Order must have public_id (UUID)");
    assert(data.order_number?.startsWith("LUM-"), `Order number must follow LUM- convention, got: ${data.order_number}`);
    assert(data.status === "pending", `Expected order status 'pending' but got: ${data.status}`);
    assert(data.payment_status === "pending", `Expected payment status 'pending' but got: ${data.payment_status}`);
    assert(data.subtotal === "84.00", `Expected subtotal '84.00' but got: ${data.subtotal}`);
    assert(data.total === "84.00", `Expected total '84.00' but got: ${data.total}`);

    // Snapshot verification
    assert(Array.isArray(data.items) && data.items.length === 1, "Expected 1 order item");
    const item = data.items[0];
    assert(item.product_name === "Luminous Glow Facial Oil", `Expected snapshotted name but got: ${item.product_name}`);
    assert(item.product_sku === productSku, `Expected snapshotted SKU but got: ${item.product_sku}`);
    assert(item.unit_price === "42.00", `Expected snapshotted unit price '42.00' but got: ${item.unit_price}`);
    assert(item.quantity === 2, `Expected quantity 2 but got: ${item.quantity}`);
    assert(item.line_total === "84.00", `Expected line total '84.00' but got: ${item.line_total}`);

    // Shipping address snapshot verification
    assert(data.shipping_address?.full_name === "Jane Doe Integration", "Full name must match snapshot");
    assert(data.shipping_address?.city === "Dhaka", "City must match snapshot");
    assert(data.customer_notes === "Leave package at front reception", "Notes must match");

    createdOrderPublicId = data.public_id;
    createdOrderNumber = data.order_number;
  });

  // Test 26: Cart Cleared & Inventory Deducted
  await runTest("Cart Is Cleared and Inventory Deducted Atomically After Checkout", async () => {
    // 1. Verify Cart is empty
    const cartRes = await fetch(`${BASE_URL}/customer/cart/`, {
      headers: { Authorization: `Bearer ${customerAccessToken}` },
    });
    const cartData = await cartRes.json();
    assert(cartData.item_count === 0, `Cart should be empty after checkout, got: ${cartData.item_count}`);
    assert(cartData.items.length === 0, "Cart items array should be empty");

    // 2. Verify product stock deducted by 2 (initial was 20, now 18)
    const prodRes = await fetch(`${BASE_URL}/storefront/products/${productSlug}/`);
    const prodData = await prodRes.json();
    assert(prodData.stock_quantity === 18, `Expected stock 18 (20 - 2) but got: ${prodData.stock_quantity}`);
  });

  // Test 27: Customer Order List & Detail Retrieval
  await runTest("Customer Order History & Detail Retrieval with Purchase Snapshots", async () => {
    // 1. List
    const listRes = await fetch(`${BASE_URL}/customer/orders/`, {
      headers: { Authorization: `Bearer ${customerAccessToken}` },
    });
    assert(listRes.status === 200, `Expected 200 OK for customer orders list but got ${listRes.status}`);
    const listData = await listRes.json();
    assert(listData.count >= 1, "Expected at least 1 order in customer history");
    const found = listData.results?.some((ord) => ord.public_id === createdOrderPublicId);
    assert(found, `Newly created order ${createdOrderPublicId} not found in order list`);

    // 2. Detail
    const detailRes = await fetch(`${BASE_URL}/customer/orders/${createdOrderPublicId}/`, {
      headers: { Authorization: `Bearer ${customerAccessToken}` },
    });
    assert(detailRes.status === 200, `Expected 200 OK for customer order detail but got ${detailRes.status}`);
    const detailData = await detailRes.json();
    assert(detailData.order_number === createdOrderNumber, "Order numbers must match");
    assert(detailData.items[0].unit_price === "42.00", "Snapshotted price must match");
  });

  // Test 28: Customer Order Isolation Enforcement
  await runTest("Customer Order Isolation (Customer B Cannot Access Customer A's Orders)", async () => {
    // Customer 2 attempts to retrieve Customer 1's order
    const res = await fetch(`${BASE_URL}/customer/orders/${createdOrderPublicId}/`, {
      headers: { Authorization: `Bearer ${cust2Token}` },
    });
    assert(res.status === 404, `Expected 404 Not Found for cross-customer order access but got ${res.status}`);

    // Customer 2 lists orders: must be 0
    const listRes = await fetch(`${BASE_URL}/customer/orders/`, {
      headers: { Authorization: `Bearer ${cust2Token}` },
    });
    const listData = await listRes.json();
    assert(listData.count === 0, `Customer 2 order list should have 0 orders, got: ${listData.count}`);
  });

  // Test 29: Historical Price Immutability
  await runTest("Historical Price Immutability (Catalog Price Changes Never Alter Existing Orders)", async () => {
    // Staff changes price from 50.00/42.00 to 99.00
    await fetch(`${BASE_URL}/admin/products/${productId}/`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${staffAccessToken}`,
      },
      body: JSON.stringify({
        price: "99.00",
        discount_price: null,
      }),
    });

    // Customer retrieves past order detail
    const res = await fetch(`${BASE_URL}/customer/orders/${createdOrderPublicId}/`, {
      headers: { Authorization: `Bearer ${customerAccessToken}` },
    });
    const data = await res.json();
    assert(data.items[0].unit_price === "42.00", `Old order item unit price must remain 42.00, got: ${data.items[0].unit_price}`);
    assert(data.items[0].line_total === "84.00", `Old order line total must remain 84.00, got: ${data.items[0].line_total}`);
    assert(data.total === "84.00", `Old order total must remain 84.00, got: ${data.total}`);
  });

  // Test 30: Insufficient Stock Checkout Rejection & Atomicity
  await runTest("Insufficient Stock Checkout Rejection & Transaction Atomicity (409 Conflict)", async () => {
    // 1. Customer adds 10 units to cart
    await fetch(`${BASE_URL}/customer/cart/items/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${customerAccessToken}`,
      },
      body: JSON.stringify({ product_id: productPublicId, quantity: 10 }),
    });

    // 2. Staff adjusts product stock to 5 in CMS
    await fetch(`${BASE_URL}/admin/products/${productId}/`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${staffAccessToken}`,
      },
      body: JSON.stringify({ stock_quantity: 5 }),
    });

    // 3. Customer attempts checkout -> must fail with 409 insufficient_stock
    const res = await fetch(`${BASE_URL}/customer/orders/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${customerAccessToken}`,
      },
      body: JSON.stringify({
        shipping_address: {
          full_name: "Jane Doe Integration",
          phone: "+8801700000000",
          address: "House 10, Road 4",
          city: "Dhaka",
        },
      }),
    });
    assert(res.status === 409, `Expected 409 Conflict for insufficient stock but got ${res.status}`);
    const errData = await res.json();
    assert(errData.error?.code === "insufficient_stock", `Expected code 'insufficient_stock' but got ${errData.error?.code}`);

    // 4. Verify atomicity: stock remains 5, cart remains intact with 10 items
    const stockRes = await fetch(`${BASE_URL}/storefront/products/${productSlug}/`);
    const stockData = await stockRes.json();
    assert(stockData.stock_quantity === 5, "Stock must remain 5 after aborted transaction");

    const cartRes = await fetch(`${BASE_URL}/customer/cart/`, {
      headers: { Authorization: `Bearer ${customerAccessToken}` },
    });
    const cartData = await cartRes.json();
    assert(cartData.item_count === 10, "Cart must remain intact with 10 items");

    // 5. Clean up cart
    await fetch(`${BASE_URL}/customer/cart/`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${customerAccessToken}` },
    });
  });

  // Test 31: CMS Staff Operational Orders Visibility
  await runTest("CMS Staff Operational Order Listing & Detail (/admin/orders/)", async () => {
    // 1. Staff lists orders
    const listRes = await fetch(`${BASE_URL}/admin/orders/`, {
      headers: { Authorization: `Bearer ${staffAccessToken}` },
    });
    assert(listRes.status === 200, `Expected 200 OK for admin orders list but got ${listRes.status}`);
    const listData = await listRes.json();
    assert(listData.count >= 1, "Expected at least 1 order in admin view");
    const found = listData.results?.some((ord) => ord.public_id === createdOrderPublicId);
    assert(found, "Order must be visible to staff");

    // 2. Staff views order detail
    const detailRes = await fetch(`${BASE_URL}/admin/orders/${createdOrderPublicId}/`, {
      headers: { Authorization: `Bearer ${staffAccessToken}` },
    });
    assert(detailRes.status === 200, `Expected 200 OK for admin order detail but got ${detailRes.status}`);
    const detailData = await detailRes.json();
    assert(detailData.customer?.email, "Staff detail must include customer profile info");
    assert(detailData.items?.length === 1, "Line items must be present in staff detail");
    assert(Array.isArray(detailData.status_history), "Status history must be present in staff detail");
  });

  // =================================================================
  // STEP 7 — PAYMENTS VERTICAL SLICE
  // =================================================================
  let createdPaymentPublicId = "";

  // Test 32: Authoritative Payment Status Query for Payable Order
  await runTest("Authoritative Payment Status Query for Payable Order (/customer/orders/{id}/payment/)", async () => {
    const res = await fetch(`${BASE_URL}/customer/orders/${createdOrderPublicId}/payment/`, {
      headers: { Authorization: `Bearer ${customerAccessToken}` },
    });
    assert(res.status === 200, `Expected 200 OK for payment status query but got ${res.status}`);
    const data = await res.json();
    assert(data.order_public_id === createdOrderPublicId, "Order public ID must match");
    assert(data.status === "pending", `Expected status 'pending', got '${data.status}'`);
    assert(data.amount === "84.00", `Expected amount '84.00', got '${data.amount}'`);
    assert(data.currency === "USD", `Expected currency 'USD', got '${data.currency}'`);
  });

  // Test 33: Security — Unauthenticated User Cannot Initiate Payment
  await runTest("Security: Unauthenticated User Cannot Initiate Payment (401 Unauthorized)", async () => {
    const res = await fetch(`${BASE_URL}/customer/orders/${createdOrderPublicId}/payment/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gateway: "sslcommerz" }),
    });
    assert(res.status === 401, `Expected 401 Unauthorized but got ${res.status}`);
  });

  // Test 34: Customer Isolation — Customer B Cannot Initiate Payment for Customer A's Order
  await runTest("Customer Isolation: Customer B Cannot Initiate Payment for Customer A's Order (404 Not Found)", async () => {
    const res = await fetch(`${BASE_URL}/customer/orders/${createdOrderPublicId}/payment/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cust2Token}`,
      },
      body: JSON.stringify({ gateway: "sslcommerz" }),
    });
    assert(res.status === 404, `Expected 404 Not Found for cross-customer payment initiation but got ${res.status}`);

    const getRes = await fetch(`${BASE_URL}/customer/orders/${createdOrderPublicId}/payment/`, {
      headers: { Authorization: `Bearer ${cust2Token}` },
    });
    assert(getRes.status === 404, `Expected 404 Not Found for cross-customer payment query but got ${getRes.status}`);
  });

  // Test 35: Authenticated Customer Initiates Payment Session with Authoritative Order Total
  await runTest("Customer Initiates Payment Session with Authoritative Order Total (/customer/orders/{id}/payment/)", async () => {
    const res = await fetch(`${BASE_URL}/customer/orders/${createdOrderPublicId}/payment/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${customerAccessToken}`,
      },
      body: JSON.stringify({ gateway: "sslcommerz" }),
    });
    assert(res.status === 201, `Expected 201 Created for payment initiation but got ${res.status}`);
    const data = await res.json();
    assert(data.payment_public_id, "Response must include payment_public_id");
    assert(data.order_public_id === createdOrderPublicId, "Order public_id must match");
    assert(data.amount === "84.00", `Expected authoritative amount '84.00' but got '${data.amount}'`);
    assert(data.currency === "USD", `Expected currency 'USD' but got '${data.currency}'`);
    assert(data.status === "initiated", `Expected status 'initiated' but got '${data.status}'`);
    assert(data.redirect_url && data.redirect_url.includes("sslcommerz.com"), "Redirect URL must point to SSLCommerz gateway");
    createdPaymentPublicId = data.payment_public_id;
  });

  // Test 36: Security — Webhook Rejects Unknown Transaction Reference
  await runTest("Security: Webhook Rejects Unknown Transaction Reference (400 Bad Request)", async () => {
    const res = await fetch(`${BASE_URL}/internal/payments/webhook/sslcommerz/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tran_id: "00000000-0000-0000-0000-000000000000",
        val_id: "NON_EXISTENT_VAL_ID",
      }),
    });
    assert(res.status === 400, `Expected 400 Bad Request for unknown transaction callback but got ${res.status}`);
  });

  // Test 37: Security — Webhook Server-Side Verification Rejects Unverified Transaction
  await runTest("Security: Webhook Server-Side Verification Rejects Unverified Transaction (Safe Failure)", async () => {
    const res = await fetch(`${BASE_URL}/internal/payments/webhook/sslcommerz/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tran_id: createdPaymentPublicId,
        val_id: "FAKE_UNVERIFIED_VAL_ID",
      }),
    });
    const data = await res.json();
    assert(data.status === "failed", `Expected status 'failed' for unverified callback, got: ${data.status}`);

    // Verify order remains unpaid
    const ordRes = await fetch(`${BASE_URL}/customer/orders/${createdOrderPublicId}/`, {
      headers: { Authorization: `Bearer ${customerAccessToken}` },
    });
    const ordData = await ordRes.json();
    assert(ordData.payment_status === "pending", `Order payment status must remain pending, got: ${ordData.payment_status}`);
  });

  // Test 38: CMS Staff Payment Visibility and Attempt Audit Trail
  await runTest("CMS Staff Payment Visibility and Attempt Audit Trail (/admin/orders/{id}/)", async () => {
    const res = await fetch(`${BASE_URL}/admin/orders/${createdOrderPublicId}/`, {
      headers: { Authorization: `Bearer ${staffAccessToken}` },
    });
    assert(res.status === 200, `Expected 200 OK for admin order detail but got ${res.status}`);
    const data = await res.json();
    assert(data.payment, "Staff order detail must include payment object");
    assert(data.payment.gateway === "sslcommerz", "Payment gateway must be 'sslcommerz'");
    assert(Array.isArray(data.payment_attempts), "Payment attempts must be an array");
    assert(data.payment_attempts.length >= 1, "At least one payment attempt must be recorded");
  });

  // =================================================================
  // STEP 8 — FULFILLMENT, ORDER LIFECYCLE & NOTIFICATIONS
  // =================================================================

  // Test 39: Customer Isolation — Customer B Cannot Cancel Customer A's Order
  await runTest("Customer Isolation: Customer B Cannot Cancel Customer A's Order (404 Not Found)", async () => {
    const res = await fetch(`${BASE_URL}/customer/orders/${createdOrderPublicId}/cancel/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cust2Token}`,
      },
      body: JSON.stringify({ reason: "Unauthorized attempt" }),
    });
    assert(res.status === 404, `Expected 404 Not Found for cross-customer order cancellation but got ${res.status}`);
  });

  // Test 40: Customer Cancels Unpaid Pending Order with Atomic Stock Restoration
  await runTest("Customer Cancels Unpaid Pending Order with Atomic Stock Restoration (/customer/orders/{id}/cancel/)", async () => {
    // 1. Verify stock before cancellation (adjusted to 5 in Test 30)
    const beforeRes = await fetch(`${BASE_URL}/storefront/products/${productSlug}/`);
    const beforeData = await beforeRes.json();
    const stockBefore = beforeData.stock_quantity;
    assert(stockBefore === 5, `Expected stock to be 5 before cancellation, got: ${stockBefore}`);

    // 2. Customer cancels order (had 2 units of product)
    const cancelRes = await fetch(`${BASE_URL}/customer/orders/${createdOrderPublicId}/cancel/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${customerAccessToken}`,
      },
      body: JSON.stringify({ reason: "Found a better deal" }),
    });
    assert(cancelRes.status === 200, `Expected 200 OK for order cancellation but got ${cancelRes.status}`);
    const cancelData = await cancelRes.json();
    assert(cancelData.status === "cancelled", `Expected status 'cancelled' but got '${cancelData.status}'`);

    // 3. Verify stock restored by exactly 2 units (5 + 2 = 7)
    const afterRes = await fetch(`${BASE_URL}/storefront/products/${productSlug}/`);
    const afterData = await afterRes.json();
    assert(afterData.stock_quantity === stockBefore + 2, `Expected stock restored to ${stockBefore + 2}, got: ${afterData.stock_quantity}`);
  });

  // Test 41: Guard — Repeated Order Cancellation Rejection (409 Conflict)
  await runTest("Guard: Repeated Order Cancellation Rejection (409 Conflict)", async () => {
    const res = await fetch(`${BASE_URL}/customer/orders/${createdOrderPublicId}/cancel/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${customerAccessToken}`,
      },
      body: JSON.stringify({ reason: "Cancel again" }),
    });
    assert(res.status === 409, `Expected 409 Conflict when cancelling already cancelled order, got ${res.status}`);
  });

  // Test 42: Customer Places Second Order & Completes Payment for Fulfillment
  let fulfillmentOrderId = "";
  await runTest("Customer Places Second Order & Completes Payment for Fulfillment", async () => {
    // 1. Add 1 item to cart
    await fetch(`${BASE_URL}/customer/cart/items/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${customerAccessToken}`,
      },
      body: JSON.stringify({ product_id: productPublicId, quantity: 1 }),
    });

    // 2. Checkout
    const res = await fetch(`${BASE_URL}/customer/orders/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${customerAccessToken}`,
      },
      body: JSON.stringify({
        shipping_address: {
          full_name: "Jane Doe Fulfillment",
          phone: "+8801700000001",
          address: "House 25, Road 7",
          city: "Dhaka",
        },
      }),
    });
    assert(res.status === 201, `Expected 201 Created for order 2 but got ${res.status}`);
    const data = await res.json();
    fulfillmentOrderId = data.public_id;
    assert(data.status === "pending", `Expected order 2 status 'pending', got: ${data.status}`);

    // 3. Initiate payment
    const payRes = await fetch(`${BASE_URL}/customer/orders/${fulfillmentOrderId}/payment/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${customerAccessToken}`,
      },
      body: JSON.stringify({ gateway: "sslcommerz" }),
    });
    assert(payRes.status === 201, `Expected 201 Created for payment session, got ${payRes.status}`);
    const payData = await payRes.json();

    // 4. Server-to-server webhook authoritatively confirms payment
    const webhookRes = await fetch(`${BASE_URL}/internal/payments/webhook/sslcommerz/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tran_id: payData.payment_public_id,
        val_id: "TEST_VALID_STEP8_SUCCESS",
      }),
    });
    assert(webhookRes.status === 200, `Expected 200 OK for payment webhook, got ${webhookRes.status}`);
    const webhookData = await webhookRes.json();
    assert(webhookData.status === "paid", `Expected status 'paid', got: ${webhookData.status} - message: ${webhookData.message}`);
  });

  // Test 43: Staff Starts Processing Confirmed Paid Order (/admin/orders/{id}/transition/)
  await runTest("Staff Starts Processing Confirmed Paid Order (/admin/orders/{id}/transition/)", async () => {
    const procRes = await fetch(`${BASE_URL}/admin/orders/${fulfillmentOrderId}/transition/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${staffAccessToken}`,
      },
      body: JSON.stringify({ to_status: "processing", reason: "Allocated to packing station" }),
    });
    assert(procRes.status === 200, `Expected 200 OK for transition to processing but got ${procRes.status}`);
    const procData = await procRes.json();
    assert(procData.status === "processing", `Expected status 'processing', got: ${procData.status}`);
  });

  // Test 44: Guard — Shipping Rejects Missing Courier & Tracking Number
  await runTest("Guard: Shipping Rejects Missing Courier & Tracking Number (400 Bad Request)", async () => {
    const res = await fetch(`${BASE_URL}/admin/orders/${fulfillmentOrderId}/transition/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${staffAccessToken}`,
      },
      body: JSON.stringify({ to_status: "shipped", reason: "Attempt dispatch without tracking" }),
    });
    assert(res.status === 400, `Expected 400 Bad Request when dispatching without tracking but got ${res.status}`);
  });

  // Test 45: Staff Updates Fulfillment Tracking Metadata (/admin/orders/{id}/fulfillment/)
  await runTest("Staff Updates Fulfillment Tracking Metadata (/admin/orders/{id}/fulfillment/)", async () => {
    const res = await fetch(`${BASE_URL}/admin/orders/${fulfillmentOrderId}/fulfillment/`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${staffAccessToken}`,
      },
      body: JSON.stringify({
        courier: "Pathao Express",
        tracking_number: "PTH-998877",
        tracking_url: "https://tracking.pathao.com/PTH-998877",
      }),
    });
    assert(res.status === 200, `Expected 200 OK for fulfillment update but got ${res.status}`);
    const data = await res.json();
    assert(data.courier === "Pathao Express", `Expected courier 'Pathao Express', got: ${data.courier}`);
    assert(data.tracking_number === "PTH-998877", `Expected tracking_number 'PTH-998877', got: ${data.tracking_number}`);
    assert(data.tracking_url === "https://tracking.pathao.com/PTH-998877", `Expected tracking_url, got: ${data.tracking_url}`);
  });

  // Test 46: Staff Transitions Order to Shipped and Delivered
  await runTest("Staff Transitions Order to Shipped and Delivered (/admin/orders/{id}/transition/)", async () => {
    // 1. Transition processing -> shipped
    const shipRes = await fetch(`${BASE_URL}/admin/orders/${fulfillmentOrderId}/transition/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${staffAccessToken}`,
      },
      body: JSON.stringify({ to_status: "shipped", reason: "Picked up by courier" }),
    });
    assert(shipRes.status === 200, `Expected 200 OK for transition to shipped but got ${shipRes.status}`);
    const shipData = await shipRes.json();
    assert(shipData.status === "shipped", `Expected status 'shipped', got: ${shipData.status}`);
    assert(shipData.shipped_at !== null, "Expected shipped_at timestamp to be populated");

    // 2. Transition shipped -> delivered
    const delRes = await fetch(`${BASE_URL}/admin/orders/${fulfillmentOrderId}/transition/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${staffAccessToken}`,
      },
      body: JSON.stringify({ to_status: "delivered", reason: "Customer received shipment" }),
    });
    assert(delRes.status === 200, `Expected 200 OK for transition to delivered but got ${delRes.status}`);
    const delData = await delRes.json();
    assert(delData.status === "delivered", `Expected status 'delivered', got: ${delData.status}`);
    assert(delData.delivered_at !== null, "Expected delivered_at timestamp to be populated");
  });

  // Test 47: Guard — Delivered Terminal State Cannot Transition
  await runTest("Guard: Terminal State Cannot Transition (409 Conflict)", async () => {
    const res = await fetch(`${BASE_URL}/admin/orders/${fulfillmentOrderId}/transition/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${staffAccessToken}`,
      },
      body: JSON.stringify({ to_status: "processing", reason: "Illegal back-transition" }),
    });
    assert(res.status === 409, `Expected 409 Conflict for terminal transition but got ${res.status}`);
  });

  // Test 48: Customer Order Timeline Retrieval and Customer Isolation
  await runTest("Customer Order Timeline Retrieval and Customer Isolation (/customer/orders/{id}/timeline/)", async () => {
    // 1. Customer A retrieves timeline
    const res = await fetch(`${BASE_URL}/customer/orders/${fulfillmentOrderId}/timeline/`, {
      headers: { Authorization: `Bearer ${customerAccessToken}` },
    });
    assert(res.status === 200, `Expected 200 OK for customer timeline query but got ${res.status}`);
    const items = await res.json();
    assert(Array.isArray(items), "Timeline response must be an array");
    assert(items.length >= 4, `Expected at least 4 timeline events, got: ${items.length}`);
    const statuses = items.map((i) => i.to_status);
    assert(statuses.includes("confirmed"), "Timeline must contain confirmed status");
    assert(statuses.includes("processing"), "Timeline must contain processing status");
    assert(statuses.includes("shipped"), "Timeline must contain shipped status");
    assert(statuses.includes("delivered"), "Timeline must contain delivered status");
    // Verify actor_type field present
    assert(items.every((i) => typeof i.actor_type === "string"), "Every timeline item must provide actor_type");

    // 2. Customer B attempts to retrieve Customer A's timeline -> 404
    const isoRes = await fetch(`${BASE_URL}/customer/orders/${fulfillmentOrderId}/timeline/`, {
      headers: { Authorization: `Bearer ${cust2Token}` },
    });
    assert(isoRes.status === 404, `Expected 404 Not Found for cross-customer timeline query but got ${isoRes.status}`);
  });

  // =================================================================
  // CATALOG ARCHIVING & BR-05 CHECKS
  // =================================================================

  // Test 49: BR-05 Category Archive Conflict with Active Products
  await runTest("BR-05: Cannot Archive Category with Active Products (409 Conflict)", async () => {
    const res = await fetch(`${BASE_URL}/admin/categories/${categoryId}/`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${staffAccessToken}` },
    });
    assert(res.status === 409, `Expected 409 Conflict for category with active products but got ${res.status}`);
    const data = await res.json();
    assert(data.error?.code === "conflict", `Expected conflict code but got '${data.error?.code}'`);
  });

  // Test 50: Staff Archives Product
  await runTest("Staff Archives Product via CMS (/admin/products/{id}/)", async () => {
    const res = await fetch(`${BASE_URL}/admin/products/${productId}/`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${staffAccessToken}` },
    });
    assert(res.status === 204, `Expected 204 No Content for product archive but got ${res.status}`);
  });

  // Test 51: Storefront Hides Archived Product (404)
  await runTest("Storefront Hides Archived Product (/storefront/products/{slug}/ -> 404)", async () => {
    const res = await fetch(`${BASE_URL}/storefront/products/${productSlug}/`);
    assert(res.status === 404, `Expected 404 Not Found for archived product but got ${res.status}`);
  });

  // Test 52: Staff Can Now Archive Category
  await runTest("Staff Archives Category After Products Reassigned/Archived", async () => {
    const res = await fetch(`${BASE_URL}/admin/categories/${categoryId}/`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${staffAccessToken}` },
    });
    assert(res.status === 204, `Expected 204 No Content for category archive but got ${res.status}`);
  });

  console.log(`\n------------------------------------------------------------------`);
  console.log(` Results: ${passedTests}/${totalTests} integration tests passed.`);
  console.log(`------------------------------------------------------------------\n`);

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal test runner error:", err);
  process.exit(1);
});
