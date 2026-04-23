# Atlas Network Security — Deep Reference

## Network Access Options (Ranked Best to Acceptable)

### 1. Private Endpoints (Recommended for Production)

AWS PrivateLink, Azure Private Link, GCP Private Service Connect.

**Why it's the gold standard:**
- Traffic never traverses the public internet
- One-way connection only: your VPC → Atlas (Atlas cannot initiate back)
- Eliminates the need for IP access lists entirely
- Mandatory for PCI DSS compliance and highly recommended for HIPAA

**Setup (Atlas UI):**
Security → Network Access → Private Endpoint → Select cloud provider → Follow provider-specific steps

**Important notes:**
- Requires M10+ dedicated cluster
- Free/Flex clusters do not support private endpoints
- For multi-region Atlas clusters, configure a private endpoint **per region**
- Google Cloud: Private Service Connect is region-specific; configure global access for cross-region

---

### 2. VPC / VNet Peering

Establishes a private network connection between your cloud VPC and the Atlas VPC.

**Characteristics:**
- Traffic stays on cloud provider backbone (AWS, Azure, GCP)
- Requires non-overlapping CIDR blocks between your VPC and Atlas VPC
- Atlas maps VPCs 1:1 to Atlas projects
- Must configure peering per-region for multi-region deployments

**AWS Setup:**
1. Security → Network Access → Peering → Add New
2. Provide your AWS Account ID, VPC ID, CIDR block
3. Accept the peering request in AWS Console
4. Update your VPC route table to include Atlas CIDR

**Limitations:**
- GKE route-based clusters: use IP access list instead (VPC-native GKE works)
- Google App Engine Standard / Cloud Functions / Cloud Run: use Serverless VPC Access connector
- Azure: add CIDR of peered VNet to IP access list before connecting

---

### 3. IP Access List

Restricts which public IP addresses can connect to Atlas clusters.

**Best practices:**
- Use `/32` (single IP) entries wherever possible
- Never use `0.0.0.0/0` in production — this exposes the cluster to the entire internet
- Set expiry on temporary entries (developers, contractors)
- Maximum 200 entries per project
- Use Atlas Resource Policies to enforce organization-wide rules preventing `0.0.0.0/0`

**2025 Note:** AWS-hosted Atlas clusters began rotating public IPv4 addresses starting January 21, 2025.
- If using hardcoded IPs in firewall rules: update to the new addresses
- If using `mongodb+srv://` connection strings: no action needed (DNS resolves new IPs automatically)
- VPC peering and Private Endpoints: not affected

---

## TLS Requirements

Atlas **enforces TLS on all connections** — this cannot be disabled.

- Default minimum protocol: **TLS 1.2**
- To enforce TLS 1.3: Configure → Advanced → Minimum TLS Protocol Version → TLS 1.3
- Cipher suites: Atlas manages these; you cannot configure custom cipher suites on Atlas

---

## Atlas Shared Responsibility Model

| MongoDB Manages | Customer Manages |
|---|---|
| Underlying infrastructure security | IP access list configuration |
| Platform patching | User account creation and RBAC |
| Physical security | Application-level encryption (CSFLE) |
| Atlas cluster TLS certificates | Customer-managed KMS keys |
| DDoS mitigation | Audit log export and retention |
| Automated backups | VPC/network peering setup |

---

## Recommended Atlas Security Stack (Production)

```
[Application] ─── PrivateLink/VPC Peering ──→ [Atlas Cluster]
                                                    │
                                          TLS 1.2+ (enforced)
                                          SCRAM-SHA-256 / X.509
                                          RBAC (least privilege)
                                          Encryption at Rest (BYOK)
                                          Audit Logging → SIEM
                                          IP Access List: empty (private endpoints only)
```
