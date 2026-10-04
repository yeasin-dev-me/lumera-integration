# Lumera Cross-System Integration (`lumera-integration`)

## Purpose
`lumera-integration` provides cross-system boundary verification, contract compliance testing, and end-to-end (E2E) workflow automation across the Storefront, Custom CMS, and Headless Backend API.

**Boundary Rule:** This repository must **NOT** duplicate application code. It serves solely as the integration testing harness for the Lumera ecosystem.

---

## Architecture Role
In the Lumera ecosystem:
* Validates end-to-end user journeys and operational scenarios across independent services.
* Verifies contract adherence between:
  * Storefront (`lumera-frontend`) ↔ Backend (`lumera-backend`)
  * Custom CMS (`lumera-cms`) ↔ Backend (`lumera-backend`)
* Validates system boundaries: security boundaries, token handling, permission gating, and error standardization.

```text
               lumera-integration
            ┌───────────┼───────────┐
            ▼           ▼           ▼
     lumera-frontend  lumera-cms  lumera-backend
```

---

## Technology Stack
* **Runtime:** Node.js 20+ (ES Modules)
* **Test Suite:** Native Node.js Test Harness / Playwright
* **Assertions:** Node built-in `assert`

---

## Repository Structure
```text
lumera-integration/
├── test_integration.mjs     # Cross-service API boundary test suite
├── package.json             # Test scripts and dependencies
├── .env.example             # Test environment endpoints
└── AGENTS.md                # AI agent operating instructions
```

---

## Local Development
### Prerequisites
* Running instance of `lumera-backend` (port 8000)
* Running instances of `lumera-frontend` (port 3000) and `lumera-cms` (port 3001) for E2E tests

### Installation & Run
```bash
# Copy test environment variables
cp .env.example .env

# Run automated integration tests
npm test
```

---

## Environment Variables
Defined in `.env.example`:
```env
API_BASE_URL=http://127.0.0.1:8000/api/v1
STOREFRONT_URL=http://localhost:3000
CMS_URL=http://localhost:3001
```

---

## Running Tests
```bash
# Execute integration test harness
node test_integration.mjs
```
The suite verifies:
1. System Health Endpoint (`/api/v1/health/`)
2. Storefront Public Config API (`/api/v1/storefront/config/`)
3. Customer Authentication Boundary (`/api/v1/customer/me/`)
4. CMS Admin Authentication Boundary (`/api/v1/admin/auth/me/`)
5. Global Standard JSON 404 Handler (`/api/v1/*`)

---

## Build
No compilation build step is required for integration test scripts.

---

## Related Repositories
* [lumera-spec](https://github.com/yeasin-dev-me/lumera-spec) — Single Source of Truth for architecture & contracts
* [lumera-backend](https://github.com/yeasin-dev-me/lumera-backend) — Headless Django REST API
* [lumera-frontend](https://github.com/yeasin-dev-me/lumera-frontend) — Customer-facing Next.js Storefront
* [lumera-cms](https://github.com/yeasin-dev-me/lumera-cms) — Operational Next.js CMS
* [lumera-devops](https://github.com/yeasin-dev-me/lumera-devops) — Deployment, Docker, and Nginx configurations

---

## Documentation
* Testing Strategy: [lumera-spec/testing/testing-strategy.md](https://github.com/yeasin-dev-me/lumera-spec/blob/main/testing/testing-strategy.md)
* API Contract: [lumera-spec/contracts/api-contract.yaml](https://github.com/yeasin-dev-me/lumera-spec/blob/main/contracts/api-contract.yaml)

---

## Contribution / Git Workflow
1. Branch from `main`: `feature/<test-suite>` or `fix/<test-fix>`.
2. Follow Conventional Commits (`test: ...`, `chore: ...`).
3. Ensure all tests pass cleanly.
4. Merge to `main` via squash-and-merge.
