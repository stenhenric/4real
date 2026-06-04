import type { MatchDTO } from '../types/api';

export interface GamePreviewState {
  matchPreview: MatchDTO | null;
  previewLoading: boolean;
  roomAccessReady: boolean;
}

export type GamePreviewAction =
  | { type: 'PREVIEW_REQUESTED' }
  | { type: 'PREVIEW_RESET' }
  | { type: 'PREVIEW_LOADED_AS_PARTICIPANT'; matchPreview: MatchDTO }
  | { type: 'PREVIEW_LOADED_JOINABLE'; matchPreview: MatchDTO }
  | { type: 'PREVIEW_NOT_JOINABLE'; matchPreview: MatchDTO }
  | { type: 'PREVIEW_FAILED' }
  | { type: 'JOIN_SUCCEEDED'; matchPreview: MatchDTO };

export function createInitialGamePreviewState(): GamePreviewState {
  return {
    matchPreview: null,
    previewLoading: true,
    roomAccessReady: false,
  };
}

export function gamePreviewReducer(
  state: GamePreviewState,
  action: GamePreviewAction,
): GamePreviewState {
  switch (action.type) {
    case 'PREVIEW_REQUESTED':
      return {
        ...state,
        previewLoading: true,
      };
    case 'PREVIEW_RESET':
      return {
        matchPreview: null,
        previewLoading: false,
        roomAccessReady: false,
      };
    case 'PREVIEW_LOADED_AS_PARTICIPANT':
      return {
        matchPreview: action.matchPreview,
        previewLoading: false,
        roomAccessReady: true,
      };
    case 'PREVIEW_LOADED_JOINABLE':
    case 'PREVIEW_NOT_JOINABLE':
      return {
        matchPreview: action.matchPreview,
        previewLoading: false,
        roomAccessReady: false,
      };
    case 'PREVIEW_FAILED':
      return {
        matchPreview: null,
        previewLoading: false,
        roomAccessReady: false,
      };
    case 'JOIN_SUCCEEDED':
      return {
        matchPreview: action.matchPreview,
        previewLoading: false,
        roomAccessReady: true,
      };
    default: {
      const exhaustive: never = action;
      return exhaustive;
    }
  }
}
