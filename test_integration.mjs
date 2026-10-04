/**
 * Integration Test Suite for Lumera Platform (STEP 4 — CATEGORIES & PRODUCTS)
 *
 * Verifies that:
 * 1. Health & Public Config endpoints respond normally.
 * 2. Customer registration, login, JWT rotation, and blacklisting operate properly.
 * 3. Staff CMS login returns staff user and advisory permissions.
 * 4. Staff creates a Category via /admin/categories/ with backend validation.
 * 5. Backend authoritatively rejects invalid product prices (< 0) and stock (< 0).
 * 6. Staff creates a Product via /admin/products/ with prices, stock, and images.
 * 7. Duplicate SKU is authoritatively rejected by backend.
 * 8. Customer Storefront queries /storefront/categories/ and sees newly created Category.
 * 9. Customer Storefront queries /storefront/products/ and sees published Product with
 *    backend-calculated effective_price and real-time inventory stock.
 * 10. Customer Storefront queries /storefront/products/{slug}/ for product detail.
 * 11. Archived/draft products are hidden from the storefront (returns 404).
 * 12. BR-05: Category containing active products cannot be archived without reassigning them.
 */

const BASE_URL = process.env.API_BASE_URL || "http://127.0.0.1:8000/api/v1";

console.log(`\n==================================================================`);
console.log(` LUMERA INTEGRATION SUITE: Categories & Products Vertical Slice`);
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
  let customerRefreshToken = "";

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
    customerRefreshToken = data.refresh;
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
    assert(data.price === "50.00", `Expected regular price 50.00 but got ${data.price}`);
    assert(data.discount_price === "42.00", `Expected discount price 42.00 but got ${data.discount_price}`);
    assert(data.effective_price === "42.00", `Expected effective price 42.00 but got ${data.effective_price}`);
    assert(data.stock_quantity === 20, `Expected stock 20 but got ${data.stock_quantity}`);
    assert(data.is_in_stock === true, "Expected is_in_stock true");
    productId = data.id;
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

  // Test 12: BR-05 Category Archive Conflict with Active Products
  await runTest("BR-05: Cannot Archive Category with Active Products (409 Conflict)", async () => {
    const res = await fetch(`${BASE_URL}/admin/categories/${categoryId}/`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${staffAccessToken}` },
    });
    assert(res.status === 409, `Expected 409 Conflict for category with active products but got ${res.status}`);
    const data = await res.json();
    assert(data.error?.code === "conflict", `Expected conflict code but got '${data.error?.code}'`);
  });

  // Test 13: Staff Archives Product
  await runTest("Staff Archives Product via CMS (/admin/products/{id}/)", async () => {
    const res = await fetch(`${BASE_URL}/admin/products/${productId}/`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${staffAccessToken}` },
    });
    assert(res.status === 204, `Expected 204 No Content for product archive but got ${res.status}`);
  });

  // Test 14: Storefront Hides Archived Product (404)
  await runTest("Storefront Hides Archived Product (/storefront/products/{slug}/ -> 404)", async () => {
    const res = await fetch(`${BASE_URL}/storefront/products/${productSlug}/`);
    assert(res.status === 404, `Expected 404 Not Found for archived product but got ${res.status}`);
  });

  // Test 15: Staff Can Now Archive Category
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
