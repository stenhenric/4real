import { useEffect, useReducer, useRef, useState, type KeyboardEvent, type MouseEvent, type RefObject } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AlertTriangle, LoaderCircle, Medal, Scale, Search, ShieldAlert, Trophy } from 'lucide-react';
import { useAuth } from '../app/AuthProvider';
import { useToast } from '../app/ToastProvider';
import { drawConnectFourBoard } from '../canvas/drawConnectFourBoard';
import { runVictoryConfetti } from '../canvas/runVictoryConfetti';
import { SketchyButton } from '../components/SketchyButton';
import { SketchyContainer } from '../components/SketchyContainer';
import { SketchCard } from '../components/ui/SketchCard';
import { StatePanel } from '../components/ui/StatePanel';
import { StatusBadge } from '../components/ui/StatusBadge';
import { useCopyToClipboard } from '../hooks/useCopyToClipboard';
import {
  getResignActionPresentation,
  getVerdictHeadline,
  getVerdictMessage,
} from '../features/game/gameOutcomePresentation';
import {
  getGameSocketErrorMessage,
  shouldLeaveGameRoomAfterJoinError,
  shouldLeaveGameRoomAfterSocketError,
} from '../features/game/socketErrorHandling';
import { useGameRoom } from '../features/game/useGameRoom';
import { isHandledAuthRedirectCode } from '../features/auth/auth-routing';
import { ApiClientError } from '../services/api/apiClient';
import { getMatch, joinMatch, resignMatch } from '../services/matches.service';
import { cn } from '../utils/cn';
import { formatMoneyValue, moneyToNumber } from '../utils/exact-money.ts';
import { getApiErrorMessage } from '../utils/errors';
import { createInitialGamePreviewState, gamePreviewReducer } from './gamePreviewReducer';
import type { GameOverState, RoomPlayer, RoomState } from '../features/game/types';
import type { MatchDTO } from '../types/api';
import { RATING_SYSTEM } from '../../shared/rating';

const BOARD_COLUMNS = Array.from({ length: 7 }, (_, index) => index);

function MatchPreviewPanel({
  joining,
  matchPreview,
  onCancel,
  onJoin,
}: {
  joining: boolean;
  matchPreview: MatchDTO;
  onCancel: () => void;
  onJoin: () => void;
}) {
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <SketchyContainer className="bg-white">
        <h2 className="text-3xl font-semibold italic tracking-tight mb-4">Match Preview</h2>
        <p className="text-sm font-mono opacity-60 mb-6">
          Room {matchPreview.roomId.toUpperCase()} • Host {matchPreview.p1Username}
        </p>
        <div className="space-y-3 text-lg font-bold">
          <p>Type: {matchPreview.isPrivate ? 'Private invite' : 'Public lobby'}</p>
          <p>Wager: {formatMoneyValue(matchPreview.wager)} USDT</p>
          <p>Payout: {formatMoneyValue(matchPreview.projectedWinnerAmount ?? 0)} USDT</p>
        </div>
        <p className="mt-6 text-sm opacity-70 italic">
          Joining this room will claim the second seat and lock your wager on the server before realtime play starts.
        </p>
        <div className="mt-8 flex gap-3">
          <SketchyButton className="flex-1" disabled={joining} onClick={onJoin}>
            {joining ? 'Joining…' : 'Join Match'}
          </SketchyButton>
          <SketchyButton className="flex-1" onClick={onCancel}>
            Cancel
          </SketchyButton>
        </div>
      </SketchyContainer>
    </div>
  );
}

