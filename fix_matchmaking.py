import re

with open('src/views/GameView.tsx', 'r') as f:
    content = f.read()

# Listen for error
if "s.on('error'" not in content:
    content = content.replace('s.on("room-sync"', "s.on('error', (msg: string) => {\n      warning(msg);\n      navigate('/');\n    });\n\n    s.on(\"room-sync\"")

with open('src/views/GameView.tsx', 'w') as f:
    f.write(content)
