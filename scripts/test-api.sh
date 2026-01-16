#!/bin/bash
#
# Stride API Test Script
# Tests that the API endpoints respond correctly
#
# Usage: ./scripts/test-api.sh [BASE_URL]
# Default: http://localhost:3000
#

set -e

BASE_URL="${1:-http://localhost:3000}"
PASSED=0
FAILED=0

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "================================================"
echo "  Stride API Tests"
echo "  Base URL: $BASE_URL"
echo "================================================"
echo ""

# Test function
test_endpoint() {
    local method="$1"
    local endpoint="$2"
    local data="$3"
    local expected_code="$4"
    local description="$5"

    echo -n "Testing: $description... "

    if [ -n "$data" ]; then
        response=$(curl -s -o /tmp/response.json -w "%{http_code}" \
            -X "$method" \
            -H "Content-Type: application/json" \
            -d "$data" \
            "$BASE_URL$endpoint" 2>/dev/null || echo "000")
    else
        response=$(curl -s -o /tmp/response.json -w "%{http_code}" \
            -X "$method" \
            "$BASE_URL$endpoint" 2>/dev/null || echo "000")
    fi

    if [ "$response" = "$expected_code" ]; then
        echo -e "${GREEN}PASS${NC} (HTTP $response)"
        ((PASSED++))
        return 0
    elif [ "$response" = "000" ]; then
        echo -e "${RED}FAIL${NC} (Connection refused - is server running?)"
        ((FAILED++))
        return 1
    else
        echo -e "${RED}FAIL${NC} (Expected $expected_code, got $response)"
        ((FAILED++))
        return 1
    fi
}

# Test function that shows response body
test_endpoint_verbose() {
    local method="$1"
    local endpoint="$2"
    local data="$3"
    local expected_code="$4"
    local description="$5"

    test_endpoint "$method" "$endpoint" "$data" "$expected_code" "$description"
    if [ -f /tmp/response.json ]; then
        echo "  Response: $(cat /tmp/response.json | head -c 200)"
    fi
}

echo "--- Profiles API ---"
echo ""

# Test list profiles
test_endpoint "GET" "/api/profiles?list=true" "" "200" "GET /api/profiles?list=true"

# Test active profile
test_endpoint "GET" "/api/profiles?active=true" "" "200" "GET /api/profiles?active=true"

# Test create profile
PROFILE_DATA='{"name":"Test User","diploma":"L2 Info","city":"Paris","citySize":"large"}'
test_endpoint "POST" "/api/profiles" "$PROFILE_DATA" "200" "POST /api/profiles (create)"

# Test list profiles again (should have at least 1)
test_endpoint "GET" "/api/profiles?list=true" "" "200" "GET /api/profiles?list=true (after create)"

echo ""
echo "--- Simulation API ---"
echo ""

# Test get simulation state
test_endpoint "GET" "/api/simulation" "" "200" "GET /api/simulation"

# Test advance simulation
test_endpoint "POST" "/api/simulation" '{"action":"advance","days":7}' "200" "POST /api/simulation (advance 7 days)"

# Test reset simulation
test_endpoint "POST" "/api/simulation" '{"action":"reset"}' "200" "POST /api/simulation (reset)"

# Test invalid action
test_endpoint "POST" "/api/simulation" '{"action":"invalid"}' "400" "POST /api/simulation (invalid action)"

echo ""
echo "================================================"
echo "  Results"
echo "================================================"
echo ""
echo -e "  ${GREEN}Passed:${NC} $PASSED"
echo -e "  ${RED}Failed:${NC} $FAILED"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}All tests passed!${NC}"
    exit 0
else
    echo -e "${YELLOW}Some tests failed. Check the server logs for details.${NC}"
    exit 1
fi
