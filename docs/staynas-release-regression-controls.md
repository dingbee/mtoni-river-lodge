# StayNas release and regression controls

## Mandatory release sequence
1. Inspect the current production baseline and exact files/routes affected.
2. Implement the smallest scoped change; preserve unrelated accepted behaviour.
3. Run the production build and applicable unit/integration tests.
4. Run browser regression checks at mobile and desktop breakpoints.
5. Review the preview deployment against accepted UI baselines.
6. Merge only when required checks pass.
7. Deploy the exact merged commit; verify READY and smoke-test production.
8. Record commit, test runs, deployment ID, and deferred acceptance gates.

## Protected user journeys
The StayNas release regression gate runs for pull requests to main and pushes to main. It enforces a production build and Chromium browser test for public/mobile navigation.

The browser test protects Rooms and Availability links, the StayNas AI panel, Staff & administration, its /admin destination, helper text and final drawer placement, drawer close behaviour, and the desktop Book now action.

## Extending coverage
When changing a critical route or workflow, add or update a browser assertion in tests/e2e/ in the same change. Prioritize authentication, reservations, payments and reconciliation, housekeeping access, tenant scoping, and finance. Tests requiring credentials or isolated database fixtures must use dedicated CI secrets/fixtures, never production credentials or production data.

## Production safety
- Never run destructive acceptance tests against production.
- Never change production data, memberships, or roles as part of UI restoration.
- Never deploy an unverified commit to production.
- A successful build is not proof of browser-level correctness.
- Keep rollback to the last known-good production deployment available.

## Required branch protection
Repository administrators should enable branch protection/rulesets for main: require pull requests, require Production build and Public and mobile navigation E2E checks, require branches up to date, and block force pushes/deletion. The workflow creates checks; an administrator must enable enforcement in repository settings.