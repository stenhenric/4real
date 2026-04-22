import re

with open('server/services/withdrawal-engine.ts', 'r') as f:
    content = f.read()

# Add safer error handling / specific fixes
if "err instanceof Error" not in content:
    content = content.replace("catch (err: any)", "catch (err: unknown)")
    content = content.replace("err.message", "err instanceof Error ? err.message : String(err)")

with open('server/services/withdrawal-engine.ts', 'w') as f:
    f.write(content)

with open('server/workers/withdrawal-worker.ts', 'r') as f:
    content = f.read()

if "err instanceof Error" not in content:
    content = content.replace("catch (sendErr: any)", "catch (sendErr: unknown)")
    content = content.replace("sendErr.message", "sendErr instanceof Error ? sendErr.message : String(sendErr)")

with open('server/workers/withdrawal-worker.ts', 'w') as f:
    f.write(content)
