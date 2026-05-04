import React from 'react';

const PrivacyPolicyPage = () => {
  return (
    <div className="max-w-3xl mx-auto py-12 px-6">
      <div className="rough-border bg-white p-10 shadow-xl relative">
        <div className="tape w-24 h-8 -top-3 left-1/2 -ml-12"></div>
        <h1 className="text-5xl font-display font-bold italic tracking-tighter mb-8">Privacy Policy</h1>
        
        <div className="space-y-6 font-bold text-base opacity-80 leading-relaxed">
          <section>
            <h2 className="text-2xl font-display mb-2 text-ink-black opacity-100">1. Information We Collect</h2>
            <p>
              To operate the 4real platform securely, we collect: <strong>Identity Data</strong> (email address, Google Profile information if used for SSO), 
              <strong> Financial Data</strong> (TON wallet addresses, transaction hashes), <strong>Security Data</strong> (IP addresses, device metadata, active session details), 
              and <strong>Verification Data</strong> (merchant deposit proofs, screenshots, and receipts).
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-display mb-2 text-ink-black opacity-100">2. How We Use Your Data</h2>
            <p>
              We process your data strictly to: facilitate real-money gameplay, process deposits and withdrawals, enforce fraud controls, 
              maintain account security (including MFA and session revocation), and provide customer support. We do not sell your personal data 
              to third parties for marketing purposes.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-display mb-2 text-ink-black opacity-100">3. Deposit Proofs & Third Parties</h2>
            <p>
              Merchant proof uploads (such as screenshots of transfers) are relayed securely to our designated review channels (e.g., Telegram) 
              for operator verification. Do not upload third-party personal data or unnecessary sensitive information that is not explicitly required to prove payment.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-display mb-2 text-ink-black opacity-100">4. Data Retention & Security</h2>
            <p>
              We utilize short-lived access cookies and rotated refresh tokens. Transaction histories and blockchain interactions are retained 
              indefinitely as part of immutable ledger records. Your account data is retained as long as your account is active or as required by 
              applicable compliance laws.
            </p>
          </section>

          <p className="p-4 mt-8 bg-yellow-100/50 rough-border text-sm italic opacity-100">
            <strong>Disclaimer:</strong> If you operate this service in production, this placeholder must be reviewed and 
            updated by legal counsel to ensure compliance with your jurisdiction's specific data protection regulations (e.g., GDPR, CCPA).
          </p>
        </div>
      </div>
    </div>
  );
};

export default PrivacyPolicyPage;
