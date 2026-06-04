export type DashboardDraftType = 'private' | 'free_public' | 'paid_public';

export interface DashboardDraftState {
  isDrafting: boolean;
  draftStep: 1 | 2;
  draftType: DashboardDraftType | null;
  wager: string;
  isCreatingMatch: boolean;
}

export type DashboardDraftAction =
  | { type: 'DRAFT_OPENED' }
  | { type: 'DRAFT_TYPE_SELECTED'; draftType: DashboardDraftType }
  | { type: 'WAGER_CHANGED'; wager: string }
  | { type: 'DRAFT_STEP_CHANGED'; draftStep: 1 | 2 }
  | { type: 'CREATE_STARTED' }
  | { type: 'CREATE_FAILED' }
  | { type: 'DRAFT_RESET' };

export function createInitialDashboardDraftState(): DashboardDraftState {
  return {
    isDrafting: false,
    draftStep: 1,
    draftType: null,
    wager: '0',
    isCreatingMatch: false,
  };
}

export function dashboardDraftReducer(
  state: DashboardDraftState,
  action: DashboardDraftAction,
): DashboardDraftState {
  switch (action.type) {
    case 'DRAFT_OPENED':
      return {
        ...state,
        isDrafting: true,
      };
    case 'DRAFT_TYPE_SELECTED':
      return {
        ...state,
        draftType: action.draftType,
      };
    case 'WAGER_CHANGED':
      return {
        ...state,
        wager: action.wager,
      };
    case 'DRAFT_STEP_CHANGED':
      return {
        ...state,
        draftStep: action.draftStep,
      };
    case 'CREATE_STARTED':
      return {
        ...state,
        isCreatingMatch: true,
      };
    case 'CREATE_FAILED':
      return {
        ...state,
        isCreatingMatch: false,
      };
    case 'DRAFT_RESET':
      return createInitialDashboardDraftState();
    default: {
      const exhaustive: never = action;
      return exhaustive;
    }
  }
}
