import { useEffect, useReducer, useRef, useState, type KeyboardEvent, type MouseEvent, type RefObject } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AlertTriangle, LoaderCircle, Medal, Search, ShieldAlert, Trophy } from 'lucide-react';
import { useAuth } from '../app/AuthProvider';
import { useToast } from '../app/ToastProvider';
import { drawConnectFourBoard } from '../canvas/drawConnectFourBoard';
import { runVictoryConfetti } from '../canvas/runVictoryConfetti';
import { SketchyButton } from '../components/SketchyButton';
import { SketchyContainer } from '../components/SketchyContainer';
import { StatePanel } from '../components/ui/StatePanel';
import { useCopyToClipboard } from '../hooks/useCopyToClipboard';
import { useGameRoom } from '../features/game/useGameRoom';
import { getMatch, joinMatch, resignMatch } from '../services/matches.service';
import { cn } from '../utils/cn';
import { formatMoneyValue, moneyToNumber } from '../utils/exact-money.ts';
import { getApiErrorMessage } from '../utils/errors';
import { createInitialGamePreviewState, gamePreviewReducer } from './gamePreviewReducer';
import type { GameOverState, RoomPlayer, RoomState } from '../features/game/types';
import type { MatchDTO } from '../types/api';

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
  wager,
  elo,
  align = 'left',
}: {
  colorClass: string;
  isActive: boolean;
  label: string;
  name: string | undefined;
  wager: number;
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
        {isRightAligned ? null : <div className={cn('size-4 border-2 border-black', colorClass)} />}
        {name}
        {isRightAligned ? <div className={cn('size-4 border-2 border-black', colorClass)} /> : null}
      </span>
      <div className="flex items-center gap-2 mt-1 font-mono text-[10px] font-bold">
        {isRightAligned && moneyToNumber(wager) > 0 ? (
          <span className="border border-warning-border bg-warning-bg px-2 py-0.5 text-warning-text">
            Wager: ${formatMoneyValue(wager)}
          </span>
        ) : null}
        <span className="bg-black/5 px-2 py-0.5">ELO {elo || 1000}</span>
        {!isRightAligned && moneyToNumber(wager) > 0 ? (
          <span className="border border-warning-border bg-warning-bg px-2 py-0.5 text-warning-text">
            Wager: ${formatMoneyValue(wager)}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function OpponentSummary({
  colorClass,
  isActive,
  opponent,
  wager,
}: {
  colorClass: string;
  isActive: boolean;
  opponent: RoomPlayer | undefined;
  wager: number;
}) {
  if (!opponent) {
    return (
      <div className="flex flex-col items-end p-2 transform rotate-1 transition-all text-ink-black opacity-50">
        <span className="text-[10px] uppercase font-bold opacity-60">Opponent</span>
        <span className="font-bold flex items-center gap-2 text-lg">
          Waiting… <div className={cn('size-4 border-2 border-black', colorClass)} />
        </span>
        <span className="font-mono text-[10px] opacity-40 mt-1 uppercase tracking-widest text-ink-black">
          Awaiting rival…
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
      wager={wager}
    />
  );
}

function MatchStatus({ status }: { status: RoomState['status'] }) {
  if (status === 'waiting') {
    return (
      <span className="animate-pulse border border-warning-border bg-warning-bg px-3 py-1 text-xs font-bold uppercase text-warning-text shadow-sm">
        Waiting for P2…
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
  invitePath,
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
  invitePath: string;
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
            wager={room.wager}
          />

          <div className="flex flex-col items-center justify-center">
            <MatchStatus status={room.status} />
          </div>

          <OpponentSummary
            colorClass={opponentColorClass}
            isActive={Boolean(opponent && room.currentTurn === opponent.userId)}
            opponent={opponent}
            wager={room.wager}
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
        <p className="text-center mt-4 text-xs font-mono opacity-40">
          INVITE LINK: {invitePath}
        </p>
      </SketchyContainer>
    </div>
  );
}

function GameSidebar({
  copyInviteLink,
  gameOver,
  onResign,
  onReturnToLobby,
  opponent,
  resigning,
  room,
  userId,
}: {
  copyInviteLink: () => Promise<void>;
  gameOver: GameOverState | null;
  onResign: () => void;
  onReturnToLobby: () => void;
  opponent: RoomPlayer | undefined;
  resigning: boolean;
  room: RoomState;
  userId: string | undefined;
}) {
  return (
    <div className="w-full md:w-64 space-y-6">
      {room.status === 'waiting' && !opponent ? (
        <div className="sticky-note p-6 rough-border">
          <div className="tape"></div>
          <h3 className="font-semibold text-lg mb-2 uppercase tracking-tighter">Invite Rival</h3>
          <p className="text-xs mb-4 opacity-70 italic">Link is ready for the ink. Send it to a friend!</p>
          <SketchyButton className="w-full text-xs py-2 bg-white" onClick={() => void copyInviteLink()}>
            Copy Draft Link
          </SketchyButton>
        </div>
      ) : null}

      {moneyToNumber(room.wager) > 0 ? (
        <div className="rough-border bg-ink-blue text-white p-6 relative shadow-xl overflow-hidden">
          <div className="absolute top-0 right-0 p-1 opacity-20">
            <Medal size={48} />
          </div>
          <p className="text-[10px] uppercase font-bold tracking-widest opacity-60 mb-1">Total Room Pot</p>
          <h3 className="text-4xl font-semibold tracking-tighter italic">
            ${formatMoneyValue(room.projectedWinnerAmount)}
          </h3>
          <p className="text-[10px] italic mt-2 opacity-60">
            * {Math.round(moneyToNumber(room.commissionRate) * 100)}% Merchant Commission Applied
          </p>
        </div>
      ) : null}

      <SketchyContainer fill="var(--color-note-yellow)">
        <h2 className="text-xl font-semibold flex items-center gap-2 mb-4">
          <Trophy size={18} /> Match Log
        </h2>
        <div className="space-y-2 h-48 overflow-y-auto font-mono text-xs">
          {room.moves.length === 0 ? <p className="opacity-40 italic">Waiting for first strike…</p> : null}
          {room.moves.map((move, index) => (
            <div key={`${move.userId}-${move.col}-${move.row}`} className="border-b border-black/5 flex justify-between py-1">
              <span>Move {index + 1}</span>
              <span className="font-bold">
                {move.userId === userId ? 'You' : 'Opp'} dropped @ col {move.col + 1}
              </span>
            </div>
          ))}
        </div>
      </SketchyContainer>

      <SketchyButton className="w-full" onClick={onResign} variant="danger">
        {resigning ? 'Resigning…' : 'Resign Match'}
      </SketchyButton>

      {gameOver ? (
        <SketchyContainer fill="var(--color-success-bg)" roughness={2}>
          <h3 className="font-semibold text-center text-xl mb-4 uppercase">Verdict</h3>
          <p className="text-center font-bold mb-4">
            {gameOver.winnerId === 'draw'
              ? 'Match is a DRAW!'
              : gameOver.winnerId === userId
                ? 'You are VICTORIOUS!'
                : 'You were DEFEATED.'}
          </p>
          <SketchyButton className="w-full" onClick={onReturnToLobby}>
            Return to Lobby
          </SketchyButton>
        </SketchyContainer>
      ) : null}
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
      title="Inspecting the match ledger..."
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
      title="Finding the table..."
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

  const { gameOver, makeMove, room } = useGameRoom({
    ...(roomId ? { roomId } : {}),
    ...(user?.id ? { userId: user.id } : {}),
    enabled: roomAccessReady && Boolean(roomId && user?.id),
    onRoomError: (message) => {
      showError(message);
      navigate('/play');
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
      showError(getApiErrorMessage(error, 'We could not join that match. Please try again.'));
      navigate('/play');
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
      await refreshUser();
      navigate('/play');
    } catch (error) {
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

  const handleBoardClick = (event: MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const col = Math.floor(x / (rect.width / 7));
    makeMove(col);
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
      makeMove(selectedColumn);
      return;
    }

    if (/^[1-7]$/.test(event.key)) {
      event.preventDefault();
      makeMove(Number(event.key) - 1);
    }
  };

  const invitePath = `${window.location.origin}/game/${roomId}${inviteToken ? `?invite=${encodeURIComponent(inviteToken)}` : ''}`;

  const copyInviteLink = async () => {
    const link = invitePath;
    await copyToClipboard(link, 'Invite link scratched to clipboard!');
  };

  return (
    <div className="max-w-4xl mx-auto flex flex-col md:flex-row gap-8">
      <GameBoardPanel
        canvasRef={canvasRef}
        gameOver={gameOver}
        handleBoardClick={handleBoardClick}
        handleBoardKeyDown={handleBoardKeyDown}
        invitePath={invitePath}
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
        onResign={() => void handleResignMatch()}
        onReturnToLobby={() => navigate('/play')}
        opponent={opponent}
        resigning={resigning}
        room={room}
        userId={user?.id}
      />
    </div>
  );
};

export default GamePage;