function PlayerSummary({
  colorClass,
  isActive,
  label,
  name,
  elo,
  align = 'left',
}: {
  colorClass: string;
  isActive: boolean;
  label: string;
  name: string | undefined;
  elo: number | undefined;
  align?: 'left' | 'right';
}) {
  const isRightAligned = align === 'right';

  return (
    <div
      className={cn(
        'flex flex-col p-2 transition-all text-ink-black',
        isRightAligned ? 'items-end rotate-1' : '-rotate-1',
        isActive ? 'active-player-highlight' : 'opacity-50',
      )}
    >
      <span className="text-[10px] uppercase font-bold opacity-60">{label}</span>
      <span className="font-bold flex items-center gap-2 text-lg">
        {isRightAligned ? null : <div aria-label={`${label} plays ${colorClass.includes('red') ? 'Red' : 'Blue'}`} className={cn('size-4 border-2 border-black', colorClass)} />}
        {name}
        {isRightAligned ? <div aria-label={`${label} plays ${colorClass.includes('red') ? 'Red' : 'Blue'}`} className={cn('size-4 border-2 border-black', colorClass)} /> : null}
      </span>
      <div className="flex items-center gap-2 mt-1 font-mono text-[10px] font-bold">
        <span className="bg-black/5 px-2 py-0.5">ELO {elo ?? RATING_SYSTEM.startingRating}</span>
      </div>
    </div>
  );
}

function OpponentSummary({
  colorClass,
  isActive,
  opponent,
}: {
  colorClass: string;
  isActive: boolean;
  opponent: RoomPlayer | undefined;
}) {
  if (!opponent) {
    return (
      <div className="flex flex-col items-end p-2 transform rotate-1 transition-all text-ink-black opacity-50">
        <span className="text-[10px] uppercase font-bold opacity-60">Opponent</span>
        <span className="font-bold flex items-center gap-2 text-lg">
          Waiting… <div className={cn('size-4 border-2 border-black', colorClass)} />
        </span>
        <span className="font-mono text-[10px] opacity-40 mt-1 uppercase tracking-widest text-ink-black">
          Waiting for opponent…
        </span>
      </div>
    );
  }

  return (
    <PlayerSummary
      align="right"
      colorClass={colorClass}
      elo={opponent.elo}
      isActive={isActive}
      label="Opponent"
      name={opponent.username}
    />
  );
}

function MatchStatus({ status }: { status: RoomState['status'] }) {
  if (status === 'waiting') {
    return (
      <span className="animate-pulse border border-warning-border bg-warning-bg px-3 py-1 text-xs font-bold uppercase text-warning-text shadow-sm">
        Waiting for opponent…
      </span>
    );
  }

  if (status === 'completed') {
    return (
      <span className="text-xl font-bold uppercase text-ink-red underline decoration-wavy decoration-2">
        Match Over!
      </span>
    );
  }

  return (
    <span className="text-xs font-mono opacity-40 font-bold tracking-widest uppercase text-ink-black">
      Live
    </span>
  );
}

function GameBoardPanel({
  canvasRef,
  gameOver,
  handleBoardClick,
  handleBoardKeyDown,
  isMyTurn,
  myColorClass,
  myElo,
  myUserId,
  myUsername,
  opponent,
  opponentColorClass,
  room,
  selectedColumn,
}: {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  gameOver: GameOverState | null;
  handleBoardClick: (event: MouseEvent<HTMLCanvasElement>) => void;
  handleBoardKeyDown: (event: KeyboardEvent<HTMLCanvasElement>) => void;
  isMyTurn: boolean;
  myColorClass: string;
  myElo: number | undefined;
  myUserId: string | undefined;
  myUsername: string | undefined;
  opponent: RoomPlayer | undefined;
  opponentColorClass: string;
  room: RoomState;
  selectedColumn: number;
}) {
  return (
    <div className="flex-1 space-y-6">
      <SketchyContainer className="bg-white">
        <div className="flex justify-between mb-4 px-2">
          <PlayerSummary
            colorClass={myColorClass}
            elo={myElo}
            isActive={room.currentTurn === myUserId}
            label="You"
            name={myUsername}
          />

          <div className="flex flex-col items-center justify-center">
            <MatchStatus status={room.status} />
          </div>

          <OpponentSummary
            colorClass={opponentColorClass}
            isActive={Boolean(opponent && room.currentTurn === opponent.userId)}
            opponent={opponent}
          />
        </div>

        <div className="relative group bg-white">
          <canvas
            aria-describedby="game-board-help"
            aria-label="Connect board. Use the mouse or number keys 1 through 7 to drop a disc."
            className="h-auto w-full cursor-pointer focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-ink-blue"
            height={480}
            onClick={handleBoardClick}
            onKeyDown={handleBoardKeyDown}
            ref={canvasRef}
            tabIndex={0}
            width={560}
          />
          {isMyTurn && !gameOver ? (
            <div className="absolute top-0 left-0 size-full pointer-events-none flex opacity-0 group-hover:opacity-100 transition-opacity">
              {BOARD_COLUMNS.map((column) => (
                <div key={column} className="flex-1 hover:bg-black/5" />
              ))}
            </div>
          ) : null}
        </div>

        <p className="sr-only" id="game-board-help">
          Use left and right arrow keys to choose a column, then press Enter or Space to drop a disc.
          Selected column {selectedColumn + 1}.
        </p>

        {room.status === 'active' && !gameOver ? (
          <div className="mt-4 text-center" aria-live="polite">
            {isMyTurn ? (
              <StatusBadge tone="success">Your turn — drop a disc!</StatusBadge>
            ) : (
              <StatusBadge tone="warning">Waiting for opponent…</StatusBadge>
            )}
          </div>
        ) : null}
      </SketchyContainer>
    </div>
  );
}

