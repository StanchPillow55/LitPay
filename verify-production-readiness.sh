#!/bin/bash

echo "🔍 LitPay Production Readiness Checklist"
echo "========================================"
echo ""

ERRORS=0
WARNINGS=0

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

check_pass() {
    echo -e "${GREEN}✓${NC} $1"
}

check_fail() {
    echo -e "${RED}✗${NC} $1"
    ERRORS=$((ERRORS + 1))
}

check_warn() {
    echo -e "${YELLOW}⚠${NC} $1"
    WARNINGS=$((WARNINGS + 1))
}

echo "## Backend Checks"
echo ""

# Check if backend dependencies are installed
if [ -f "package.json" ] && [ -d "node_modules" ]; then
    check_pass "Backend dependencies installed"
else
    check_fail "Backend dependencies missing (run: npm install)"
fi

# Check if .env exists (development)
if [ -f ".env" ]; then
    check_pass ".env file exists"
else
    check_warn ".env file missing (copy from .env.example)"
fi

# Check if critical backend files exist
BACKEND_FILES=("server.js" "db.js" "policy.js" "discovery.js" "x402-buyer.js" "schema.sql")
for file in "${BACKEND_FILES[@]}"; do
    if [ -f "$file" ]; then
        check_pass "Backend file: $file"
    else
        check_fail "Missing backend file: $file"
    fi
done

# Check if tests exist
TEST_FILES=("test-policy.js" "test-x402.js" "test-concurrency.js")
for file in "${TEST_FILES[@]}"; do
    if [ -f "$file" ]; then
        check_pass "Test file: $file"
    else
        check_warn "Missing test file: $file"
    fi
done

# Check if .env.production exists
if [ -f ".env.production" ]; then
    check_pass ".env.production file exists"
else
    check_warn ".env.production file missing (needed for production deployment)"
fi

# Check if secrets are in .gitignore
if grep -q ".env.production" .gitignore; then
    check_pass ".env.production in .gitignore"
else
    check_fail ".env.production not in .gitignore (security risk!)"
fi

echo ""
echo "## Frontend Checks"
echo ""

# Check if frontend directory exists
if [ -d "frontend" ]; then
    check_pass "Frontend directory exists"
    
    cd frontend
    
    # Check if frontend dependencies are installed
    if [ -f "package.json" ] && [ -d "node_modules" ]; then
        check_pass "Frontend dependencies installed"
    else
        check_warn "Frontend dependencies missing (run: cd frontend && npm install)"
    fi
    
    # Check if critical frontend files exist
    FRONTEND_FILES=("app/page.tsx" "app/layout.tsx" "app/session/[id]/page.tsx" "app/session/[id]/report/page.tsx")
    for file in "${FRONTEND_FILES[@]}"; do
        if [ -f "$file" ]; then
            check_pass "Frontend file: $file"
        else
            check_fail "Missing frontend file: $file"
        fi
    done
    
    # Check if .env.local exists
    if [ -f ".env.local" ]; then
        check_pass ".env.local file exists"
    else
        check_warn ".env.local file missing (copy from .env.local.example)"
    fi
    
    # Check if .env.production exists
    if [ -f ".env.production" ]; then
        check_pass ".env.production file exists"
    else
        check_warn ".env.production file missing (needed for production deployment)"
    fi
    
    # Try to build frontend
    echo ""
    echo "Building frontend..."
    if npm run build > /dev/null 2>&1; then
        check_pass "Frontend build successful"
    else
        check_fail "Frontend build failed (run: npm run build for details)"
    fi
    
    cd ..
else
    check_fail "Frontend directory missing"
fi

echo ""
echo "## Documentation Checks"
echo ""

DOC_FILES=("README.md" "QUICKSTART.md" "PRODUCTION_DEPLOYMENT.md" "FRONTEND_SUMMARY.md")
for file in "${DOC_FILES[@]}"; do
    if [ -f "$file" ]; then
        check_pass "Documentation: $file"
    else
        check_warn "Missing documentation: $file"
    fi
done

echo ""
echo "## Database Schema Checks"
echo ""

if [ -f "schema.sql" ]; then
    check_pass "schema.sql exists"
    
    # Check for required tables
    TABLES=("sessions" "policy_reservations" "spend_ledger" "artifacts" "invoices" "meter_events" "webhook_events")
    for table in "${TABLES[@]}"; do
        if grep -q "CREATE TABLE.*$table" schema.sql; then
            check_pass "Table definition: $table"
        else
            check_fail "Missing table definition: $table"
        fi
    done
else
    check_fail "schema.sql missing"
fi

if [ -f "migrations/003_policy_lock.sql" ]; then
    check_pass "Policy lock migration exists"
else
    check_warn "Policy lock migration missing"
fi

echo ""
echo "## Security Checks"
echo ""

# Check if wallet files are ignored
if grep -q "wallet.*json" .gitignore; then
    check_pass "Wallet files in .gitignore"
else
    check_warn "Wallet files not in .gitignore (add: *-wallet-*.json)"
fi

# Check if .env files are ignored
if grep -q "^\.env" .gitignore; then
    check_pass ".env files in .gitignore"
else
    check_fail ".env files not in .gitignore (security risk!)"
fi

# Check for any committed secrets (basic check)
if git log --all --full-history --source -- ".env" 2>/dev/null | grep -q "\.env"; then
    check_fail "WARNING: .env file found in git history!"
else
    check_pass "No .env files in git history"
fi

echo ""
echo "## Production Readiness Summary"
echo "================================"
echo ""

if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "${GREEN}✅ All checks passed!${NC}"
    echo "Your project is ready for production deployment."
    exit 0
elif [ $ERRORS -eq 0 ]; then
    echo -e "${YELLOW}⚠️  $WARNINGS warnings found${NC}"
    echo "Your project is mostly ready, but review the warnings above."
    exit 0
else
    echo -e "${RED}❌ $ERRORS errors and $WARNINGS warnings found${NC}"
    echo "Please fix the errors above before deploying to production."
    exit 1
fi
