# MongoDB Common Attack Scenarios and Mitigations

## 1. Ransomware / Data Wipe Attacks

**How it happens:**
Attackers scan the internet for MongoDB instances with no authentication and port 27017 exposed.
They drop all databases and leave a ransom note. In 2020, the "Meow" bot alone wiped thousands
of unprotected MongoDB instances.

**Mitigations:**
- Enable `--auth` on every instance immediately
- Bind to `127.0.0.1` or private IPs only
- Block port 27017 from all public internet access
- Verify: `nmap -p 27017 <your-public-ip>` — should return "filtered" or "closed"

---

## 2. NoSQL Authentication Bypass (`$ne` injection)

**Attack:**
```http
POST /login
Content-Type: application/json

{ "username": {"$ne": null}, "password": {"$ne": null} }
```

If the app passes `req.body` directly to `findOne()`, the query becomes:
```javascript
db.users.findOne({ username: { $ne: null }, password: { $ne: null } })
```
This returns the first user in the collection — authentication bypassed.

**Fix:**
```javascript
// Cast inputs to string
const username = String(req.body.username);
const password = String(req.body.password);
// Or use Mongoose which auto-casts based on schema
```

---

## 3. JavaScript Injection via `$where`

**Attack:**
```javascript
// Vulnerable query
db.products.find({ $where: `this.price < ${userInput}` })

// Attacker input: "0; sleep(5000)"
// Results in: this.price < 0; sleep(5000) — causes DoS / data exfiltration
```

**Fix:**
```yaml
# mongod.conf
security:
  javascriptEnabled: false
```
Or rewrite queries to avoid `$where` entirely (use `$expr` instead).

---

## 4. URL Parameter Array Injection

**Attack:**
In Express/Node.js, URL query parameters with `[]` notation become objects:
```
GET /search?password[$ne]=wrongpassword
```
This creates: `{ password: { $ne: "wrongpassword" } }` — authentication bypass.

**Fix:**
```javascript
// Explicitly sanitize query params
const { sanitize } = require('express-mongo-sanitize');
app.use(sanitize());
// OR use the express-mongo-sanitize middleware globally
```

---

## 5. Credential Stuffing / Brute Force

**Attack:** Automated login attempts using leaked credential databases.

**Mitigations:**
- Rate-limit authentication endpoints at the application layer
- Implement account lockout after N failed attempts
- Use strong passwords / passwordPrompt() (never hardcode in config/code)
- Enable Atlas alerts for repeated authentication failures
- Use X.509 certificates instead of passwords for service accounts
- Monitor audit logs for `{ atype: "authenticate", "param.error": "AuthenticationFailed" }`

---

## 6. Insider Threat / Overprivileged Accounts

**Scenario:** A developer account with `dbAdminAnyDatabase` accidentally or maliciously drops
production collections.

**Mitigations:**
- Enforce least-privilege RBAC: app accounts get `readWrite` on their DB only
- Separate admin accounts from application accounts completely
- Require MFA for any account with admin-level access (Atlas supports MFA)
- Log and alert on `dropCollection` and `dropDatabase` events
- Use Atlas Time-Series protection and Continuous Cloud Backups for recovery

---

## 7. Exposed Backups / Snapshots

**Scenario:** MongoDB backup files or Atlas snapshots are stored in a public S3 bucket or with
overly permissive IAM policies.

**Mitigations:**
- Encrypt all backup files using KMS-managed keys
- Store backups in a dedicated, isolated AWS account/Azure subscription
- Audit S3/GCS/Blob Storage ACLs regularly
- For Atlas: restrict snapshot access to specific IAM roles; never make snapshots public

---

## 8. Dependency / Driver CVEs

**Example CVEs:**
- PyMongo ≤ 4.6.2: Out-of-bounds read in `bson` module — potential deserialization attack
- MongoDB Shell: Control character injection (multiple versions)
- Java driver (CSFLE): Specific versions had CSFL encryption issues

**Mitigations:**
- Subscribe to MongoDB alerts: https://www.mongodb.com/resources/products/alerts
- Apply minor patches within days for CVE-tagged releases
- Keep drivers (pymongo, mongodb Node.js, Java, Go, etc.) pinned and updated
- Run `npm audit` / `pip-audit` / `mvn dependency-check` in CI/CD

---

## 9. Man-in-the-Middle (TLS Misconfiguration)

**Attack:** If TLS is optional or not validated, attackers on the same network can intercept
and modify MongoDB traffic.

**Mitigations:**
```yaml
net:
  tls:
    mode: requireTLS       # NOT "allowTLS" or "preferTLS"
    CAFile: /etc/ssl/ca.pem
```

In connection strings:
```
mongodb://...?tls=true&tlsCAFile=/path/to/ca.pem
```
Never use `tlsAllowInvalidCertificates=true` in production.

---

## 10. Replica Set Member Impersonation

**Attack:** A rogue replica set member joins without authentication, receives replication
data from the primary.

**Fix:**
```yaml
security:
  keyFile: /etc/mongodb/rs-keyfile
  # OR use X.509 member auth for stronger guarantees
```
All members must share the same keyfile or use mutual TLS with member certificates.
