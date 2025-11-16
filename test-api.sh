#!/bin/bash

echo "🧪 Testing LitPay API Endpoints"
echo "================================"
echo ""

BASE_URL="http://localhost:3000"

# Test 1: Create session
echo "1️⃣  POST /api/session - Create new session"
SESSION_RESPONSE=$(curl -s -X POST ${BASE_URL}/api/session \
  -H "Content-Type: application/json" \
  -d '{"userId": "test-user-123"}')
echo "$SESSION_RESPONSE" | jq '.'
SESSION_ID=$(echo "$SESSION_RESPONSE" | jq -r '.sessionId')
echo "Session ID: $SESSION_ID"
echo ""

# Test 2: Get session details
echo "2️⃣  GET /api/session/:id - Get session details"
curl -s ${BASE_URL}/api/session/${SESSION_ID} | jq '.'
echo ""

# Test 3: Policy check - allowed
echo "3️⃣  POST /api/policy/can-spend - Check if 100¢ spend is allowed"
curl -s -X POST ${BASE_URL}/api/policy/can-spend \
  -H "Content-Type: application/json" \
  -d "{\"amountCents\": 100, \"sessionId\": \"${SESSION_ID}\", \"provider\": \"x402\"}" | jq '.'
echo ""

# Test 4: Policy check - per-call max exceeded
echo "4️⃣  POST /api/policy/can-spend - Check if 600¢ spend is allowed (should fail)"
curl -s -X POST ${BASE_URL}/api/policy/can-spend \
  -H "Content-Type: application/json" \
  -d "{\"amountCents\": 600, \"sessionId\": \"${SESSION_ID}\", \"provider\": \"x402\"}" | jq '.'
echo ""

# Test 5: Get artifacts (should be empty)
echo "5️⃣  GET /api/session/:id/artifacts - Get session artifacts"
curl -s ${BASE_URL}/api/session/${SESSION_ID}/artifacts | jq '.'
echo ""

# Test 6: Not implemented endpoints
echo "6️⃣  POST /api/session/:id/search - Should return 501"
curl -s -X POST ${BASE_URL}/api/session/${SESSION_ID}/search | jq '.'
echo ""

echo "✅ API endpoint tests complete!"
