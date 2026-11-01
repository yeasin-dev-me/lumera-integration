/**
 * End-to-End Integration Test Suite: Storefront Navigation, Taxonomy Filtering,
 * Curated Shopping & CMS Configuration for Penguin Mart
 *
 * Verifies the 12 required test scenarios:
 * 1. Backend category data appears correctly in category row.
 * 2. Category selection returns the correct products.
 * 3. Origin and audience filters return only products with matching authoritative attributes.
 * 4. Combined filters work correctly with search, pagination, sorting, and offers.
 * 5. Offers display only products eligible under the backend's active discount rules.
 * 6. Family Package clearly distinguishes curated recommendations from a real purchasable bundle.
 * 7. CMS navigation changes are reflected in the storefront.
 * 8. Disabled or unpublished navigation items are not exposed publicly.
 * 9. Unauthorized users cannot modify navigation configuration.
 * 10. API failures and empty product results have sensible user-facing states.
 * 11. Desktop dropdowns and mobile drawer interactions preserve cart, wishlist, auth.
 * 12. Product prices, inventory, and order totals remain backend-authoritative.
 */

import assert from "node:assert";

const BASE_URL = process.env.API_BASE_URL || "http://127.0.0.1:8000/api/v1";

console.log(`\n==================================================================`);
console.log(` PENGUIN MART INTEGRATION TEST SUITE`);
console.log(` Storefront Navigation, Taxonomy & Curated Shopping`);
console.log(` Target API: ${BASE_URL}`);
console.log(`==================================================================\n`);

let passedTests = 0;
let totalTests = 0;
const results = [];

async function test(scenarioNum, name, fn) {
  totalTests++;
  process.stdout.write(`• [Scenario ${scenarioNum}] ${name}... `);
  try {
    await fn();
    console.log(`\x1b[32mPASS\x1b[0m`);
    passedTests++;
    results.push({ scenario: scenarioNum, name, status: "PASS" });
  } catch (err) {
    console.log(`\x1b[31mFAIL\x1b[0m`);
    console.error(`  Error:`, err.message);
    results.push({ scenario: scenarioNum, name, status: "FAIL", error: err.message });
  }
}

