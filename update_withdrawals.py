import re

with open('server/controllers/transaction.controller.ts', 'r') as f:
    content = f.read()

# Add a check for finite positive number in requestWithdrawalHandler
if "if (!Number.isFinite(amountUsdt)" not in content:
    old_check = "if (!toAddress || !amountUsdt || amountUsdt <= 0) {"
    new_check = "if (!toAddress || !amountUsdt || !Number.isFinite(amountUsdt) || amountUsdt <= 0) {"
    content = content.replace(old_check, new_check)

with open('server/controllers/transaction.controller.ts', 'w') as f:
    f.write(content)
