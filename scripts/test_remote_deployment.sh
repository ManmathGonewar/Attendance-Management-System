#!/usr/bin/env bash
set -euo pipefail

# Deployment Test & Verification Script for Remote MySQL
# Usage: bash scripts/test_remote_deployment.sh [domain]
# Example: bash scripts/test_remote_deployment.sh amsonline.iceiy.com

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

DOMAIN="${1:-amsonline.iceiy.com}"
SCHEME="https"

# Color codes for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Deployment Test Script for Remote Database${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""

# Function to print status
print_status() {
  local status="$1"
  local message="$2"
  if [[ "$status" == "OK" ]]; then
    echo -e "${GREEN}[✓]${NC} $message"
  elif [[ "$status" == "WARN" ]]; then
    echo -e "${YELLOW}[!]${NC} $message"
  else
    echo -e "${RED}[✗]${NC} $message"
  fi
}

# Function to test endpoint
test_endpoint() {
  local url="$1"
  local expected_key="$2"
  local description="$3"
  
  echo ""
  echo -e "${BLUE}Testing:${NC} $description"
  echo "URL: $url"
  
  if command -v curl &> /dev/null; then
    local response
    response=$(curl -s -w "\n%{http_code}" "$url" 2>/dev/null || echo "error\n000")
    local http_code=$(echo "$response" | tail -1)
    local body=$(echo "$response" | head -n -1)
    
    echo "HTTP Code: $http_code"
    
    if [[ "$http_code" == "200" ]]; then
      if echo "$body" | grep -q "$expected_key" 2>/dev/null; then
        print_status "OK" "$description - Success"
        echo "Response: $body" | head -c 200
        echo "..."
        return 0
      else
        print_status "WARN" "$description - Got HTTP 200 but unexpected response"
        echo "Response: $body" | head -c 200
        echo "..."
        return 1
      fi
    else
      print_status "FAIL" "$description - HTTP $http_code"
      echo "Response: $body" | head -c 200
      echo "..."
      return 1
    fi
  else
    print_status "WARN" "curl not found - skipping endpoint test"
    return 1
  fi
}

# ==========================================
# 1. Check Configuration
# ==========================================
echo ""
echo -e "${BLUE}[1/5] Checking Configuration${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
print_status "OK" "Configuration is now managed in backend/config/config.php"
# --- .env file check disabled as configuration is now in backend/config/config.php ---
# if [[ ! -f .env ]]; then
#   print_status "FAIL" ".env file not found"
#   exit 1
# fi

# print_status "OK" ".env file exists"

# # Read credentials
# if command -v grep &> /dev/null; then
#   DB_HOST=$(grep "^DB_HOST=" .env | cut -d'=' -f2-)
#   DB_PORT=$(grep "^DB_PORT=" .env | cut -d'=' -f2-)
#   DB_NAME=$(grep "^DB_NAME=" .env | cut -d'=' -f2-)
#   DB_USER=$(grep "^DB_USER=" .env | cut -d'=' -f2-)
#   
#   echo ""
#   echo "Database Configuration:"
#   echo "  Host: $DB_HOST"
#   echo "  Port: $DB_PORT"
#   echo "  Database: $DB_NAME"
#   echo "  User: $DB_USER"
#   
#   if [[ "$DB_HOST" == "sql101.iceiy.com" ]]; then
#     print_status "OK" "Database host is set to remote server (sql101.iceiy.com)"
#   else
#     print_status "WARN" "Database host is $DB_HOST (expected sql101.iceiy.com)"
#   fi
#   
#   if [[ "$DB_NAME" == "icei_41252012_am_db" ]]; then
#     print_status "OK" "Database name is correct (icei_41252012_am_db)"
#   else
#     print_status "WARN" "Database name is $DB_NAME (expected icei_41252012_am_db)"
#   fi
#   
#   if [[ "$DB_USER" == "icei_41252012" ]]; then
#     print_status "OK" "Database user is correct (icei_41252012)"
#   else
#     print_status "WARN" "Database user is $DB_USER (expected icei_41252012)"
#   fi
# fi

# ==========================================
# 2. Test Network Connectivity
# ==========================================
echo ""
echo -e "${BLUE}[2/5] Testing Network Connectivity${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if command -v ping &> /dev/null; then
  if ping -c 1 -W 2 sql101.iceiy.com &> /dev/null; then
    print_status "OK" "sql101.iceiy.com is reachable"
  else
    print_status "WARN" "sql101.iceiy.com not reachable via ping (may be blocked)"
  fi
