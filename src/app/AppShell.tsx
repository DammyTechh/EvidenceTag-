import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Brandmark } from '@/ui/Brandmark';
import { SyncState } from '@/ui/SyncState';
import { Icon } from '@/ui/Icon';
import { supabase } from '@/lib/supabase';
import { useNetwork } from './NetworkProvider';
import { useAuth, type AppRole } from './AuthProvider';

const NAV: Record<AppRole, { to: string; label: string; icon: string }[]> = {
  technician: [
    { to: '/staff', label: 'My equipment', icon: 'inventory_2' },
    { to: '/staff/equipment/new', label: 'Register', icon: 'add_circle' },
    { to: '/staff/labels', label: 'Labels', icon: 'qr_code_2' },
    { to: '/reports', label: 'Reports', icon: 'download' },
  ],
  lab_hod: [
    { to: '/staff', label: 'My equipment', icon: 'inventory_2' },
    { to: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
    { to: '/staff/equipment/new', label: 'Register', icon: 'add_circle' },
    { to: '/staff/labels', label: 'Labels', icon: 'qr_code_2' },
    { to: '/reports', label: 'Reports', icon: 'download' },
  ],
  senior_leader: [
    { to: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
    { to: '/reports', label: 'Reports', icon: 'download' },
  ],
  admin: [{ to: '/admin', label: 'Admin', icon: 'admin_panel_settings' }],
};

export function AppShell() {
  const { state, queued } = useNetwork();
  const { session, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  // Navigation only once the password is real; the forced change comes first.
  const showNav = Boolean(session && profile && !profile.must_change_password);
  const links = showNav && profile ? [...NAV[profile.role], { to: '/notifications', label: 'Alerts', icon: 'notifications' }] : [];

  const { data: unread = 0 } = useQuery({
    queryKey: ['alerts-unread', location.pathname],
    enabled: showNav,
    queryFn: async () => {
      const { count } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .is('read_at', null);
      return count ?? 0;
    },
  });

  async function onSignOut() {
    await signOut();
    // The next person on this device must not see the last person's data.
    queryClient.clear();
    navigate('/login', { replace: true });
  }

  return (
    <div className="flex min-h-screen flex-col bg-surface-page print:bg-surface-raised">
      <header className="sticky top-0 z-20 border-b border-line-subtle bg-surface-raised print:hidden">
        <div className="mx-auto flex h-[56px] w-full max-w-[80rem] items-center gap-3 px-4 sm:px-6">
          <NavLink to="/" aria-label="Home" className="flex items-center">
            <Brandmark height={26} />
          </NavLink>

          <nav aria-label="Main" className="ml-4 hidden items-center gap-1 md:flex">
            {links.map((link) => (
              <NavItem key={link.to} {...link} badge={link.to === '/notifications' ? unread : 0} />
            ))}
          </nav>

          <div className="flex-1" />
          {session ? <SyncState state={state} queued={queued} /> : null}
          {session ? (
            <button
              type="button"
              onClick={onSignOut}
              className="inline-flex min-h-touch items-center gap-2 rounded-md px-3 text-[14px] font-semibold text-ink-muted hover:bg-surface-sunken"
            >
              <Icon name="logout" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          ) : null}
        </div>

        {links.length > 0 ? (
          <nav
            aria-label="Main"
            className="flex gap-1 overflow-x-auto border-t border-line-subtle px-2 md:hidden"
          >
            {links.map((link) => (
              <NavItem key={link.to} {...link} badge={link.to === '/notifications' ? unread : 0} />
            ))}
          </nav>
        ) : null}
      </header>

      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}

function NavItem({ to, label, icon, badge }: { to: string; label: string; icon: string; badge: number }) {
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) =>
        [
          'inline-flex min-h-touch shrink-0 items-center gap-2 rounded-md px-3 text-[14px] font-semibold no-underline',
          isActive ? 'bg-brand-surface text-brand' : 'text-ink hover:bg-surface-sunken',
        ].join(' ')
      }
    >
      <Icon name={icon} size={18} />
      {label}
      {badge > 0 ? (
        <span className="rounded-full bg-urgent-ink px-2 text-[12px] leading-5 text-ink-ondark">{badge}</span>
      ) : null}
    </NavLink>
  );
}
