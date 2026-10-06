import React, { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { useAuth } from '../context/AuthContext';

const navItems = [
  { to: '/workflows', label: 'Workflows', icon: '⚙️' },
  { to: '/subscribers', label: 'Subscribers', icon: '👥' },
  { to: '/activity', label: 'Activity', icon: '📊' },
  { to: '/inbox', label: 'Inbox', icon: '📥' },
];

const Layout: React.FC = () => {
  const { user, environmentId, environments, setEnvironmentId, signout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [envOpen, setEnvOpen] = useState(false);

  const currentEnv = environments.find((e) => e.id === environmentId) || environments[0];

  return (
    <div className="min-h-screen flex bg-slate-50">
      <aside className="w-64 shrink-0 border-r border-slate-200 bg-white flex flex-col">
        <div className="h-16 flex items-center px-6 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold">CN</div>
            <span className="font-semibold text-slate-900">Campus NE</span>
          </div>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive ? 'bg-indigo-50 text-indigo-700' : 'text-slate-700 hover:bg-slate-100',
                )
              }
            >
              <span aria-hidden="true" className="text-base leading-none">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-4 border-t border-slate-200 text-xs text-slate-500">
          © Campus Notification Engine
        </div>
      </aside>
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 border-b border-slate-200 bg-white sticky top-0 z-10 flex items-center px-6 gap-4">
          <div className="flex-1" />
          <div className="relative">
            <button
              type="button"
              onClick={() => setEnvOpen((v) => !v)}
              className="btn-secondary !px-3 !py-1.5 flex items-center gap-2"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="text-sm font-medium">{currentEnv?.name ?? 'Environment'}</span>
              <span className="text-slate-400">▾</span>
            </button>
            {envOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setEnvOpen(false)} />
                <div className="absolute right-0 mt-2 w-56 rounded-lg shadow-lg border border-slate-200 bg-white p-1 z-20">
                  {environments.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-slate-500">No environments loaded</div>
                  ) : (
                    environments.map((env) => (
                      <button
                        key={env.id}
                        type="button"
                        onClick={() => {
                          setEnvironmentId(env.id);
                          setEnvOpen(false);
                        }}
                        className={clsx(
                          'w-full text-left px-3 py-2 rounded-md text-sm',
                          env.id === environmentId ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-slate-700 hover:bg-slate-50',
                        )}
                      >
                        {env.name}
                      </button>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="flex items-center gap-2 rounded-lg px-3 py-1.5 hover:bg-slate-100"
            >
              <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-sm font-semibold">
                {(user?.firstName?.[0] ?? user?.email?.[0] ?? 'U').toUpperCase()}
              </div>
              <div className="text-left hidden sm:block">
                <div className="text-sm font-medium text-slate-900 leading-tight">
                  {user?.firstName || user?.lastName ? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() : user?.email}
                </div>
                <div className="text-xs text-slate-500 leading-tight">{user?.email}</div>
              </div>
              <span className="text-slate-400">▾</span>
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 mt-2 w-52 rounded-lg shadow-lg border border-slate-200 bg-white p-1 z-20">
                  <button
                    type="button"
                    onClick={() => {
                      signout();
                      setMenuOpen(false);
                      navigate('/signin', { replace: true });
                    }}
                    className="w-full text-left px-3 py-2 rounded-md text-sm text-rose-600 hover:bg-rose-50"
                  >
                    Sign out
                  </button>
                </div>
              </>
            )}
          </div>
        </header>
        <main className="flex-1 p-6 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default Layout;
