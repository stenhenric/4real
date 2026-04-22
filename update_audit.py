import re
import json

# Update FEATURE_AUDIT.md
with open('FEATURE_AUDIT.md', 'r') as f:
    content = f.read()

# Remove from Incomplete
content = re.sub(
    r"## 🔧 Incomplete \(2\)\n\| Feature \| Description \| What's Missing \|\n\|---------\|-------------\|----------------\|\n\| Matchmaking / Games \| Real-time multiplayer games. Creating matches, joining matches, playing. \| Socket.io is installed, but full game logic needs review to see if it's fully complete. GameView exists. \|\n\| Withdrawals \| Process user withdrawal requests. \| Engine exists, but might need more robust error handling or admin approval flows. \|\n",
    "## 🔧 Incomplete (0)\n| Feature | Description | What's Missing |\n|---------|-------------|----------------|\n",
    content
)

# Add to Implemented
implemented_str = r"## ✅ Implemented \(4\)\n\| Feature \| Description \| Evidence \|\n\|---------\|-------------\|----------\|\n\| Authentication \| User registration and login using JWT. Includes admin roles. \| server/controllers/auth.controller.ts, server/routes/auth.routes.ts \|\n\| User Profile & Balances \| User can view profile, current USDT balance, and see a leaderboard. \| server/controllers/user.controller.ts, src/views/ProfileView.tsx, src/views/DashboardView.tsx \|\n\| TON USDT Deposits \| Integration with TON blockchain to accept USDT deposits using unique memos. \| server/services/deposit-service.ts, server/workers/deposit-poller.ts \|\n\| Merchant Order System \| P2P style merchant buy/sell requests with proof images. \| src/views/MerchantView.tsx, server/models/Order.ts, server/controllers/order.controller.ts \|\n"
new_implemented_str = "## ✅ Implemented (6)\n| Feature | Description | Evidence |\n|---------|-------------|----------|\n| Authentication | User registration and login using JWT. Includes admin roles. | server/controllers/auth.controller.ts, server/routes/auth.routes.ts |\n| User Profile & Balances | User can view profile, current USDT balance, and see a leaderboard. | server/controllers/user.controller.ts, src/views/ProfileView.tsx, src/views/DashboardView.tsx |\n| TON USDT Deposits | Integration with TON blockchain to accept USDT deposits using unique memos. | server/services/deposit-service.ts, server/workers/deposit-poller.ts |\n| Merchant Order System | P2P style merchant buy/sell requests with proof images. | src/views/MerchantView.tsx, server/models/Order.ts, server/controllers/order.controller.ts |\n| Matchmaking / Games | Real-time multiplayer games. Creating matches, joining matches, playing. | src/views/GameView.tsx, server/services/match.service.ts, server.ts |\n| Withdrawals | Process user withdrawal requests. | server/services/withdrawal-engine.ts, server/workers/withdrawal-worker.ts, src/views/WithdrawView.tsx |\n"

content = content.replace(implemented_str, new_implemented_str)

# Update summary
content = content.replace("- ✅ Implemented: 4 (66%)", "- ✅ Implemented: 6 (100%)")
content = content.replace("- 🔧 Incomplete: 2 (33%)", "- 🔧 Incomplete: 0 (0%)")

with open('FEATURE_AUDIT.md', 'w') as f:
    f.write(content)


# Update feature_audit.json
with open('feature_audit.json', 'r') as f:
    audit_data = json.load(f)

for feature in audit_data['features']:
    if feature['name'] in ['Matchmaking / Games', 'Withdrawals']:
        feature['status'] = 'implemented'
        feature['notes'] = "Completed implementation and review."

audit_data['summary']['implemented'] = 6
audit_data['summary']['incomplete'] = 0

with open('feature_audit.json', 'w') as f:
    json.dump(audit_data, f, indent=2)
