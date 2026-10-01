import { useNavigate, useRouteError } from 'react-router-dom';
import { Button } from '@/ui/Button';
import { Icon } from '@/ui/Icon';

/**
 * Shown for an unknown address and for anything the router throws. An
 * unreadable label is the common case, so the copy speaks to that rather
 * than to a developer.
 */
export function NotFoundPage() {
  const navigate = useNavigate();
  const error = useRouteError();

  if (import.meta.env.DEV && error) {
    console.error('Route error:', error);
  }

  return (
    <div className="px-6 py-16 text-center">
      <Icon name="qr_code_scanner" size={40} className="text-ink-muted" />
      <h1 className="mt-4 text-[24px] font-semibold leading-[30px] text-ink-strong">
        That label does not match any equipment
      </h1>
      <p className="mx-auto mt-2 max-w-[320px] text-[15px] leading-[23px] text-ink-muted">
        Check that you scanned the whole code. If the label is damaged, the asset ID printed underneath it can
        be searched from the lab board.
      </p>
      <div className="mt-6 flex justify-center gap-3">
        <Button intent="secondary" onClick={() => navigate(-1)}>
          Go back
        </Button>
        <Button intent="primary" icon="login" onClick={() => navigate('/login')}>
          Staff sign in
        </Button>
      </div>
    </div>
  );
}
