import { Gamepad2, RefreshCw, Scale, ShieldCheck, Wallet } from 'lucide-react';
import { LegalPageShell, type LegalSection } from '../components/ui/LegalPageShell';

const TERMS_SECTIONS: LegalSection[] = [
  {
    badge: 'Access',
    icon: Scale,
    title: '1. Eligibility and Jurisdiction',
    body: (
      <p>
        4real is a real-money application. By using this service, you confirm that you are at least 18 years of
        age (or the age of legal majority in your jurisdiction) and that participating in real-money skill-based
        gaming is legal in your location.
      </p>
    ),
  },
  {
    badge: 'Wallets',
    icon: Wallet,
    title: '2. Financial Transactions & Wallets',
    body: (
      <p>
        Users are solely responsible for controlling their own TON wallets. You must submit truthful, accurate
        payment proofs when making deposits. Submitting forged or fraudulent payment proofs will result in
        immediate and permanent account suspension and forfeiture of funds.
      </p>
    ),
    tone: 'warning',
  },
  {
    badge: 'Gameplay',
    icon: Gamepad2,
    title: '3. Gameplay and Settlement',
    body: (
      <p>
        4real is a game of skill. All wagers placed on matches are final. The server operates as the definitive
        source of truth for game state and outcome resolution. In the event of a network disconnection or
        abandonment, standard game forfeiture rules apply.
      </p>
    ),
  },
  {
    badge: 'Security',
    icon: ShieldCheck,
    title: '4. Account Security',
    body: (
      <p>
        You are responsible for maintaining the security of your account. We strongly recommend enabling
        Multi-Factor Authentication (MFA). 4real is not liable for unauthorized access resulting from
        compromised email accounts or shared devices.
      </p>
    ),
    tone: 'success',
  },
  {
    badge: 'Updates',
    icon: RefreshCw,
    title: '5. Platform Changes',
    body: (
      <p>
        4real reserves the right to modify these terms at any time. Continued use of the platform after changes
        constitutes acceptance of the updated terms.
      </p>
    ),
  },
];

const TermsOfUsePage = () => {
  return (
    <LegalPageShell
      eyebrow="Player agreement"
      sections={TERMS_SECTIONS}
      summary="The same terms, grouped into clearer notebook sections with the existing status-token system."
      title="Terms of Use"
    />
  );
};

export default TermsOfUsePage;
