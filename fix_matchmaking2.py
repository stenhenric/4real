import re

with open('src/views/GameView.tsx', 'r') as f:
    content = f.read()

# Make sure we don't pass hardcoded 0 for wager if the match exists.
# We can just fetch the match if it exists. Wait, it's easier to just pass token to join-room
# and the server should handle fetching wager from db.

with open('server.ts', 'r') as f:
    server_content = f.read()

if 'dbMatch.wager' not in server_content and 'dbMatch = await MatchService.getMatchByRoomId' in server_content:
    print("Modifying server.ts to load wager from dbMatch")
