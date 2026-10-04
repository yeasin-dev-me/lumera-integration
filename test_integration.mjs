/**
 * Integration Test Suite for Lumera Foundation (TASK-002)
 *
 * Verifies that:
 * 1. Backend /api/v1/health/ responds with status: ok
 * 2. Storefront API boundary (/api/v1/storefront/config/) responds with valid config
 * 3. Customer API boundary (/api/v1/customer/me/) protects unauthenticated access
 * 4. CMS Admin API boundary (/api/v1/admin/auth/me/) protects unauthenticated/non-staff access
 * 5. Error formatting across all endpoints conforms to standard { error: { code, message } } envelope
 */

const BASE_URL = process.env.API_BASE_URL || "http://127.0.0.1:8000/api/v1";

console.log(`\n======================================================`);
console.log(` LUMERA INTEGRATION SUITE: Storefront & CMS ↔ Backend`);
console.log(` Target Backend API: ${BASE_URL}`);
console.log(`======================================================\n`);

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

  // Test 3: Customer protected endpoint returns standard error format
  await runTest("Customer Authentication Boundary (/customer/me/)", async () => {
    const res = await fetch(`${BASE_URL}/customer/me/`);
    assert(res.status === 401, `Expected 401 Unauthorized but got ${res.status}`);
    const data = await res.json();
    assert(data.error && typeof data.error === "object", "Expected standard 'error' envelope");
    assert(data.error.code === "not_authenticated", `Expected code 'not_authenticated' but got '${data.error?.code}'`);
    assert(data.error.message, "Expected human-readable message in error envelope");
  });

  // Test 4: CMS Admin boundary protects unauthenticated access
  await runTest("CMS Admin Authentication Boundary (/admin/auth/me/)", async () => {
    const res = await fetch(`${BASE_URL}/admin/auth/me/`);
    assert(res.status === 401 || res.status === 403, `Expected 401/403 but got ${res.status}`);
    const data = await res.json();
    assert(data.error && typeof data.error === "object", "Expected standard 'error' envelope");
    assert(data.error.code, "Expected error code in response envelope");
  });

  // Test 5: Not-Found returns standard JSON envelope, not HTML
  await runTest("Global Standard JSON 404 Handler", async () => {
    const res = await fetch(`${BASE_URL}/non-existent-test-path/`);
    assert(res.status === 404, `Expected 404 but got ${res.status}`);
    const contentType = res.headers.get("content-type") || "";
    assert(contentType.includes("application/json"), `Expected application/json header but got '${contentType}'`);
    const data = await res.json();
    assert(data.error?.code === "not_found", `Expected error.code 'not_found' but got '${data.error?.code}'`);
  });

  console.log(`\n------------------------------------------------------`);
  console.log(` Results: ${passedTests}/${totalTests} integration tests passed.`);
  console.log(`------------------------------------------------------\n`);

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal test runner error:", err);
  process.exit(1);
});
