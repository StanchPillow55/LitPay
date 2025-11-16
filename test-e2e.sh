#!/bin/bash

echo "🧪 LitPay End-to-End Workflow Test"
echo "===================================="
echo ""

BASE_URL="http://localhost:3000"

# Step 1: Create session
echo "1️⃣  Creating research session..."
SESSION_RESPONSE=$(curl -s -X POST ${BASE_URL}/api/session \
  -H "Content-Type: application/json" \
  -d '{"userId": "e2e-test-user"}')

SESSION_ID=$(echo "$SESSION_RESPONSE" | jq -r '.sessionId')
echo "✅ Session created: $SESSION_ID"
echo "   Daily budget remaining: $(echo "$SESSION_RESPONSE" | jq -r '.budget.daily.remaining')¢"
echo ""

# Step 2: Discovery (search)
echo "2️⃣  Performing discovery search..."
SEARCH_RESPONSE=$(curl -s -X POST ${BASE_URL}/api/session/${SESSION_ID}/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "machine learning transformers",
    "maxResults": 10,
    "minScore": 0.5
  }')

ARTICLE_COUNT=$(echo "$SEARCH_RESPONSE" | jq -r '.articles | length')
echo "✅ Discovery complete"
echo "   Articles found: $ARTICLE_COUNT"
echo "   Estimated cost: $(echo "$SEARCH_RESPONSE" | jq -r '.costEstimate.estimatedCostCents')¢"

if [ "$ARTICLE_COUNT" -gt 0 ]; then
  echo "   Top result: $(echo "$SEARCH_RESPONSE" | jq -r '.articles[0].title')"
  echo "   Score: $(echo "$SEARCH_RESPONSE" | jq -r '.articles[0].score')"
fi
echo ""

# Step 3: Enrichment (for testing, use mock DOIs)
echo "3️⃣  Enriching articles..."
ENRICH_RESPONSE=$(curl -s -X POST ${BASE_URL}/api/session/${SESSION_ID}/enrich \
  -H "Content-Type: application/json" \
  -d '{
    "dois": ["10.1234/test", "10.5678/demo"]
  }')

SUCCESS_COUNT=$(echo "$ENRICH_RESPONSE" | jq -r '.successCount')
TOTAL_COST=$(echo "$ENRICH_RESPONSE" | jq -r '.totalCost')
echo "✅ Enrichment complete"
echo "   Success: $SUCCESS_COUNT"
echo "   Total cost: ${TOTAL_COST}¢"
echo ""

# Step 4: Get updated session
echo "4️⃣  Checking updated session..."
UPDATED_SESSION=$(curl -s ${BASE_URL}/api/session/${SESSION_ID})
echo "✅ Session status: $(echo "$UPDATED_SESSION" | jq -r '.session.status')"
echo "   Total cost: $(echo "$UPDATED_SESSION" | jq -r '.session.total_cost_cents')¢"
echo "   Ledger entries: $(echo "$UPDATED_SESSION" | jq -r '.ledger | length')"
echo "   Budget remaining:"
echo "     - Session: $(echo "$UPDATED_SESSION" | jq -r '.budget.session.remaining')¢ / $(echo "$UPDATED_SESSION" | jq -r '.budget.session.limit')¢"
echo "     - x402 daily: $(echo "$UPDATED_SESSION" | jq -r '.budget.x402Daily.remaining')¢ / $(echo "$UPDATED_SESSION" | jq -r '.budget.x402Daily.limit')¢"
echo ""

# Step 5: Synthesize report
echo "5️⃣  Generating synthesis report..."
SYNTHESIS_RESPONSE=$(curl -s -X POST ${BASE_URL}/api/session/${SESSION_ID}/synthesize \
  -H "Content-Type: application/json" \
  -d "{
    \"query\": \"machine learning transformers\",
    \"enrichedData\": $(echo "$ENRICH_RESPONSE" | jq '.results | map(select(.success == true) | .data)')
  }")

echo "✅ Synthesis complete"
echo "   Generated at: $(echo "$SYNTHESIS_RESPONSE" | jq -r '.generatedAt')"
echo "   Total cost: $(echo "$SYNTHESIS_RESPONSE" | jq -r '.metadata.totalCost')¢"
echo "   Articles processed: $(echo "$SYNTHESIS_RESPONSE" | jq -r '.metadata.articlesProcessed')"
echo ""

# Step 6: Get artifacts
echo "6️⃣  Retrieving artifacts..."
ARTIFACTS=$(curl -s ${BASE_URL}/api/session/${SESSION_ID}/artifacts)
ARTIFACT_COUNT=$(echo "$ARTIFACTS" | jq -r '.artifacts | length')
echo "✅ Artifacts: $ARTIFACT_COUNT"
echo ""

# Final summary
echo "===================================="
echo "✅ E2E Workflow Test Complete!"
echo ""
echo "Summary:"
echo "  - Session ID: $SESSION_ID"
echo "  - Articles discovered: $ARTICLE_COUNT"
echo "  - Articles enriched: $SUCCESS_COUNT"
echo "  - Total cost: ${TOTAL_COST}¢"
echo "  - Artifacts created: $ARTIFACT_COUNT"
echo ""
