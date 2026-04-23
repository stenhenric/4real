---
name: mongodb-security
description: >
  Comprehensive MongoDB database security guidance and best practices. Use this skill whenever
  the user asks about securing MongoDB, MongoDB Atlas, or NoSQL database security. Trigger on
  any mention of: MongoDB authentication, RBAC, TLS/SSL encryption, NoSQL injection, MongoDB
  hardening, Atlas network security, audit logging, field-level encryption, MongoDB CVEs,
  misconfigured MongoDB, MongoDB ransomware, connection security, access control, or
  compliance (GDPR, HIPAA, PCI DSS) for MongoDB. Also trigger when a user shares MongoDB
  config files, connection strings, or code that queries MongoDB and asks about security review.
  Even partial or casual phrasing like "is my MongoDB secure?" or "how do I lock down Mongo"
  should trigger this skill.
---

# MongoDB Security Skill

This skill provides deep, current, and actionable MongoDB security guidance. It covers both
self-managed deployments and MongoDB Atlas (cloud). Reference the relevant section below.

---

## 1. Pre-Deployment Security Checklist (Minimum Baseline)

Before any MongoDB instance goes to production, verify all of the following:

- [ ] Authentication is **enabled** (`--auth` flag or `security.authorization: enabled` in config)
- [ ] A dedicated admin user has been created before enabling auth
- [ ] Default `test` database has no unauthorized data
- [ ] Bind IP is restricted — not `0.0.0.0` unless behind a firewall
- [ ] Port 27017 is not exposed to the public internet
- [ ] TLS/SSL is configured for all connections (in-transit encryption)
- [ ] Encryption at rest is enabled (WiredTiger with `--enableEncryption`)
- [ ] Least-privilege roles are in use for all application users
- [ ] Auditing is configured (Enterprise / Atlas)
- [ ] `mongod.conf` is locked down (no JavaScript engine if not needed)

---

## 2. Authentication

### Enable Authentication
MongoDB ships with auth **disabled** by default. Enable it immediately:

```yaml
# mongod.conf
security:
  authorization: enabled
```

Or via CLI flag:
```bash
mongod --auth --bind_ip 127.0.0.1
```

### Authentication Mechanisms (choose one)

| Mechanism | Use Case |
|---|---|
| **SCRAM-SHA-256** | Default & recommended for most deployments |
| **X.509 Certificates** | High-compliance environments; mutual TLS |
| **LDAP** (Enterprise) | Centralized identity management (Active Directory) |
| **Kerberos** (Enterprise) | Enterprise SSO/mixed network environments |
| **AWS IAM / Azure AD** | Atlas cloud deployments |

**Best practice:** Always use SCRAM-SHA-256 at minimum. For regulated industries, prefer X.509 or LDAP.

### Create an Admin User First

```javascript
use admin
db.createUser({
  user: "adminUser",
  pwd: passwordPrompt(),    // Never hardcode passwords
  roles: [{ role: "userAdminAnyDatabase", db: "admin" }]
})
```

---

## 3. Role-Based Access Control (RBAC)

RBAC is the cornerstone of MongoDB authorization. Every user and application gets **only** what it needs.

### Principle of Least Privilege
- Application accounts should have `readWrite` on only their specific database — never `dbAdminAnyDatabase` or `root`
- Separate read-only users for analytics/reporting
- Never use the `root` role for application connections

### Built-in Roles (Common)

| Role | Scope |
|---|---|
| `read` | Read-only on a specific DB |
| `readWrite` | Read/write on a specific DB |
| `dbAdmin` | Schema and index management |
| `userAdmin` | User management only |
| `clusterAdmin` | Full cluster management (restrict tightly) |
| `root` | Superuser — avoid for app accounts |

### Create Application-Scoped Users

```javascript
db.createUser({
  user: "appUser",
  pwd: passwordPrompt(),
  roles: [{ role: "readWrite", db: "myAppDB" }]
})
```

### Creating Custom Roles

```javascript
db.createRole({
  role: "reportingRole",
  privileges: [
    {
      resource: { db: "analytics", collection: "events" },
      actions: ["find"]
    }
  ],
  roles: []
})
```

### Ongoing RBAC Hygiene
- Audit user privileges regularly: `db.getUsers()` and `db.getRoles()`
- Remove accounts of departed users promptly
- Review and remove excessive permissions quarterly

---

## 4. Encryption

### 4a. Encryption In Transit (TLS/SSL)

All traffic between clients, app servers, and MongoDB must be encrypted.

```yaml
# mongod.conf
net:
  tls:
    mode: requireTLS
    certificateKeyFile: /etc/ssl/mongodb.pem
    CAFile: /etc/ssl/ca.pem
```

**Connection string with TLS:**
```
mongodb://user:pass@host:27017/db?tls=true&tlsCAFile=/path/to/ca.pem
```

- Use **TLS 1.2 minimum**; TLS 1.3 preferred
- Disable weak cipher suites
- Rotate certificates before expiry

### 4b. Encryption at Rest (WiredTiger)

