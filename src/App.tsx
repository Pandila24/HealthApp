import { useEffect, useState } from 'react';
import Today from './pages/Today';
import FoodPage from './pages/Food';
import Train from './pages/Train';
import RunPage from './pages/Run';
import SettingsPage from './pages/Settings';
import PlanPage from './pages/Plan';

const TABS = [
  { id: 'today', label: 'Today', icon: '◎' },
  { id: 'food', label: 'Food', icon: '🍽' },
  { id: 'plan', label: 'Plan', icon: '📋' },
  { id: 'train', label: 'Train', icon: '🏋' },
  { id: 'run', label: 'Run', icon: '🏃' },
  { id: 'settings', label: 'Me', icon: '⚙' },
] as const;
export type Tab = (typeof TABS)[number]['id'];

const fromHash = (): Tab => {
  const h = location.hash.slice(1);
  return (TABS.find((t) => t.id === h)?.id ?? 'today') as Tab;
};

export default function App() {
  const [tab, setTab] = useState<Tab>(fromHash);
  useEffect(() => {
    const on = () => setTab(fromHash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const go = (t: Tab) => {
    location.hash = t;
    window.scrollTo(0, 0);
  };

  return (
    <div className="app">
      <main>
        {tab === 'today' && <Today go={go} />}
        {tab === 'food' && <FoodPage />}
        {tab === 'plan' && <PlanPage go={go} />}
        {tab === 'train' && <Train />}
        {tab === 'run' && <RunPage />}
        {tab === 'settings' && <SettingsPage />}
      </main>
      <nav className="tabbar">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => go(t.id)}>
            <span className="tab-icon" aria-hidden>
              {t.icon}
            </span>
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
