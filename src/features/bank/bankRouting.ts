export type BankView = 'portal' | 'merchant' | 'deposit' | 'withdraw';

const BANK_VIEWS = new Set<BankView>(['portal', 'merchant', 'deposit', 'withdraw']);

export function getBankViewFromSearchParams(searchParams: URLSearchParams): BankView {
  const view = searchParams.get('view');
  return view && BANK_VIEWS.has(view as BankView) ? view as BankView : 'portal';
}

export function updateBankViewSearch(searchParams: URLSearchParams, view: BankView): string {
  const nextParams = new URLSearchParams(searchParams);
  nextParams.delete('mfa');

  if (view === 'portal') {
    nextParams.delete('view');
    nextParams.delete('flow');
  } else {
    nextParams.set('view', view);
    if (view !== 'withdraw') {
      nextParams.delete('flow');
    }
  }

  const query = nextParams.toString();
  return query ? `?${query}` : '';
}
