# LitPay CI/CD Pipeline

**Version:** 1.0  
**Last Updated:** 2025-11-15

---

## Overview

The CI pipeline validates code quality, security, and compliance with METRICS.md requirements on every push and pull request.

**Workflow File:** `.github/workflows/ci.yml`

---

## Pipeline Jobs

### 1. Environment Validation (`env-example-validate`)

**Purpose:** Ensures `.env.example` has no secrets and all required keys

**Checks:**
- ✅ All keys from `specs/env.schema.md` present in `.env.example`
- ✅ No real secrets (Stripe keys, AWS keys, Anthropic keys, etc.)
- ✅ All keys have documentation (comments)
- ✅ Runtime ≤2s

**Command:** `npm run validate:env`

**METRICS.md:** Artifacts 2.1 (100% variables documented, 0 secrets)

---

### 2. Security Checks (`security-checks`)

**Purpose:** Scan for secrets in commit history and verify pre-commit hook

**Checks:**
- ✅ No secrets in last 10 commits
- ✅ Pre-commit hook installed and executable
- ✅ Patterns checked:
  - Stripe: `sk_live_`, `sk_test_`, `whsec_`, `pk_`
  - Anthropic: `sk-ant-`
  - AWS: `AKIA[0-9A-Z]{16}`
  - Private keys: `0x[a-fA-F0-9]{64}`

**METRICS.md:** Security 9.1 (0 secrets committed)

---

### 3. Database Seed Test (`database-seed-test`)

**Purpose:** Verify seed script works and meets performance requirements

**Environment:**
- PostgreSQL 15 (Docker service)
- Test database: `litpay_test`

**Checks:**
- ✅ Migrations run successfully
- ✅ Seed script completes in ≤5s
- ✅ Creates 1 session, ≥5 papers, ≥1 artifact

**Command:** `npm run seed`

**METRICS.md:** Backend 1.1 (seed script performance)

---

### 4. Lint & Format (`lint-and-format`)

**Purpose:** Basic code quality checks

**Checks:**
- ✅ No `console.log` in production code
- ✅ Valid JSON files
- 📝 Reports TODO/FIXME count

---

### 5. Metrics Alignment (`metrics-check`)

**Purpose:** Verify required documentation exists

**Checks:**
- ✅ `METRICS.md` present
- ✅ `IMPLEMENTATION_PLAN.md` present
- ✅ `FRONTEND_ARCHITECTURE.md` present
- ✅ `DEMO.md` present
- ✅ `.env.example` present
- ✅ `specs/env.schema.md` present
- ✅ `METRICS.md` has "Overall Progress Summary"

---

### 6. Summary (`summary`)

**Purpose:** Aggregate all job results

**Behavior:**
- Runs after all jobs complete
- Fails if any job fails
- Shows status of all checks

---

## Local Development

### Prerequisites

```bash
# Ensure Node.js 20.x is installed
node --version  # Should be 20.x

# Install dependencies
npm install

# Ensure pre-commit hook is executable
chmod +x .git/hooks/pre-commit
```

### Run CI Checks Locally

```bash
# 1. Environment validation
npm run validate:env

# 2. Database seed test
npm run migrate
time npm run seed  # Should complete in < 5s

# 3. Check for console.log (manual)
find . -name "*.js" -not -path "*/node_modules/*" -not -path "*/test*" -exec grep -l "console.log" {} \;

# 4. Validate JSON files
node -e "JSON.parse(require('fs').readFileSync('package.json'))"

# 5. Test pre-commit hook
echo "test=sk_test_123..." > test.js
git add test.js
git commit -m "test"  # Should be blocked
rm test.js
```

---

## Triggering the Pipeline

**Automatic triggers:**
- Push to `main` or `master` branch
- Pull request to `main` or `master` branch

**Manual trigger:**
- Go to GitHub Actions tab
- Select "CI" workflow
- Click "Run workflow"

---

## Pipeline Artifacts

**Environment Validation Logs:**
- Uploaded on every run (pass or fail)
- Retention: 7 days
- Download from GitHub Actions UI

---

## Troubleshooting

### Job: `env-example-validate` fails

**Error:** Missing required keys
```bash
❌ Missing keys in .env.example: ['CDP_API_KEY_ID', ...]
```

**Fix:** Add missing keys to `.env.example` with placeholder values

---

**Error:** Potential secrets detected
```bash
❌ POTENTIAL REAL SECRETS DETECTED:
   - STRIPE_SECRET_KEY (line 82)
```

**Fix:** Replace real secret with placeholder: `<YOUR_STRIPE_SECRET_KEY>`

---

### Job: `security-checks` fails

**Error:** Secrets in commit history
```bash
⚠️  Pattern detected: sk_live_[a-zA-Z0-9]{24,}
```

**Fix:** 
1. Use BFG Repo-Cleaner to remove secrets from history
2. Rotate compromised secrets immediately
3. Force push cleaned history (coordinate with team)

---

**Error:** Pre-commit hook not found
```bash
⚠️  Pre-commit hook not found or not executable
```

**Fix:**
```bash
chmod +x .git/hooks/pre-commit
git add .git/hooks/pre-commit
git commit -m "chore: ensure pre-commit hook is executable"
```

---

### Job: `database-seed-test` fails

**Error:** Seed script timeout (>5s)
```bash
❌ Seed script took 6.234s (exceeds 5s requirement)
```

**Fix:** Optimize seed script:
- Batch inserts
- Reduce database round trips
- Use transactions

---

**Error:** Migrations fail
```bash
Error: relation "sessions" already exists
```

**Fix:** Ensure migrations are idempotent or reset test DB

---

### Job: `lint-and-format` fails

**Error:** console.log found
```bash
⚠️  Found console.log statements in production code
./server.js
```

**Fix:** Remove or replace with proper logging:
```javascript
// Before
console.log('User created:', user);

// After
logger.info('User created', { userId: user.id });
```

---

### Job: `metrics-check` fails

**Error:** Required file missing
```bash
❌ FRONTEND_ARCHITECTURE.md missing
```

**Fix:** Create missing documentation file

---

## Performance Requirements

| Check | Requirement | Typical Runtime |
|-------|-------------|-----------------|
| Environment validation | ≤2s | ~0.04s |
| Seed script | ≤5s | ~0.11s |
| Security scan | <30s | ~5s |
| Full pipeline | <5min | ~2min |

---

## Status Badge

Add to `README.md`:

```markdown
![CI](https://github.com/your-org/LitPay/workflows/CI/badge.svg)
```

---

## Integration with METRICS.md

The CI pipeline validates:

| METRICS.md Section | CI Job | Pass Criteria |
|-------------------|--------|---------------|
| 1.1 Seed script | database-seed-test | ≤5s runtime |
| 2.1 .env.example | env-example-validate | 0 secrets, 100% keys |
| 9.1 No secrets | security-checks | Clean commit history |
| 6 Documentation | metrics-check | All files present |

---

## Future Enhancements

**Planned:**
- [ ] Add gitleaks integration for comprehensive secret scanning
- [ ] E2E tests in CI (with mock services)
- [ ] Code coverage reporting
- [ ] Performance regression tests
- [ ] Docker image build and push
- [ ] Automated dependency updates (Dependabot)

**Stretch:**
- [ ] Deploy preview environments for PRs
- [ ] Visual regression testing
- [ ] Load testing benchmarks
- [ ] Security vulnerability scanning (npm audit)

---

## References

- **GitHub Actions Docs:** https://docs.github.com/en/actions
- **METRICS.md:** Project success criteria
- **VALIDATION_REPORT.md:** Task validation results
