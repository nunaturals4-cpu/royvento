# Starts the Expo Metro bundler for the mobile app (web + phone via Expo Go).
# Google Sign-In env var is loaded automatically from artifacts/mobile/.env.local
# Run the proxy separately: node C:\Users\USER\AppData\Local\claude-dev-proxy\proxy.js
#   Then open browser at http://localhost:8082

Set-Location artifacts/mobile
pnpm exec expo start --web --port 8081
