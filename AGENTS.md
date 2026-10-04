# AGENTS.md — lumera-integration

## Repository Responsibility
`lumera-integration` owns the cross-system contract compliance and end-to-end (E2E) integration test suites. It verifies that Storefront, CMS, and Backend services collaborate correctly according to approved contracts.

## Allowed Technologies
* Node.js 20+ (ES Modules)
* JavaScript / TypeScript
* Playwright (E2E scenarios)
* Node native test / assert runners

## Directory Conventions
* Root test scripts: `test_integration.mjs`.
* `e2e/`: Playwright user journey tests for Storefront and CMS.
* `contracts/`: Automated schema validation tests.

## Coding Conventions
* Clear assertions with descriptive error messaging.
* Independent test execution without relying on unseeded state.
* Clean teardown of test-generated records.

## Testing Requirements
* Integration suite must exit with code 0: `node test_integration.mjs`.
* Fail on broken contracts or non-standard error responses.

## Git Rules
* Branch naming: `feature/<scenario>`, `test/<fix-name>`, `chore/<chore-name>`.
* Commit messages: Conventional Commits (`test: ...`, `chore: ...`).
* Target branch: `main` (protected; changes merged via PR).

## Security Rules
* Never commit real credentials, tokens, or production API keys.
* Integration test tokens must use ephemeral or local test credentials.

## What the Agent Must NOT Modify
* Do not duplicate application logic from backend, frontend, or CMS into this repository.
* Do not alter root project architecture without an approved ADR in `lumera-spec`.

## Where Shared Project Specification Lives
All shared architectural specifications and API contracts live in:
`lumera-spec/` (e.g., `contracts/api-contract.yaml`, `testing/testing-strategy.md`).

## How to Handle Architecture Changes
If API contracts change:
1. Review the updated contract in `lumera-spec/contracts/api-contract.yaml`.
2. Update the integration assertions to reflect the approved contract.

## Definition of Done
* Integration test suite completes with 100% passing tests against running services.
* Tests validate both happy paths and edge cases (401, 403, 404 error formatting).