Available in MongoDB Enterprise and Atlas. Protects data files, indexes, and backups.

```yaml
security:
  enableEncryption: true
  encryptionKeyFile: /etc/mongodb/keyfile
```

For Atlas: enable encryption at rest using customer-managed keys (AWS KMS, Azure Key Vault, GCP KMS) under **Security → Advanced** in the Atlas UI.

### 4c. Client-Side Field Level Encryption (CSFLE)

Encrypts individual document fields **before** data reaches the server. Even MongoDB admins cannot read the plaintext.

```javascript
// Node.js driver example
const client = new MongoClient(uri, {
  autoEncryption: {
    keyVaultNamespace: "encryption.__keyVault",
    kmsProviders: { aws: { accessKeyId, secretAccessKey } },
    schemaMap: {
      "mydb.patients": {
        bsonType: "object",
        encryptMetadata: { keyId: [dataKeyId] },
        properties: {
          ssn: {
            encrypt: {
              bsonType: "string",
              algorithm: "AEAD_AES_256_CBC_HMAC_SHA_512-Deterministic"
            }
          }
        }
      }
    }
  }
});
```

**When to use CSFLE:** Regulated fields (SSN, credit card numbers, medical records, PII) where even database admins should not see plaintext.

### 4d. Queryable Encryption (MongoDB 7.0+)

MongoDB's industry-first capability: encrypt data **and still run equality/range queries on it** while data stays encrypted on the server. Use for compliance-sensitive searchable fields.

> ⚠️ **Note:** Third-party security research (2023) identified potential log-based leakage in Queryable Encryption. Restrict access to `queryLog` and audit logs as a defense-in-depth measure.

---

## 5. Network Security

### Bind IP Restriction

Never bind to all interfaces in production:

```yaml
# mongod.conf — restrict to localhost + app server IP
net:
  bindIp: 127.0.0.1,10.0.1.50
  port: 27017
```

### Firewall Rules
- Block port `27017` from the public internet entirely
- Allow only known application server IPs
- Use security groups (AWS), NSGs (Azure), or firewall rules (GCP)

### Disable Direct SSH Root Access
- Use key-based SSH authentication only
- Disable `PermitRootLogin yes` in `sshd_config`

### MongoDB Atlas Network Security

See `references/atlas-network-security.md` for detailed Atlas guidance.

**Summary of Atlas options (best → acceptable):**

1. **Private Endpoints (PrivateLink / Private Service Connect)** — Gold standard. No public internet exposure. One-way connection from your VPC to Atlas.
2. **VPC/VNet Peering** — Good. Traffic stays on the cloud provider's backbone.
3. **IP Access List** — Minimum acceptable. Restrict to smallest possible CIDR blocks (`/32` per IP if possible). Never use `0.0.0.0/0` in production.

---

## 6. NoSQL Injection Prevention

Unlike SQL injection, MongoDB is vulnerable to **operator injection** via untrusted user input being passed as query objects.

### Common Attack Patterns

**Authentication bypass via `$ne` operator:**
```javascript
// Attacker sends: { "username": { "$ne": null }, "password": { "$ne": null } }
// This bypasses login by matching ANY user
db.users.findOne({ username: req.body.username, password: req.body.password })
```

**JavaScript injection via `$where`:**
```javascript
// Never use $where with user input — it executes arbitrary JS
db.collection.find({ $where: function() { return this.name === userInput; } })
```

### Prevention Techniques

1. **Validate and sanitize all input** — cast to expected types before query construction:
```javascript
// Good: cast to string
const username = String(req.body.username);
const password = String(req.body.password);
db.users.findOne({ username, password });
```

2. **Use schema validation** — enforce document structure at the DB level:
```javascript
db.createCollection("users", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["username", "password"],
      properties: {
        username: { bsonType: "string" },
        password: { bsonType: "string" }
      }
    }
  }
})
```

3. **Disable the JavaScript engine** if not required:
```yaml
security:
  javascriptEnabled: false
```

4. **Use ODM libraries** (Mongoose for Node.js) which cast types and provide schema enforcement.

5. **Use parameterized queries** — never build query objects directly from raw request bodies.

6. **Add a WAF** (Web Application Firewall) as an additional layer against injection attacks.

---

## 7. Auditing and Logging

### Self-Managed (Enterprise Required)

```yaml
auditLog:
  destination: file
  format: JSON
  path: /var/log/mongodb/audit.json
  filter: '{ atype: { $in: ["authenticate", "createUser", "dropUser", "updateUser", "logout"] } }'
```

Audit these event types at minimum:
- `authenticate` (all login attempts, including failures)
- `createUser`, `dropUser`, `updateUser`
- `createCollection`, `dropCollection`, `dropDatabase`
- `find`, `insert`, `update`, `delete` (for sensitive collections)
- `grantRolesToUser`, `revokeRolesFromUser`

### Atlas Audit Logging

Enable via **Security → Audit** in the Atlas UI or using the Atlas Admin API. Atlas logs authentication, DML, DDL, and DCL events.

### Log Retention and SIEM Integration