function GameSidebar({
  copyInviteLink,
  gameOver,
  inviteLinkAvailable,
  inviteLinkUnavailableMessage,
  onResign,
  opponent,
  resigning,
  room,
  userId,
}: {
  copyInviteLink: () => Promise<void>;
  gameOver: GameOverState | null;
  inviteLinkAvailable: boolean;
  inviteLinkUnavailableMessage?: string;
  onResign: () => void;
  opponent: RoomPlayer | undefined;
  resigning: boolean;
  room: RoomState;
  userId: string | undefined;
}) {
  const [showResignConfirm, setShowResignConfirm] = useState(false);

  const isWagered = moneyToNumber(room.wager) > 0;
  const isWaitingForOpponent = room.status === 'waiting' && !opponent;
  const resignAction = getResignActionPresentation(room);
  const matchExitAction = !gameOver ? (
    showResignConfirm ? (
      <SketchCard tone="danger">
        <p className="text-sm font-bold mb-1">Are you sure?</p>
        {isWagered ? (
          <p className="text-xs opacity-80 mb-4">
            {resignAction.confirmMessage}
          </p>
        ) : null}
        <div className="flex gap-3">
          <SketchyButton
            className="flex-1"
            disabled={resigning}
            onClick={onResign}
            variant="danger"
          >
            {resigning ? resignAction.pendingLabel : resignAction.confirmButtonLabel}
          </SketchyButton>
          <SketchyButton
            className="flex-1"
            onClick={() => setShowResignConfirm(false)}
            variant="ghost"
          >
            Cancel
          </SketchyButton>
        </div>
      </SketchCard>
    ) : (
      <SketchyButton
        aria-describedby={isWagered ? 'resign-warning' : undefined}
        className="w-full"
        disabled={resigning}
        onClick={() => isWagered ? setShowResignConfirm(true) : onResign()}
        variant="danger"
      >
        {resigning ? resignAction.pendingLabel : resignAction.buttonLabel}
      </SketchyButton>
    )
  ) : null;

  return (
    <div className="w-full md:w-64 space-y-6">
      {isWaitingForOpponent ? (
        <div className="sticky-note p-6 rough-border">
          <div className="tape"></div>
          <h3 className="font-semibold text-lg mb-2 uppercase tracking-tighter">Invite Rival</h3>
          <p className="text-xs mb-4 opacity-70 italic">Share this link to invite an opponent</p>
          <SketchyButton
            className="w-full text-xs py-2 bg-white"
            disabled={!inviteLinkAvailable}
            onClick={() => void copyInviteLink()}
          >
            Copy Invite Link
          </SketchyButton>
          {!inviteLinkAvailable && inviteLinkUnavailableMessage ? (
            <p className="mt-3 text-xs font-bold text-warning-text">
              {inviteLinkUnavailableMessage}
            </p>
          ) : null}
          {matchExitAction ? (
            <div className="mt-4 border-t border-black/10 pt-4">
              {matchExitAction}
            </div>
          ) : null}
        </div>
      ) : null}

      {isWagered ? (
        <div className="rough-border bg-ink-blue text-white p-6 relative shadow-xl overflow-hidden">
          <div className="absolute top-0 right-0 p-1 opacity-20">
            <Medal size={48} />
          </div>
          <p className="text-[10px] uppercase font-bold tracking-widest opacity-60 mb-1">Total Room Pot</p>
          <h3 className="text-4xl font-semibold tracking-tighter italic">
            ${formatMoneyValue(room.projectedWinnerAmount)}
          </h3>
          <p className="text-[10px] italic mt-2 opacity-60">
            * Platform fee: {Math.round(moneyToNumber(room.commissionRate) * 100)}%
          </p>
        </div>
      ) : null}

      <SketchyContainer fill="var(--color-note-yellow)">
        <h2 className="text-xl font-semibold flex items-center gap-2 mb-4">
          <Trophy size={18} /> Match Log
        </h2>
        <div className="space-y-2 h-48 overflow-y-auto font-mono text-xs">
          {room.moves.length === 0 ? <p className="opacity-40 italic">No moves yet</p> : null}
          {room.moves.map((move, index) => (
            <div key={`${move.userId}-${move.col}-${move.row}`} className="border-b border-black/5 flex justify-between py-1">
              <span>Move {index + 1}</span>
              <span className="font-bold">
                {move.userId === userId ? 'You' : 'Opponent'} → Column {move.col + 1}
              </span>
            </div>
          ))}
        </div>
      </SketchyContainer>

      {!isWaitingForOpponent ? matchExitAction : null}
      {isWagered ? (
        <p className="sr-only" id="resign-warning">
          {resignAction.accessibleWarning}
        </p>
      ) : null}
    </div>
  );
}


