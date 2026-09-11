import { useState, useEffect } from 'react';
import { Search, Settings, Bell, Phone, CheckCircle2, RefreshCw } from 'lucide-react';
import { MiaRibbonLogo, UserAvatarIcon } from './MiaLogo';
import { fetchHealth } from '../api';

export default function Header({ onRefresh, onStartCall }) {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(false);

  const checkStatus = async () => {
    setLoading(true);
    try {
      const data = await fetchHealth();
      setHealth(data);
    } catch (err) {
      setHealth({ status: 'offline', error: err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkStatus();
    const interval = setInterval(checkStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const isHealthy = health?.status === 'ok' || health?.status === 'healthy' || health?.status === 'degraded';

  return (
    <header className="bg-white border-b border-slate-200/90 sticky top-0 z-30 shadow-2xs">
      {/* Top thin teal accent bar matching screenshot */}
      <div className="h-1 bg-gradient-to-r from-teal-400 via-cyan-500 to-sky-500 w-full" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
        {/* Left: Brand Logo & Title */}
        <div className="flex items-center gap-2.5">
          <MiaRibbonLogo className="w-8 h-8" />
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-slate-900 tracking-tight">Mia AI</span>
            <span className="text-[11px] font-semibold text-teal-700 bg-teal-50 px-2 py-0.5 rounded-md border border-teal-200/60 hidden sm:inline">
              Receptionist OS
            </span>
          </div>
        </div>

        {/* Right: Actions, Notifications & Profile matching screenshot */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Quick Voice Call Button */}
          <button
            onClick={onStartCall}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-teal-600 hover:bg-teal-500 text-white shadow-xs shadow-teal-600/30 transition active:scale-95 cursor-pointer"
            title="Start live handset phone call with Mia"
          >
            <Phone className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Live Call</span>
          </button>

          {/* Search Icon */}
          <button
            onClick={() => {
              checkStatus();
              if (onRefresh) onRefresh();
            }}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition cursor-pointer"
            title="Refresh system status"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-teal-600' : ''}`} />
          </button>

          {/* Settings Icon */}
          <a
            href="/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition cursor-pointer"
            title="API Configuration"
          >
            <Settings className="w-4 h-4" />
          </a>

          {/* Notification Bell with Badge '3' matching screenshot */}
          <div className="relative">
            <button
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition cursor-pointer"
              title="Notifications"
            >
              <Bell className="w-4 h-4" />
            </button>
            <span className="absolute 0 top-0.5 right-0.5 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center ring-2 ring-white">
              3
            </span>
          </div>

          {/* User Profile Avatar matching screenshot */}
          <div className="ml-1 pl-2 border-l border-slate-200">
            <div className="w-8 h-8 rounded-full ring-2 ring-teal-500/30 overflow-hidden bg-gradient-to-tr from-amber-200 to-rose-200 flex items-center justify-center cursor-pointer shadow-xs">
              <span className="text-xs font-bold text-amber-900">AM</span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
