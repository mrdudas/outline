#!/bin/bash
# Dev login helper: generates an OTP, reads it from Redis, opens login in browser.

EMAIL="${1:-admin@example.com}"
EMAIL_ENC=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))" "$EMAIL")
COOKIE_JAR=$(mktemp /tmp/outline-cookies.XXXXXX)

echo "Requesting OTP for $EMAIL..."

# Step 1: GET the page to receive the CSRF token cookie
curl -s -c "$COOKIE_JAR" http://localhost:3000/ > /dev/null

# Step 2: Extract the CSRF token from the cookie jar
CSRF=$(grep "csrfToken" "$COOKIE_JAR" | awk '{print $NF}')

if [ -z "$CSRF" ]; then
  echo "ERROR: Could not get CSRF token. Is the server running at http://localhost:3000?"
  rm -f "$COOKIE_JAR"
  exit 1
fi

# Step 3: POST to /auth/email with the CSRF token
RESPONSE=$(curl -s -b "$COOKIE_JAR" \
  -X POST http://localhost:3000/auth/email \
  -H "Content-Type: application/json" \
  -H "x-csrf-token: $CSRF" \
  -d "{\"email\":\"$EMAIL\",\"preferOTP\":true}")

rm -f "$COOKIE_JAR"

if ! echo "$RESPONSE" | grep -q '"success":true'; then
  echo "ERROR: $RESPONSE"
  exit 1
fi

# Step 4: Read OTP directly from Redis
OTP=$(redis-cli GET "email_verification_code:$EMAIL" 2>/dev/null | tr -d '[:space:]')

if [ -z "$OTP" ]; then
  echo "ERROR: Could not read OTP from Redis. Is Redis running?"
  exit 1
fi

echo "OTP: $OTP — opening browser..."

# follow=true skips the server's client-side POST redirect (which causes CSRF mismatch)
# and processes the OTP directly in the GET request, which is CSRF-exempt
CALLBACK="http://localhost:3000/auth/email.callback?code=$OTP&email=$EMAIL_ENC&client=web&follow=true"
xdg-open "$CALLBACK"