- Retain logs for **90 days minimum** (1–2 years for regulated industries)
- Forward to a SIEM (Splunk, Datadog, ELK) for correlation and alerting
- Alert on: repeated auth failures, privilege escalation, bulk deletes, new user creation outside of approved workflows
- Restrict log file access — audit logs must be protected from tampering

---

## 8. Securing mongod.conf (Configuration Hardening)

```yaml
# /etc/mongod.conf — hardened production template

net:
  port: 27017
  bindIp: 127.0.0.1          # Restrict to loopback + known app IPs
  tls:
    mode: requireTLS
    certificateKeyFile: /etc/ssl/mongodb.pem
    CAFile: /etc/ssl/ca.pem
    disabledProtocols: TLS1_0,TLS1_1  # Enforce TLS 1.2+

security:
  authorization: enabled
  javascriptEnabled: false    # Disable if $where/$mapReduce not needed
  enableEncryption: true      # Enterprise only; for at-rest encryption

operationProfiling:
  slowOpThresholdMs: 100      # Log slow queries
  mode: slowOp

auditLog:                     # Enterprise only
  destination: file
  format: JSON
  path: /var/log/mongodb/audit.json

systemLog:
  destination: file
  path: /var/log/mongodb/mongod.log
  logAppend: true
  logRotate: rename
```

---

## 9. Replica Set and Sharded Cluster Security

### Internal Authentication (keyFile or X.509)

All replica set members must authenticate to each other:

```yaml
# keyfile method
security:
  keyFile: /etc/mongodb/keyfile
```

Generate a strong keyfile:
```bash
openssl rand -base64 756 > /etc/mongodb/keyfile
chmod 400 /etc/mongodb/keyfile
chown mongodb:mongodb /etc/mongodb/keyfile
```

For higher security, use **X.509 member certificates** instead of keyfiles.

### Sharded Cluster Considerations
- Each `mongos` and `mongod` shard node requires TLS and internal auth
- Restrict `mongos` exposure — clients should only connect via `mongos`, never directly to shard primaries
- Use separate admin credentials per shard tier

---

## 10. Backup Security

- Encrypt all backups at rest (same encryption key management as primary data)
- Store backups in a separate account/subscription from production to prevent ransomware lateral movement
- Test restore procedures regularly
- Use Atlas Backup (Point-in-Time Recovery) for Atlas deployments — backups are encrypted and managed automatically
- Restrict backup access to dedicated backup service accounts only

---

## 11. Patch Management and CVE Monitoring

- Apply **minor patch releases within days/weeks** when they address CVEs
- Monitor: [https://www.mongodb.com/resources/products/alerts](https://www.mongodb.com/resources/products/alerts) for CVE announcements
- Notable recent CVE categories: PyMongo deserialization (`bson` module), MongoDB Shell control character injection, unauthorized shard key command
- Keep all **drivers** (PyMongo, Node.js, Java, etc.) up to date — driver-level vulnerabilities are common

---

## 12. Compliance Mappings

| Requirement | MongoDB Controls |
|---|---|
| GDPR (data protection) | CSFLE, audit logs, RBAC, right-to-erasure support |
| HIPAA (ePHI) | TLS, encryption at rest, audit logs, RBAC, BAA with Atlas |
| PCI DSS | TLS 1.2+, encryption at rest, audit logs, network isolation, MFA |
| SOC 2 | Atlas managed security, audit logs, access control, monitoring |
| ISO 27001 | Atlas certified; RBAC, encryption, incident response |

Atlas is certified/compliant with: SOC 2 Type II, ISO 27001, PCI DSS Level 1, HIPAA, GDPR, FedRAMP Moderate.

---

## 13. Quick Security Review Checklist

When reviewing an existing MongoDB deployment or code, check:

**Configuration:**
- [ ] `security.authorization: enabled` in mongod.conf?
- [ ] `net.bindIp` not set to `0.0.0.0`?
- [ ] TLS `mode: requireTLS` in place?
- [ ] `javascriptEnabled: false` (if $where not used)?

**Access Control:**
- [ ] No application accounts using `root` or `dbAdminAnyDatabase`?
- [ ] No leftover default users?
- [ ] Service accounts limited to their own database?

**Network:**
- [ ] Port 27017 blocked from public internet?
- [ ] Atlas: No `0.0.0.0/0` in IP access list?
- [ ] Atlas: Private endpoints or VPC peering in use?

**Code:**
- [ ] User input cast to string/typed before use in queries?
- [ ] No raw request body objects passed directly to `find()`/`findOne()`?
- [ ] `$where` operator not used with user-controlled input?

---

## References

- `references/atlas-network-security.md` — Deep dive on Atlas network access options
- `references/common-attack-scenarios.md` — Real-world attack patterns and mitigations
- Official MongoDB Security Docs: https://www.mongodb.com/docs/manual/security/
- MongoDB Security Checklist: https://www.mongodb.com/docs/manual/administration/security-checklist/
- MongoDB CVE Alerts: https://www.mongodb.com/resources/products/alerts
