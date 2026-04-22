import sys

def main():
    file_path = "server/workers/deposit-poller.ts"
    with open(file_path, "r") as f:
        content = f.read()

    # We want to remove the console.log from the origin/main block and keep the updated type signature
    # the target code is just catching err: unknown

    new_code = """  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && err.code === 11000) {"""

    import re
    # We'll use regex to replace the conflict block
    conflict_pattern = re.compile(r"<<<<<<< HEAD\n  } catch \(err: any\) {\n    if \(err\.code === 11000\) {\n=======\n    console\.log\(`Deposit confirmed: user=\$\{userId\} amount=\$\{Number\(receivedRaw\)/1e6\} USDT tx=\$\{txHash\}`\);\n  } catch \(err: unknown\) {\n    if \(err && typeof err === 'object' && 'code' in err && err\.code === 11000\) {\n>>>>>>> origin/main")

    new_content = conflict_pattern.sub(new_code, content)

    with open(file_path, "w") as f:
        f.write(new_content)

if __name__ == "__main__":
    main()
