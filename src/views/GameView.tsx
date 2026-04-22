import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';
import rough from 'roughjs';
import canvasConfetti from 'canvas-confetti';
import request from '../lib/api/apiClient';
import { useAuth } from '../lib/AuthContext';
import { SketchyContainer } from '../components/SketchyContainer';
import { useToast } from '../lib/ToastContext';
import { SketchyButton } from '../components/SketchyButton';
import { User, Trophy, Medal } from 'lucide-react';
import { cn } from '../lib/utils';

const GameView: React.FC = () => {
  const { roomId } = useParams();
  const { user, userData, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [room, setRoom] = useState<any>(null);
  const [gameOver, setGameOver] = useState<any>(null);
  const { success, info, warning } = useToast();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!user || !userData) return;

    // Connect to Socket.io server
    const s = io(window.location.origin);
    setSocket(s);

    const token = localStorage.getItem('token');
    s.emit("join-room", {
      roomId,
      userId: user.uid,
      username: userData.username,
      elo: userData.elo,
      wager: 0, // In real app, fetch initial room state first
      isPrivate: false,
      token
    });

    s.on('error', (msg: string) => {
      warning(msg);
      navigate('/');
    });

    s.on("room-sync", (roomData: any) => {
      setRoom(roomData);
      if (roomData.status === 'completed' && roomData.winnerId) {
        setGameOver({ winnerId: roomData.winnerId });
      }
    });

    s.on("game-started", (roomData: any) => {
      setRoom(roomData);
    });

    s.on("move-made", (roomData: any) => {
      setRoom(roomData);
    });

    s.on("game-over", async ({ room: roomData, winnerId, winningLine }: any) => {
      setRoom(roomData);
      setGameOver({ winnerId, winningLine });

      if (winnerId === user.uid) {
        // Trigger confetti
        const duration = 3000;
        const end = Date.now() + duration;

        const frame = () => {
          canvasConfetti({
            particleCount: 5,
            angle: 60,
            spread: 55,
            origin: { x: 0 },
            colors: ['#ef4444', '#3b82f6', '#fef08a']
          });
          canvasConfetti({
            particleCount: 5,
            angle: 120,
            spread: 55,
            origin: { x: 1 },
            colors: ['#ef4444', '#3b82f6', '#fef08a']
          });

          if (Date.now() < end) {
            requestAnimationFrame(frame);
          }
        };
        frame();
      }

      // If we are the winner, or it's a draw, we refresh the user data to get updated balance/elo
      if (winnerId === user.uid || winnerId === 'draw') {
         await refreshUser();
      }
    });

    return () => {
      s.disconnect();
    };
  }, [roomId, user, userData]);

  useEffect(() => {
    if (canvasRef.current && room?.board) {
      drawBoard();
    }
  }, [room, gameOver]);

  const drawBoard = () => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const rc = rough.canvas(canvas);

    const cellWidth = canvas.width / 7;
    const cellHeight = canvas.height / 6;

    // Draw Grid
    for (let r = 0; r <= 6; r++) {
      rc.line(0, r * cellHeight, canvas.width, r * cellHeight, { stroke: '#4338ca', strokeWidth: 1.5, roughness: 1.2 });
    }
    for (let c = 0; c <= 7; c++) {
      rc.line(c * cellWidth, 0, c * cellWidth, canvas.height, { stroke: '#4338ca', strokeWidth: 1.5, roughness: 1.2 });
    }

    // Draw Discs
    room.board.forEach((row: any[], r: number) => {
      row.forEach((cell, c: number) => {
        if (cell) {
          const centerX = c * cellWidth + cellWidth / 2;
          const centerY = r * cellHeight + cellHeight / 2;
          const radius = Math.min(cellWidth, cellHeight) * 0.35;
          
          rc.circle(centerX, centerY, radius * 2, {
            stroke: cell === 'R' ? '#ef4444' : '#3b82f6',
            fill: cell === 'R' ? '#ef4444' : '#3b82f6',
            fillStyle: 'cross-hatch',
            roughness: 2,
            hachureGap: 3
          });
        }
      });
    });

    // Draw Winning Highlighter
    if (gameOver?.winningLine) {
      gameOver.winningLine.forEach(([r, c]: [number, number]) => {
        const centerX = c * cellWidth + cellWidth / 2;
        const centerY = r * cellHeight + cellHeight / 2;
        rc.rectangle(c * cellWidth + 5, r * cellHeight + 5, cellWidth - 10, cellHeight - 10, {
          fill: 'rgba(255, 235, 59, 0.4)',
          fillStyle: 'solid',
          stroke: 'transparent',
          roughness: 3
        });
      });
    }
  };

  const handleMove = (col: number) => {
    if (socket && room?.status === 'active' && room?.currentTurn === user?.uid) {
      socket.emit('make-move', { roomId, col, userId: user?.uid });
    }
  };

  const copyInviteLink = () => {
    const link = `${window.location.origin}/game/${roomId}`;
    navigator.clipboard.writeText(link);
    success('Invite link scratched to clipboard!');
  };

  if (!room) return <div className="text-center py-20 italic">Finding the table...</div>;

  const isMyTurn = room.currentTurn === user?.uid;
  const opponent = room.players.find((p: any) => p.userId !== user?.uid);
  const myIndex = room.players.findIndex((p: any) => p.userId === user?.uid);
  const oppIndex = room.players.findIndex((p: any) => p.userId !== user?.uid);
  
  const myColorClass = myIndex === 0 ? "bg-[#ef4444]" : "bg-[#3b82f6]";
  const oppColorClass = oppIndex === 0 ? "bg-[#ef4444]" : "bg-[#3b82f6]";

  return (
    <div className="max-w-4xl mx-auto flex flex-col md:flex-row gap-8">
      {/* Left: Game Board */}
      <div className="flex-1 space-y-6">
        <SketchyContainer className="bg-white">
          <div className="flex justify-between mb-4 px-2">
            <div className={cn(
              "flex flex-col p-2 rounded transform -rotate-1 transition-all",
              room.currentTurn === user?.uid ? "active-player-highlight" : "opacity-50"
            )}>
              <span className="text-[10px] uppercase font-bold opacity-60 text-ink-black">You</span>
              <span className="font-bold flex items-center gap-2 text-lg text-ink-black">
                <div className={cn("w-4 h-4 rounded-full border-2 border-black", myColorClass)} /> {userData?.username}
              </span>
              <div className="flex items-center gap-2 mt-1 font-mono text-[10px] font-bold text-ink-black">
                <span className="bg-black/5 px-2 py-0.5 rounded">ELO {userData?.elo || 1000}</span>
                {room.wager > 0 && <span className="bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded border border-yellow-300">Wager: ${room.wager.toFixed(2)}</span>}
              </div>
            </div>
            
            <div className="flex flex-col items-center justify-center">
               {room.status === 'waiting' ? (
                 <span className="animate-pulse text-xs font-bold uppercase py-1 px-3 bg-yellow-100 border border-yellow-300 rounded shadow-sm text-ink-black">Waiting for P2...</span>
               ) : room.status === 'completed' ? (
                 <span className="text-xl font-bold uppercase text-ink-red underline decoration-wavy decoration-2">Match Over!</span>
               ) : (
                 <span className="text-xs font-mono opacity-40 font-bold tracking-widest uppercase text-ink-black">Live</span>
               )}
            </div>

            <div className={cn(
              "flex flex-col items-end p-2 rounded transform rotate-1 transition-all text-ink-black",
              opponent && room.currentTurn === opponent.userId ? "active-player-highlight" : "opacity-50"
            )}>
              <span className="text-[10px] uppercase font-bold opacity-60">Opponent</span>
              <span className="font-bold flex items-center gap-2 text-lg">
                 {opponent?.username || 'Waiting...'} <div className={cn("w-4 h-4 rounded-full border-2 border-black", oppColorClass)} />
              </span>
              {opponent ? (
                 <div className="flex items-center gap-2 mt-1 font-mono text-[10px] font-bold">
                    {room.wager > 0 && <span className="bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded border border-yellow-300">Wager: ${room.wager.toFixed(2)}</span>}
                    <span className="bg-black/5 px-2 py-0.5 rounded">ELO {opponent.elo || 1000}</span>
                 </div>
              ) : (
                 <span className="font-mono text-[10px] opacity-40 mt-1 uppercase tracking-widest text-ink-black">Awaiting rival...</span>
              )}
            </div>
          </div>

          <div className="relative group">
            <canvas 
              ref={canvasRef} 
              width={560} 
              height={480} 
              className="w-full h-auto cursor-pointer"
              onClick={(e) => {
                const rect = canvasRef.current!.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const col = Math.floor(x / (rect.width / 7));
                handleMove(col);
              }}
            />
            {/* Hover Indicators for columns */}
            {isMyTurn && !gameOver && (
              <div className="absolute top-0 left-0 w-full h-full pointer-events-none flex opacity-0 group-hover:opacity-100 transition-opacity">
                {Array(7).fill(null).map((_, i) => (
                  <div key={i} className="flex-1 hover:bg-black/5" />
                ))}
              </div>
            )}
          </div>
          
          <p className="text-center mt-4 text-xs font-mono opacity-40">INVITE LINK: {window.location.origin}/game/{roomId}</p>
        </SketchyContainer>
      </div>

      {/* Right: Info & Controls */}
      <div className="w-full md:w-64 space-y-6">
        {room.status === 'waiting' && !opponent && (
          <div className="sticky-note p-6 rough-border animate-bounce-subtle">
            <div className="tape"></div>
            <h3 className="font-bold text-lg mb-2 uppercase tracking-tighter">Invite Rival</h3>
            <p className="text-xs mb-4 opacity-70 italic">Link is ready for the ink. Send it to a friend!</p>
            <SketchyButton onClick={copyInviteLink} className="w-full text-xs py-2 bg-white">
              Copy Draft Link
            </SketchyButton>
          </div>
        )}

        {room.wager > 0 && (
          <div className="rough-border bg-ink-blue text-white p-6 relative shadow-xl overflow-hidden">
             <div className="absolute top-0 right-0 p-1 opacity-20"><Medal size={48} /></div>
             <p className="text-[10px] uppercase font-bold tracking-widest opacity-60 mb-1">Total Room Pot</p>
             <h3 className="text-4xl font-bold tracking-tighter italic">${(room.wager * 2 * 0.9).toFixed(2)}</h3>
             <p className="text-[10px] italic mt-2 opacity-60">* 10% Merchant Commission Applied</p>
          </div>
        )}

        <SketchyContainer fill="#fff9c4">
          <h2 className="text-xl font-bold flex items-center gap-2 mb-4"><Trophy size={18} /> Match Log</h2>
          <div className="space-y-2 h-48 overflow-y-auto font-mono text-xs">
            {room.moves.length === 0 && <p className="opacity-40 italic">Waiting for first strike...</p>}
            {room.moves.map((move: any, i: number) => (
              <div key={i} className="border-b border-black/5 flex justify-between py-1">
                <span>Move {i+1}</span>
                <span className="font-bold">{move.userId === user?.uid ? 'You' : 'Opp'} dropped @ col {move.col + 1}</span>
              </div>
            ))}
          </div>
        </SketchyContainer>

        <SketchyButton 
          onClick={() => navigate('/')} 
          className="w-full"
          activeColor="#fee2e2"
        >
          Resign Match
        </SketchyButton>
        
        {gameOver && (
           <SketchyContainer fill="#dcfce7" roughness={2}>
              <h3 className="font-bold text-center text-xl mb-4 uppercase">Verdict</h3>
              <p className="text-center font-bold mb-4">
                {gameOver.winnerId === 'draw' ? "Match is a DRAW!" : 
                 gameOver.winnerId === user?.uid ? "You are VICTORIOUS!" : "You were DEFEATED."}
              </p>
              <SketchyButton onClick={() => navigate('/')} className="w-full">Return to Lobby</SketchyButton>
           </SketchyContainer>
        )}
      </div>
    </div>
  );
};

export default GameView;