function formatRatingDelta(delta: number): string {
  return delta > 0 ? `+${delta}` : String(delta);
}

function getRatingSkipLabel(skipReason: NonNullable<GameOverState['ratingResult']>['skipReason']): string {
  if (skipReason === 'repeat_pair_limit') {
    return 'repeat match limit';
  }

  if (skipReason === 'no_contest') {
    return 'no contest';
  }

  if (skipReason === 'refunded') {
    return 'refunded match';
  }

  return 'not rated';
}

function getRatingSummary(gameOver: GameOverState, userId: string | undefined): string | null {
  const ratingResult = gameOver.ratingResult;
  if (!ratingResult || !userId) {
    return null;
  }

  const playerRating = ratingResult.player1.userId === userId
    ? ratingResult.player1
    : ratingResult.player2.userId === userId
      ? ratingResult.player2
      : null;
  const opponentRating = ratingResult.player1.userId === userId
    ? ratingResult.player2
    : ratingResult.player2.userId === userId
      ? ratingResult.player1
      : null;

  if (!playerRating) {
    return null;
  }

  if (ratingResult.status === 'applied') {
    const opponentDelta = opponentRating ? ` · Opponent ${formatRatingDelta(opponentRating.delta)}` : '';
    return `ELO ${formatRatingDelta(playerRating.delta)} -> ${playerRating.after}${opponentDelta}`;
  }

  if (ratingResult.status === 'skipped') {
    return `Rating unchanged: ${getRatingSkipLabel(ratingResult.skipReason)}`;
  }

  if (ratingResult.status === 'pending') {
    return 'Rating update pending';
  }

  return 'Rating update reversed';
}