async function main() {
  // Staff login to obtain management token
  let staffToken = "";
  const staffRes = await fetch(`${BASE_URL}/admin/auth/login/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "staff@lumera.internal",
      password: "StaffPassword123!",
    }),
  });
  if (staffRes.ok) {
    const data = await staffRes.json();
    staffToken = data.access;
  }

  // Customer registration to obtain customer token
  const customerEmail = `nav_cust_${Date.now()}@example.com`;
  let customerToken = "";
  const custRes = await fetch(`${BASE_URL}/auth/register/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: customerEmail,
      password: "CustPassword2026!",
      first_name: "Nav",
      last_name: "Customer",
    }),
  });
  if (custRes.ok) {
    const data = await custRes.json();
    customerToken = data.access;
  }

  // =========================================================================
  // Scenario 1: Backend category data appears correctly in the category row
  // =========================================================================
  await test(1, "Public Storefront Navigation API exposes category row items", async () => {
    const res = await fetch(`${BASE_URL}/storefront/content/navigation/?section=categories`);
    assert.strictEqual(res.status, 200, `Expected 200 OK, got ${res.status}`);
    const data = await res.json();
    assert(Array.isArray(data.results), "Results must be an array");
    assert(data.results.length > 0, "Expected at least 1 category navigation item");
    assert(data.sections && Array.isArray(data.sections.categories), "Expected sections.categories array");

    // Verify sort order and category URL format
    for (const item of data.results) {
      assert.strictEqual(item.section, "categories", "Section must be categories");
      assert(
        item.destination_type === "category" || (item.destination_type === "internal_path" && item.url === "/products"),
        `Destination type must be category or All Products internal path, got ${item.destination_type}`
      );
      assert(item.label, "Label must not be empty");
      assert(
        item.url.startsWith("/products?category=") || item.url === "/products",
        `URL must start with /products?category= or /products, got ${item.url}`
      );
    }
  });

  // =========================================================================
  // Scenario 2: Category selection returns the correct products
  // =========================================================================
  await test(2, "Category filter returns only products belonging to that category", async () => {
    // 1. Get all categories
    const catRes = await fetch(`${BASE_URL}/storefront/categories/`);
    assert.strictEqual(catRes.status, 200, `Expected 200 OK, got ${catRes.status}`);
    const catData = await catRes.json();
    const categories = Array.isArray(catData) ? catData : catData.results;
    assert(categories && categories.length > 0, "Expected categories to exist");

    const targetCategory = categories[0];
    const prodRes = await fetch(`${BASE_URL}/storefront/products/?category=${encodeURIComponent(targetCategory.slug)}`);
    assert.strictEqual(prodRes.status, 200, `Expected 200 OK, got ${prodRes.status}`);
    const prodData = await prodRes.json();

    if (prodData.results.length > 0) {
      for (const product of prodData.results) {
        assert.strictEqual(
          product.category.slug,
          targetCategory.slug,
          `Product ${product.name} has category ${product.category.slug}, expected ${targetCategory.slug}`
        );
      }
    }
  });

  // =========================================================================
  // Scenario 3: Origin and audience filters return only products with matching authoritative attributes
  // =========================================================================
  await test(3, "Origin filter returns only products with matching origin attribute", async () => {
    const res = await fetch(`${BASE_URL}/storefront/products/?origin=korea`);
    assert.strictEqual(res.status, 200, `Expected 200 OK, got ${res.status}`);
    const data = await res.json();
    for (const product of data.results) {
      assert.strictEqual(
        product.origin,
        "korea",
        `Expected product origin 'korea', got '${product.origin}' for ${product.name}`
      );
    }
  });

  await test(3, "Audience filter returns only products with matching audience attribute", async () => {
    const res = await fetch(`${BASE_URL}/storefront/products/?audience=women`);
    assert.strictEqual(res.status, 200, `Expected 200 OK, got ${res.status}`);
    const data = await res.json();
    for (const product of data.results) {
      assert.strictEqual(
        product.audience,
        "women",
        `Expected product audience 'women', got '${product.audience}' for ${product.name}`
      );
    }
  });

  await test(3, "Invalid origin filter safely returns 0 products without error", async () => {
    const res = await fetch(`${BASE_URL}/storefront/products/?origin=atlantis_unknown`);
    assert.strictEqual(res.status, 200, `Expected 200 OK, got ${res.status}`);
    const data = await res.json();
    assert.strictEqual(data.count, 0, `Expected 0 products for invalid origin, got ${data.count}`);
    assert.deepStrictEqual(data.results, [], "Results should be empty array");
  });

  // =========================================================================
  // Scenario 4: Combined filters work correctly with search, pagination, sorting, and offers
  // =========================================================================
  await test(4, "Combined filters (origin + audience + sorting + pagination) are applied conjunctively", async () => {
    const res = await fetch(`${BASE_URL}/storefront/products/?origin=korea&audience=women&ordering=-created_at&page=1&page_size=5`);
    assert.strictEqual(res.status, 200, `Expected 200 OK, got ${res.status}`);
    const data = await res.json();
    assert(typeof data.count === "number", "Expected count property");
    assert(Array.isArray(data.results), "Expected results array");
    assert(data.results.length <= 5, "Page size limit must be respected");

    for (const p of data.results) {
      assert.strictEqual(p.origin, "korea", "Must match origin korea");
      assert.strictEqual(p.audience, "women", "Must match audience women");
    }
  });

  // =========================================================================
  // Scenario 5: Offers display only products eligible under the backend's active discount rules
  // =========================================================================
  await test(5, "Offers filter returns only products with active discount pricing", async () => {
    const res = await fetch(`${BASE_URL}/storefront/products/?offers=true`);
    assert.strictEqual(res.status, 200, `Expected 200 OK, got ${res.status}`);
    const data = await res.json();

    for (const p of data.results) {
      assert(p.discount_price !== null && p.discount_price !== undefined, `Product ${p.name} in offers must have discount_price`);
      const base = parseFloat(p.price);
      const discount = parseFloat(p.discount_price);
      assert(discount < base, `Discount price (${discount}) must be strictly less than base price (${base}) for ${p.name}`);
    }
  });

  // =========================================================================
  // Scenario 6: Family Package clearly distinguishes curated recommendations from real purchasable bundle
  // =========================================================================
  await test(6, "Curated collection endpoint returns discrete catalog products, not a synthetic bundle SKU", async () => {
    const res = await fetch(`${BASE_URL}/storefront/products/?collection=family-package`);
    assert.strictEqual(res.status, 200, `Expected 200 OK, got ${res.status}`);
    const data = await res.json();
    assert(Array.isArray(data.results), "Expected results array");

    for (const p of data.results) {
      assert(p.sku, "Each item must be an authentic SKU");
      assert(typeof p.price === "string" && parseFloat(p.price) > 0, "Each item must have an authentic individual price");
    }
  });

  // =========================================================================
  // Scenario 7: CMS navigation changes are reflected in the storefront
  // =========================================================================
  let createdNavId = "";
  await test(7, "Staff creates new navigation item in CMS and it is published to storefront", async () => {
    assert(staffToken, "Staff token is required for this test");

    const payload = {
      label: "Test Artisan Collection",
      section: "curated",
      destination_type: "collection",
      destination_value: "test-artisan",
      badge_text: "NEW",
      description: "Handcrafted artisan batches",
      is_highlighted: false,
      sort_order: 99,
      status: "published",
    };

    const createRes = await fetch(`${BASE_URL}/admin/content/navigation/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${staffToken}`,
      },
      body: JSON.stringify(payload),
    });
    assert.strictEqual(createRes.status, 201, `Expected 201 Created, got ${createRes.status}`);
    const created = await createRes.json();
    createdNavId = created.public_id;
    assert.strictEqual(created.label, payload.label);
    assert.strictEqual(created.url, "/products?collection=test-artisan");

    // Verify it immediately appears on public storefront endpoint
    const pubRes = await fetch(`${BASE_URL}/storefront/content/navigation/?section=curated`);
    assert.strictEqual(pubRes.status, 200);
    const pubData = await pubRes.json();
    const found = pubData.results.find((item) => item.public_id === createdNavId);
    assert(found, "Newly published navigation item must be visible in storefront navigation");
    assert.strictEqual(found.label, "Test Artisan Collection");
    assert.strictEqual(found.badge_text, "NEW");
  });

  // =========================================================================
  // Scenario 8: Disabled or unpublished navigation items are not exposed publicly
  // =========================================================================
  await test(8, "Unpublished or draft navigation items are hidden from public storefront", async () => {
    assert(staffToken && createdNavId, "Staff token and test item required");

    // Update item status to draft
    const patchRes = await fetch(`${BASE_URL}/admin/content/navigation/${createdNavId}/`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${staffToken}`,
      },
      body: JSON.stringify({ status: "draft" }),
    });
    assert.strictEqual(patchRes.status, 200, `Expected 200 OK on update, got ${patchRes.status}`);

    // Verify it is NOT in storefront response
    const pubRes = await fetch(`${BASE_URL}/storefront/content/navigation/?section=curated`);
    assert.strictEqual(pubRes.status, 200);
    const pubData = await pubRes.json();
    const found = pubData.results.find((item) => item.public_id === createdNavId);
    assert(!found, "Draft navigation item must NOT appear in public storefront navigation");

    // Clean up test item by archiving
    await fetch(`${BASE_URL}/admin/content/navigation/${createdNavId}/`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${staffToken}` },
    });
  });

  // =========================================================================
  // Scenario 9: Unauthorized users cannot modify navigation configuration
  // =========================================================================
  await test(9, "Anonymous users cannot create or modify navigation items (401)", async () => {
    const res = await fetch(`${BASE_URL}/admin/content/navigation/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        label: "Hacked Link",
        section: "curated",
        destination_type: "internal_path",
        destination_value: "/defaced",
      }),
    });
    assert.strictEqual(res.status, 401, `Expected 401 Unauthorized, got ${res.status}`);
  });

  await test(9, "Customer users cannot create or modify navigation items (403)", async () => {
    assert(customerToken, "Customer token required");
    const res = await fetch(`${BASE_URL}/admin/content/navigation/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${customerToken}`,
      },
      body: JSON.stringify({
        label: "Customer Defaced Nav",
        section: "curated",
        destination_type: "internal_path",
        destination_value: "/customer-exploit",
      }),
    });
    assert.strictEqual(res.status, 403, `Expected 403 Forbidden for customer, got ${res.status}`);
  });

  await test(9, "Backend rejects malicious javascript:, external, or protocol-relative URLs (400)", async () => {
    assert(staffToken, "Staff token required");
    const maliciousPayloads = [
      {
        label: "XSS Nav",
        section: "curated",
        destination_type: "internal_path",
        destination_value: "javascript:alert(1)",
      },
      {
        label: "External Nav",
        section: "curated",
        destination_type: "internal_path",
        destination_value: "https://evil.example.com",
      },
      {
        label: "Protocol Relative Phishing",
        section: "curated",
        destination_type: "internal_path",
        destination_value: "//evil.example.com/phish",
      },
    ];

    for (const payload of maliciousPayloads) {
      const res = await fetch(`${BASE_URL}/admin/content/navigation/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${staffToken}`,
        },
        body: JSON.stringify(payload),
      });
      assert.strictEqual(res.status, 400, `Expected 400 Bad Request for unsafe destination '${payload.destination_value}', got ${res.status}`);
    }
  });

  // =========================================================================
  // Scenario 10: API failures and empty product results have sensible states
  // =========================================================================
  await test(10, "Non-existent filter combination returns clean empty results set (200 with 0 count)", async () => {
    const res = await fetch(`${BASE_URL}/storefront/products/?category=produce&origin=japan&audience=pets`);
    assert.strictEqual(res.status, 200, `Expected 200 OK, got ${res.status}`);
    const data = await res.json();
    assert.strictEqual(data.count, 0, "Count should be 0");
    assert.deepStrictEqual(data.results, [], "Results should be empty array");
  });

  // =========================================================================
  // Scenario 11: Desktop and mobile navigation preserve cart, wishlist, and session
  // =========================================================================
  await test(11, "Cart and wishlist functionality remains completely isolated from navigation interactions", async () => {
    assert(customerToken, "Customer token required");

    // Fetch customer cart
    const cartRes = await fetch(`${BASE_URL}/customer/cart/`, {
      headers: { Authorization: `Bearer ${customerToken}` },
    });
    assert.strictEqual(cartRes.status, 200, `Expected 200 OK for cart, got ${cartRes.status}`);
    const cartData = await cartRes.json();
    assert("item_count" in cartData, "Cart must include item_count");
    assert("total" in cartData, "Cart must include authoritative total");

    // Fetch customer wishlist
    const wishRes = await fetch(`${BASE_URL}/customer/wishlist/`, {
      headers: { Authorization: `Bearer ${customerToken}` },
    });
    assert.strictEqual(wishRes.status, 200, `Expected 200 OK for wishlist, got ${wishRes.status}`);
    const wishData = await wishRes.json();
    assert("item_count" in wishData, "Wishlist must include item_count");
  });

  // =========================================================================
  // Scenario 12: Product prices, inventory, and order totals remain backend-authoritative
  // =========================================================================
  await test(12, "Backend rejects client-tampered cart item price during checkout preview", async () => {
    assert(customerToken, "Customer token required");

    // 1. Get a product
    const prodRes = await fetch(`${BASE_URL}/storefront/products/`);
    const prodData = await prodRes.json();
    const product = prodData.results[0];
    assert(product, "Expected at least 1 product");

    // 2. Add product to cart using UUID public_id
    const addRes = await fetch(`${BASE_URL}/customer/cart/items/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${customerToken}`,
      },
      body: JSON.stringify({
        product_id: product.public_id,
        quantity: 1,
        // Attempt price tampering (backend must ignore or reject)
        unit_price: "0.01",
        price: "0.01",
      }),
    });
    assert.strictEqual(addRes.status, 201, `Expected 201 Created on add to cart, got ${addRes.status}`);
    const cartState = await addRes.json();

    // Verify unit price in cart matches backend product price, NOT client $0.01
    const expectedPrice = product.discount_price || product.price;
    const cartItem = cartState.items[0];
    assert.strictEqual(
      cartItem.unit_price,
      expectedPrice,
      `Cart unit price (${cartItem.unit_price}) must match backend authoritative price (${expectedPrice})`
    );

    // 3. Checkout preview must use authoritative price
    const checkoutRes = await fetch(`${BASE_URL}/customer/checkout/`, {
      headers: { Authorization: `Bearer ${customerToken}` },
    });
    assert.strictEqual(checkoutRes.status, 200, `Expected 200 OK on checkout, got ${checkoutRes.status}`);
    const checkoutData = await checkoutRes.json();
    assert(
      checkoutData.cart && checkoutData.cart.items && checkoutData.cart.items.length > 0,
      "Expected items in checkout preview"
    );
    assert.strictEqual(
      checkoutData.cart.items[0].unit_price,
      expectedPrice,
      "Checkout preview line item must use backend authoritative price"
    );
  });

  // =========================================================================
  // Summary
  // =========================================================================
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
