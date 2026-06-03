import { useNavigate } from 'react-router-dom';
import { FileQuestion, Gamepad2, Home } from 'lucide-react';
import { useAuth } from '../app/AuthProvider';
import { SketchyButton } from '../components/SketchyButton';
import { StatePanel } from '../components/ui/StatePanel';

const NotFoundPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const targetPath = user ? '/play' : '/';

  return (
    <StatePanel
      actions={(
        <SketchyButton className="px-6 py-3 text-base" onClick={() => navigate(targetPath)} type="button" variant="primary">
          {user ? <Gamepad2 size={18} /> : <Home size={18} />}
          {user ? 'Return to lobby' : 'Return home'}
        </SketchyButton>
      )}
      eyebrow="Notebook error"
      icon={FileQuestion}
      title="404"
      tone="info"
    >
      This page was erased from the notebook.
    </StatePanel>
  );
};

export default NotFoundPage;
