import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Medal, Trophy } from 'lucide-react';
import { useAuth } from '../app/AuthProvider';
import { useToast } from '../app/ToastProvider';
import { drawConnectFourBoard } from '../canvas/drawConnectFourBoard';
import { runVictoryConfetti } from '../canvas/runVictoryConfetti';
import { SketchyButton } from '../components/SketchyButton';
import { SketchyContainer } from '../components/SketchyContainer';
import { useCopyToClipboard } from '../hooks/useCopyToClipboard';
import { useGameRoom } from '../features/game/useGameRoom';
import { cn } from '../utils/cn';

const BOARD_COLUMNS = Array.from({ length: 7 }, (_, index) => index);

const GamePage = () => {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { user, userData, refreshUser } = useAuth();
  const { warning } = useToast();
  const copyToClipboard = useCopyToClipboard();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previousRoomStatusRef = useRef<string | null>(null);
  const [selectedColumn, setSelectedColumn] = useState(0);

  const { gameOver, makeMove, room } = useGameRoom({
    roomId,
    userId: user?.id,
    onRoomError: (message) => {
      warning(message);
      navigate('/');
    },
    onGameOver: async (nextGameOver) => {
      if (nextGameOver.winnerId === user?.id) {
        runVictoryConfetti();
      }
    },
  });

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
    const justActivated = room.wager > 0 && room.status === 'active' && previousStatus !== 'active';
    const justCompleted = room.status === 'completed' && previousStatus !== 'completed';

    if (justActivated || justCompleted) {
      void refreshUser();
    }

    previousRoomStatusRef.current = room.status;
  }, [refreshUser, room, user?.id]);

  if (!roomId) {
    return <div className="text-center py-20 font-bold">Game room not found.</div>;
  }

  if (!room) {
    return <div className="text-center py-20 italic">Finding the table...</div>;
  }

  const isMyTurn = room.currentTurn === user?.id;
  const opponent = room.players.find((player) => player.userId !== user?.id);
  const myIndex = room.players.findIndex((player) => player.userId === user?.id);
  const opponentIndex = room.players.findIndex((player) => player.userId !== user?.id);

  const myColorClass = myIndex === 0 ? 'bg-[#ef4444]' : 'bg-[#3b82f6]';
  const opponentColorClass = opponentIndex === 0 ? 'bg-[#ef4444]' : 'bg-[#3b82f6]';

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

  const copyInviteLink = async () => {
    const link = `${window.location.origin}/game/${roomId}`;
    await copyToClipboard(link, 'Invite link scratched to clipboard!');
  };

  return (
    <div className="max-w-4xl mx-auto flex flex-col md:flex-row gap-8">
      <div className="flex-1 space-y-6">
        <SketchyContainer className="bg-white">
          <div className="flex justify-between mb-4 px-2">
            <div
              className={cn(
                'flex flex-col p-2 rounded transform -rotate-1 transition-all',
                room.currentTurn === user?.id ? 'active-player-highlight' : 'opacity-50',
              )}
            >
              <span className="text-[10px] uppercase font-bold opacity-60 text-ink-black">You</span>
              <span className="font-bold flex items-center gap-2 text-lg text-ink-black">
                <div className={cn('w-4 h-4 rounded-full border-2 border-black', myColorClass)} />{' '}
                {userData?.username}
              </span>
              <div className="flex items-center gap-2 mt-1 font-mono text-[10px] font-bold text-ink-black">
                <span className="bg-black/5 px-2 py-0.5 rounded">ELO {userData?.elo || 1000}</span>
                {room.wager > 0 && (
                  <span className="bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded border border-yellow-300">
                    Wager: ${room.wager.toFixed(2)}
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-col items-center justify-center">
              {room.status === 'waiting' ? (
                <span className="animate-pulse text-xs font-bold uppercase py-1 px-3 bg-yellow-100 border border-yellow-300 rounded shadow-sm text-ink-black">
                  Waiting for P2...
                </span>
              ) : room.status === 'completed' ? (
                <span className="text-xl font-bold uppercase text-ink-red underline decoration-wavy decoration-2">
                  Match Over!
                </span>
              ) : (
                <span className="text-xs font-mono opacity-40 font-bold tracking-widest uppercase text-ink-black">
                  Live
                </span>
              )}
            </div>

            <div
              className={cn(
                'flex flex-col items-end p-2 rounded transform rotate-1 transition-all text-ink-black',
                opponent && room.currentTurn === opponent.userId ? 'active-player-highlight' : 'opacity-50',
              )}
            >
              <span className="text-[10px] uppercase font-bold opacity-60">Opponent</span>
              <span className="font-bold flex items-center gap-2 text-lg">
                {opponent?.username || 'Waiting...'}{' '}
                <div className={cn('w-4 h-4 rounded-full border-2 border-black', opponentColorClass)} />
              </span>
              {opponent ? (
                <div className="flex items-center gap-2 mt-1 font-mono text-[10px] font-bold">
                  {room.wager > 0 && (
                    <span className="bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded border border-yellow-300">
                      Wager: ${room.wager.toFixed(2)}
                    </span>
                  )}
                  <span className="bg-black/5 px-2 py-0.5 rounded">ELO {opponent.elo || 1000}</span>
                </div>
              ) : (
                <span className="font-mono text-[10px] opacity-40 mt-1 uppercase tracking-widest text-ink-black">
                  Awaiting rival...
                </span>
              )}
            </div>
          </div>

          <div className="relative group">
            <canvas
              aria-describedby="game-board-help"
              aria-label="Connect board. Use the mouse or number keys 1 through 7 to drop a disc."
              className="w-full h-auto cursor-pointer"
              height={480}
              onClick={handleBoardClick}
              onKeyDown={handleBoardKeyDown}
              ref={canvasRef}
              tabIndex={0}
              width={560}
            />
            {isMyTurn && !gameOver && (
              <div className="absolute top-0 left-0 w-full h-full pointer-events-none flex opacity-0 group-hover:opacity-100 transition-opacity">
                {BOARD_COLUMNS.map((column) => (
                  <div key={column} className="flex-1 hover:bg-black/5" />
                ))}
              </div>
            )}
          </div>

          <p className="sr-only" id="game-board-help">
            Use left and right arrow keys to choose a column, then press Enter or Space to drop a disc.
            Selected column {selectedColumn + 1}.
          </p>
          <p className="text-center mt-4 text-xs font-mono opacity-40">
            INVITE LINK: {window.location.origin}/game/{roomId}
          </p>
        </SketchyContainer>
      </div>

      <div className="w-full md:w-64 space-y-6">
        {room.status === 'waiting' && !opponent && (
          <div className="sticky-note p-6 rough-border animate-bounce-subtle">
            <div className="tape"></div>
            <h3 className="font-bold text-lg mb-2 uppercase tracking-tighter">Invite Rival</h3>
            <p className="text-xs mb-4 opacity-70 italic">Link is ready for the ink. Send it to a friend!</p>
            <SketchyButton className="w-full text-xs py-2 bg-white" onClick={() => void copyInviteLink()}>
              Copy Draft Link
            </SketchyButton>
          </div>
        )}

        {room.wager > 0 && (
          <div className="rough-border bg-ink-blue text-white p-6 relative shadow-xl overflow-hidden">
            <div className="absolute top-0 right-0 p-1 opacity-20">
              <Medal size={48} />
            </div>
            <p className="text-[10px] uppercase font-bold tracking-widest opacity-60 mb-1">Total Room Pot</p>
            <h3 className="text-4xl font-bold tracking-tighter italic">
              ${room.projectedWinnerAmount.toFixed(2)}
            </h3>
            <p className="text-[10px] italic mt-2 opacity-60">
              * {Math.round(room.commissionRate * 100)}% Merchant Commission Applied
            </p>
          </div>
        )}

        <SketchyContainer fill="#fff9c4">
          <h2 className="text-xl font-bold flex items-center gap-2 mb-4">
            <Trophy size={18} /> Match Log
          </h2>
          <div className="space-y-2 h-48 overflow-y-auto font-mono text-xs">
            {room.moves.length === 0 && <p className="opacity-40 italic">Waiting for first strike...</p>}
            {room.moves.map((move, index) => (
              <div key={`${move.userId}-${move.col}-${move.row}-${index}`} className="border-b border-black/5 flex justify-between py-1">
                <span>Move {index + 1}</span>
                <span className="font-bold">
                  {move.userId === user?.id ? 'You' : 'Opp'} dropped @ col {move.col + 1}
                </span>
              </div>
            ))}
          </div>
        </SketchyContainer>

        <SketchyButton activeColor="#fee2e2" className="w-full" onClick={() => navigate('/')}>
          Resign Match
        </SketchyButton>

        {gameOver && (
          <SketchyContainer fill="#dcfce7" roughness={2}>
            <h3 className="font-bold text-center text-xl mb-4 uppercase">Verdict</h3>
            <p className="text-center font-bold mb-4">
              {gameOver.winnerId === 'draw'
                ? 'Match is a DRAW!'
                : gameOver.winnerId === user?.id
                  ? 'You are VICTORIOUS!'
                  : 'You were DEFEATED.'}
            </p>
            <SketchyButton className="w-full" onClick={() => navigate('/')}>
              Return to Lobby
            </SketchyButton>
          </SketchyContainer>
        )}
      </div>
    </div>
  );
};

export default GamePage;
