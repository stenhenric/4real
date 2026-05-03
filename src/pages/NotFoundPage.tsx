import { useNavigate } from 'react-router-dom';
import { useAuth } from '../app/AuthProvider';
import { SketchyButton } from '../components/SketchyButton';
import { SketchyContainer } from '../components/SketchyContainer';

const NotFoundPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  return (
    <div className="max-w-2xl mx-auto mt-10">
      <SketchyContainer fill="#fff" roughness={1} className="text-center p-8">
        <p className="text-xs uppercase font-mono opacity-50 tracking-widest mb-2">Notebook Error</p>
        <h1 className="text-6xl font-bold italic tracking-tighter mb-4">404</h1>
        <p className="opacity-70 italic mb-8">This page was erased from the notebook.</p>
        <SketchyButton className="text-lg px-10" onClick={() => navigate(user ? '/play' : '/')}>
          {user ? 'Return to Lobby' : 'Return to Homepage'}
        </SketchyButton>
      </SketchyContainer>
    </div>
  );
};

export default NotFoundPage;