function VerdictModal({
  gameOver,
  onReturnToLobby,
  room,
  userId,
}: {
  gameOver: GameOverState;
  onReturnToLobby: () => void;
  room: RoomState;
  userId: string | undefined;
}) {
  const lobbyButtonRef = useRef<HTMLButtonElement>(null);
  const isWin = gameOver.winnerId === userId;
  const isDraw = gameOver.winnerId === 'draw';
  const ratingSummary = getRatingSummary(gameOver, userId);

  const fill = isWin
    ? 'var(--color-success-bg)'
    : isDraw
      ? 'var(--color-warning-bg)'
      : 'var(--color-danger-bg)';

  const Icon = isWin ? Trophy : isDraw ? Scale : AlertTriangle;

  const headline = getVerdictHeadline({ gameOver, isDraw, isWin, room });
  const message = getVerdictMessage({ gameOver, isDraw, isWin, room });

  const hasWager = moneyToNumber(room.wager) > 0;

  useEffect(() => {
    lobbyButtonRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        onReturnToLobby();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onReturnToLobby]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-labelledby="verdict-headline"
    >
      <div className="w-full max-w-sm mx-4">
        <SketchyContainer className="bg-white" fill={fill} roughness={2}>
          <div className="text-center" aria-live="assertive">
            <div className="flex justify-center mb-3">
              <Icon size={40} />
            </div>
            <h2 id="verdict-headline" className="text-2xl font-bold uppercase tracking-tight mb-2">
              {headline}
            </h2>
            <p className="mb-4 text-sm font-bold opacity-75">
              {message}
            </p>

            {hasWager ? (
              <p className="text-lg font-bold font-mono mb-1">
                {isWin
                  ? `Won: $${formatMoneyValue(room.projectedWinnerAmount)} USDT`
                  : isDraw
                    ? 'Wager refunded'
                    : `Lost: $${formatMoneyValue(room.wager)} USDT`}
              </p>
            ) : null}

            {gameOver.winningLine ? (
              <p className="text-xs opacity-60 mb-4">Won by: 4 in a row</p>
            ) : (
              <div className="mb-4" />
            )}

            {ratingSummary ? (
              <p className="mb-4 font-mono text-xs font-bold uppercase opacity-70">
                {ratingSummary}
              </p>
            ) : null}

            <SketchyButton
              className="w-full"
              onClick={onReturnToLobby}
              ref={lobbyButtonRef}
              variant="primary"
            >
              Return to Lobby
            </SketchyButton>
          </div>
        </SketchyContainer>
      </div>
    </div>
  );
}

function MissingRoomPanel({ onBackToLobby }: { onBackToLobby: () => void }) {
  return (
    <StatePanel
      actions={(
        <SketchyButton onClick={onBackToLobby} type="button" variant="primary">
          Back to lobby
        </SketchyButton>
      )}
      eyebrow="Match"
      icon={Search}
      title="Game room not found"
      tone="warning"
    />
  );
}

function MatchLedgerLoadingPanel() {
  return (
    <StatePanel
      eyebrow="Match ledger"
      icon={LoaderCircle}
      iconClassName="animate-spin"
      title="Loading match details..."
      tone="info"
    />
  );
}

function MatchAccessDeniedPanel({ onBackToLobby }: { onBackToLobby: () => void }) {
  return (
    <StatePanel
      actions={(
        <SketchyButton onClick={onBackToLobby} type="button" variant="primary">
          Back to lobby
        </SketchyButton>
      )}
      eyebrow="Access denied"
      icon={ShieldAlert}
      title="You do not have access to this match"
      tone="danger"
    />
  );
}

function MatchTableLoadingPanel() {
  return (
    <StatePanel
      eyebrow="Match"
      icon={AlertTriangle}
      title="Connecting to game room..."
      tone="info"
    />
  );
}