fi

if command -v nc &> /dev/null || command -v ncat &> /dev/null; then
  echo "Testing port 3306 connectivity..."
  if timeout 3 bash -c "</dev/tcp/sql101.iceiy.com/3306" 2>/dev/null; then
    print_status "OK" "Port 3306 is open on sql101.iceiy.com"
  else
    print_status "WARN" "Port 3306 not accessible (may be blocked or server unreachable)"
  fi
fi

# ==========================================
# 3. Test Local Database Connection
# ==========================================
echo ""
echo -e "${BLUE}[3/5] Testing Local Database Class${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if command -v php &> /dev/null; then
  echo "Testing Database connection via PHP..."
  
  php_output=$(php -r "
    require '$ROOT_DIR/backend/config/config.php';
    require '$ROOT_DIR/backend/src/Database.php';
    try {
      \$db = Database::getConnection();
      \$stmt = \$db->query('SELECT 1 AS ok');
      \$result = \$stmt->fetch();
      echo 'SUCCESS';
      exit(0);
    } catch (Exception \$e) {
      echo 'FAILED: ' . \$e->getMessage();
      exit(1);
    }
  " 2>&1 || echo "FAILED: PHP execution error")
  
  if [[ "$php_output" == "SUCCESS" ]]; then
    print_status "OK" "PHP database connection successful"
  else
    print_status "FAIL" "PHP database connection failed"
    echo "Error: $php_output"
  fi
else
  print_status "WARN" "PHP not found - skipping local database test"
fi

# ==========================================
# 4. Test Remote API Endpoints
# ==========================================
echo ""
echo -e "${BLUE}[4/5] Testing Remote API Endpoints${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if command -v curl &> /dev/null; then
  # Test database connectivity endpoint
  test_endpoint \
    "${SCHEME}://${DOMAIN}/backend/public/api.php?action=db-test" \
    "success\|ok" \
    "Database test endpoint (db-test)"
  
  # Test homepage
  test_endpoint \
    "${SCHEME}://${DOMAIN}/" \
    "Attendance Management System\|DOCTYPE\|html" \
    "Frontend homepage"
else
  print_status "WARN" "curl not found - skipping endpoint tests"
fi

# ==========================================
# 5. Verify File Permissions & Structure
# ==========================================
echo ""
echo -e "${BLUE}[5/5] Checking Project Structure & Permissions${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check required directories
required_dirs=(
  "backend/config"
  "backend/public"
  "backend/src"
  "assets/uploads"
  "assets/css"
  "assets/js"
)

for dir in "${required_dirs[@]}"; do
  if [[ -d "$dir" ]]; then
    print_status "OK" "Directory exists: $dir"
  else
    print_status "FAIL" "Directory missing: $dir"
  fi
done

# Check required files
required_files=(
  "backend/config/config.php"
  "backend/public/api.php"
  "backend/src/Database.php"
  "backend/src/Session.php"
  "index.html"
)

for file in "${required_files[@]}"; do
  if [[ -f "$file" ]]; then
    print_status "OK" "File exists: $file"
  else
    print_status "FAIL" "File missing: $file"
  fi
done

# Check .env is not world-readable (security) - DISABLED
# if [[ -f .env ]]; then
#   perms=$(stat -f %OLp .env 2>/dev/null || stat -c %a .env 2>/dev/null || echo "unknown")
#   if [[ "$perms" == "644" ]] || [[ "$perms" == "600" ]]; then
#     print_status "OK" ".env permissions are secure ($perms)"
#   else
#     print_status "WARN" ".env permissions: $perms (should be 644 or 600)"
#   fi
# fi

# Check uploads folder is writable
if [[ -w "assets/uploads" ]]; then
  print_status "OK" "assets/uploads is writable"
else
  print_status "WARN" "assets/uploads may not be writable"
fi

# ==========================================
# Summary
# ==========================================
echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Deployment Test Complete${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""
echo "Next Steps:"
echo "1. Review any WARN or FAIL items above"
echo "2. Verify MySQL credentials in PHPMyAdmin"
echo "3. Run: bash scripts/backup_mysql.sh"
echo "4. Test login at: ${SCHEME}://${DOMAIN}/"
echo ""
echo "Documentation: See DEPLOYMENT_CHECKLIST.md for full deployment guide"
echo ""
