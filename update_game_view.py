import re

with open('src/views/GameView.tsx', 'r') as f:
    content = f.read()

# Replace wager hardcode with fetch initial state if needed.
# Let's see how game creation actually passes wager.
# MatchController.createMatch in server/controllers/match.controller.ts