const GamePage = () => {
  const { roomId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, userData, refreshUser } = useAuth();
  const { error: showError } = useToast();
  const copyToClipboard = useCopyToClipboard();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previousRoomStatusRef = useRef<string | null>(null);
  const [selectedColumn, setSelectedColumn] = useState(0);
  const [previewState, dispatchPreview] = useReducer(
    gamePreviewReducer,
    undefined,
    createInitialGamePreviewState,
  );
  const { matchPreview, previewLoading, roomAccessReady } = previewState;
  const [joining, setJoining] = useState(false);
  const [resigning, setResigning] = useState(false);
  const inviteToken = searchParams.get('invite')?.trim() || undefined;

  const { applySettledMatch, gameOver, makeMove, room } = useGameRoom({
    ...(roomId ? { roomId } : {}),
    ...(user?.id ? { userId: user.id } : {}),
    enabled: roomAccessReady && Boolean(roomId && user?.id),
    onRoomError: (socketError) => {
      showError(getGameSocketErrorMessage(socketError));
      if (shouldLeaveGameRoomAfterSocketError(socketError)) {
        navigate('/play');
      }
    },
    onGameOver: async (nextGameOver) => {
      if (nextGameOver.winnerId === user?.id) {
        runVictoryConfetti();
      }
    },
  });

  useEffect(() => {
    if (!roomId || !user?.id) {
      dispatchPreview({ type: 'PREVIEW_RESET' });
      return;
    }

    const controller = new AbortController();
    dispatchPreview({ type: 'PREVIEW_REQUESTED' });

    void getMatch(roomId, controller.signal, inviteToken)
      .then((match) => {
        if (controller.signal.aborted) {
          return;
        }

        const isParticipant = match.player1Id === user.id || match.player2Id === user.id;

        if (isParticipant) {
          dispatchPreview({ type: 'PREVIEW_LOADED_AS_PARTICIPANT', matchPreview: match });
          return;
        }

        if (match.status !== 'waiting') {
          dispatchPreview({ type: 'PREVIEW_NOT_JOINABLE', matchPreview: match });
          showError('This match is no longer open for new players.');
          navigate('/play');
          return;
        }

        dispatchPreview({ type: 'PREVIEW_LOADED_JOINABLE', matchPreview: match });
      })
      .catch((error) => {
        if (controller.signal.aborted) {
          return;
        }

        if (error instanceof ApiClientError && isHandledAuthRedirectCode(error.code)) {
          return;
        }

        dispatchPreview({ type: 'PREVIEW_FAILED' });
        showError(getApiErrorMessage(error, 'We could not load that match. Returning to lobby.'));
        navigate('/play');
      });

    return () => {
      controller.abort();
    };
  }, [inviteToken, navigate, roomId, user?.id, showError]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    drawConnectFourBoard(canvas, room?.board, gameOver?.winningLine);
  }, [gameOver?.winningLine, room?.board]);

  useEffect(() => {
    if (!room || !user?.id) {
      previousRoomStatusRef.current = null;
      return;
    }

    const previousStatus = previousRoomStatusRef.current;
    const justActivated = moneyToNumber(room.wager) > 0 && room.status === 'active' && previousStatus !== 'active';
    const justCompleted = room.status === 'completed' && previousStatus !== 'completed';

    if (justActivated || justCompleted) {
      void refreshUser();
    }

    previousRoomStatusRef.current = room.status;
  }, [refreshUser, room, user?.id]);

  const canJoinMatch = Boolean(
    roomId &&
    matchPreview &&
    user?.id &&
    !roomAccessReady &&
    matchPreview.status === 'waiting' &&
    matchPreview.player1Id !== user.id &&
    !matchPreview.player2Id,
  );

  const handleJoinMatch = async () => {
    if (!roomId || !canJoinMatch) {
      return;
    }

    setJoining(true);
    try {
      const joinedMatch = await joinMatch(roomId, inviteToken);
      dispatchPreview({ type: 'JOIN_SUCCEEDED', matchPreview: joinedMatch });
      if (moneyToNumber(joinedMatch.wager) > 0) {
        await refreshUser();
      }
    } catch (error) {
      if (error instanceof ApiClientError && isHandledAuthRedirectCode(error.code)) {
        return;
      }

      showError(getApiErrorMessage(error, 'We could not join that match. Please try again.'));
      if (error instanceof ApiClientError && shouldLeaveGameRoomAfterJoinError(error.code)) {
        navigate('/play');
      }
    } finally {
      setJoining(false);
    }
  };

  const handleResignMatch = async () => {
    if (!roomId || resigning) {
      return;
    }

    setResigning(true);
    try {
      const settledMatch = await resignMatch(roomId);
      dispatchPreview({ type: 'JOIN_SUCCEEDED', matchPreview: settledMatch });
      applySettledMatch(settledMatch);
      await refreshUser();
    } catch (error) {
      if (error instanceof ApiClientError && isHandledAuthRedirectCode(error.code)) {
        return;
      }

      showError(getApiErrorMessage(error, 'We could not resign that match. Please try again.'));
    } finally {
      setResigning(false);
    }
  };

  if (!roomId) {
    return <MissingRoomPanel onBackToLobby={() => navigate('/play')} />;
  }

  if (previewLoading) {
    return <MatchLedgerLoadingPanel />;
  }

  if (!roomAccessReady && canJoinMatch && matchPreview) {
    return (
      <MatchPreviewPanel
        joining={joining}
        matchPreview={matchPreview}
        onCancel={() => navigate('/play')}
        onJoin={() => void handleJoinMatch()}
      />
    );
  }

  if (!roomAccessReady) {
    return <MatchAccessDeniedPanel onBackToLobby={() => navigate('/play')} />;
  }

  if (!room) {
    return <MatchTableLoadingPanel />;
  }

  const isMyTurn = room.currentTurn === user?.id;
  const opponent = room.players.find((player) => player.userId !== user?.id);
  const myIndex = room.players.findIndex((player) => player.userId === user?.id);
  const opponentIndex = room.players.findIndex((player) => player.userId !== user?.id);

  const myColorClass = myIndex === 0 ? 'bg-disc-red' : 'bg-disc-blue';
  const opponentColorClass = opponentIndex === 0 ? 'bg-disc-red' : 'bg-disc-blue';

  const tryMakeMove = (col: number) => {
    if (!room || !isMyTurn || gameOver) {
      return;
    }

    if (room.board && room.board[0] && room.board[0][col] !== null) {
      showError('This column is full!');
      return;
    }

    makeMove(col);
  };

  const handleBoardClick = (event: MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const col = Math.floor(x / (rect.width / 7));
    tryMakeMove(col);
  };

  const handleBoardKeyDown = (event: KeyboardEvent<HTMLCanvasElement>) => {
    if (!isMyTurn || gameOver) {
      return;
    }

    if (event.key === 'ArrowRight') {
      event.preventDefault();
      setSelectedColumn((currentValue) => Math.min(currentValue + 1, 6));
      return;
    }

    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      setSelectedColumn((currentValue) => Math.max(currentValue - 1, 0));
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      tryMakeMove(selectedColumn);
      return;
    }

    if (/^[1-7]$/.test(event.key)) {
      event.preventDefault();
      tryMakeMove(Number(event.key) - 1);
    }
  };

  const isPrivateRoom = Boolean(room.isPrivate || matchPreview?.isPrivate);
  const inviteLinkAvailable = !isPrivateRoom || Boolean(inviteToken || matchPreview?.inviteUrl);
  const invitePath = matchPreview?.inviteUrl
    ? new URL(matchPreview.inviteUrl, window.location.origin).toString()
    : `${window.location.origin}/game/${roomId}${inviteToken ? `?invite=${encodeURIComponent(inviteToken)}` : ''}`;

  const copyInviteLink = async () => {
    if (!inviteLinkAvailable) {
      showError('Private invite link unavailable from this URL.');
      return;
    }

    await copyToClipboard(invitePath, 'Invite link copied!');
  };

  return (
    <>
      <div className="max-w-4xl mx-auto flex flex-col md:flex-row gap-8">
        <GameBoardPanel
          canvasRef={canvasRef}
          gameOver={gameOver}
          handleBoardClick={handleBoardClick}
          handleBoardKeyDown={handleBoardKeyDown}
          isMyTurn={isMyTurn}
          myColorClass={myColorClass}
          myElo={userData?.elo}
          myUserId={user?.id}
          myUsername={userData?.username}
          opponent={opponent}
          opponentColorClass={opponentColorClass}
          room={room}
          selectedColumn={selectedColumn}
        />

        <GameSidebar
          copyInviteLink={copyInviteLink}
          gameOver={gameOver}
          inviteLinkAvailable={inviteLinkAvailable}
          inviteLinkUnavailableMessage="Private invite link unavailable from this URL."
          onResign={() => void handleResignMatch()}
          opponent={opponent}
          resigning={resigning}
          room={room}
          userId={user?.id}
        />
      </div>

      {gameOver && room.status === 'completed' ? (
        <VerdictModal
          gameOver={gameOver}
          onReturnToLobby={() => navigate('/play')}
          room={room}
          userId={user?.id}
        />
      ) : null}
    </>
  );
};

export default GamePage;
