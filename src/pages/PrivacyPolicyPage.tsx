import { Database, FileImage, LifeBuoy, LockKeyhole, Settings } from 'lucide-react';
import { LegalPageShell, type LegalSection } from '../components/ui/LegalPageShell';

const PRIVACY_SECTIONS: LegalSection[] = [
  {
    badge: 'Collected',
    icon: Database,
    title: '1. Information We Collect',
    body: (
      <p>
        To operate the 4real platform securely, we collect: <strong>Identity Data</strong> (email address,
        Google Profile information if used for SSO), <strong>Financial Data</strong> (TON wallet addresses,
        transaction hashes), <strong>Security Data</strong> (IP addresses, device metadata, active session
        details), and <strong>Verification Data</strong> (merchant deposit proofs, screenshots, and receipts).
      </p>
    ),
  },
  {
    badge: 'Usage',
    icon: Settings,
    title: '2. How We Use Your Data',
    body: (
      <p>
        We process your data strictly to: facilitate real-money gameplay, process deposits and withdrawals,
        enforce fraud controls, maintain account security (including MFA and session revocation), and provide
        customer support. We do not sell your personal data to third parties for marketing purposes.
      </p>
    ),
    tone: 'success',
  },
  {
    badge: 'Proofs',
    icon: FileImage,
    title: '3. Deposit Proofs & Third Parties',
    body: (
      <p>
        Merchant proof uploads (such as screenshots of transfers) are relayed securely to our designated review
        channels for operator verification. Do not upload third-party personal data or unnecessary sensitive
        information that is not explicitly required to prove payment.
      </p>
    ),
    tone: 'warning',
  },
  {
    badge: 'Retention',
    icon: LockKeyhole,
    title: '4. Data Retention & Security',
    body: (
      <p>
        We utilize short-lived access cookies and rotated refresh tokens. Transaction histories and blockchain
        interactions are retained indefinitely as part of immutable ledger records. Your account data is
        retained as long as your account is active or as required by applicable compliance laws.
      </p>
    ),
  },
  {
    badge: 'Support',
    icon: LifeBuoy,
    title: '5. Contact',
    body: (
      <p>
        For privacy-related queries, contact us via the support channel listed in the app. We aim to respond
        within 30 days.
      </p>
    ),
  },
];

const PrivacyPolicyPage = () => {
  return (
    <LegalPageShell
      eyebrow="Data handling"
      sections={PRIVACY_SECTIONS}
      summary="The same privacy policy, organized into scannable sections with the existing paper and status-token system."
      title="Privacy Policy"
    />
  );
};

export default PrivacyPolicyPage;
