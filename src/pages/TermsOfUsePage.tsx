import { Link } from 'react-router-dom';

const TermsOfUsePage = () => {
  return (
    <div className="max-w-3xl mx-auto py-12 px-6">
      <Link
        to="/"
        className="inline-flex items-center gap-1 text-sm font-bold opacity-60 hover:opacity-100 transition-opacity mb-8"
      >
        ← 4real home
      </Link>
      <div className="rough-border bg-white p-10 shadow-xl relative">
        <div className="tape w-24 h-8 -top-3 left-1/2 -ml-12"></div>
        <h1 className="text-5xl font-display font-bold italic tracking-tighter mb-8">Terms of Use</h1>

        <div className="space-y-6 font-bold text-base opacity-80 leading-relaxed">
          <section>
            <h2 className="text-2xl font-display mb-2 text-ink-black opacity-100">1. Eligibility and Jurisdiction</h2>
            <p>
              4real is a real-money application. By using this service, you confirm that you are at least 18 years of
              age (or the age of legal majority in your jurisdiction) and that participating in real-money skill-based
              gaming is legal in your location.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-display mb-2 text-ink-black opacity-100">
              2. Financial Transactions &amp; Wallets
            </h2>
            <p>
              Users are solely responsible for controlling their own TON wallets. You must submit truthful, accurate
              payment proofs when making deposits. Submitting forged or fraudulent payment proofs will result in
              immediate and permanent account suspension and forfeiture of funds.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-display mb-2 text-ink-black opacity-100">3. Gameplay and Settlement</h2>
            <p>
              4real is a game of skill. All wagers placed on matches are final. The server operates as the definitive
              source of truth for game state and outcome resolution. In the event of a network disconnection or
              abandonment, standard game forfeiture rules apply.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-display mb-2 text-ink-black opacity-100">4. Account Security</h2>
            <p>
              You are responsible for maintaining the security of your account. We strongly recommend enabling
              Multi-Factor Authentication (MFA). 4real is not liable for unauthorized access resulting from
              compromised email accounts or shared devices.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-display mb-2 text-ink-black opacity-100">5. Platform Changes</h2>
            <p>
              4real reserves the right to modify these terms at any time. Continued use of the platform after changes
              constitutes acceptance of the updated terms.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
};

export default TermsOfUsePage;
