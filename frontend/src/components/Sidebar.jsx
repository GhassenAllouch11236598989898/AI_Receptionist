import {
  LayoutDashboard,
  PhoneCall,
  CalendarCheck,
  Users,
  Sliders,
  TrendingUp,
  FileCode,
  ExternalLink,
} from 'lucide-react';

export default function Sidebar({ activeTab, onTabChange, bookingsCount = 0 }) {
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'realtime-calls', label: 'Real-time Calls', icon: PhoneCall },
    { id: 'reservations', label: 'Reservations', icon: CalendarCheck, count: bookingsCount },
    { id: 'customers', label: 'Customers', icon: Users },
    { id: 'configuration', label: 'Configuration', icon: Sliders },
    { id: 'analytics', label: 'Analytics', icon: TrendingUp },
  ];

  return (
    <aside className="w-56 bg-white border-r border-slate-200/80 flex flex-col justify-between shrink-0 select-none">
      {/* Nav List */}
      <div className="p-3.5 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-[13px] font-medium transition-all duration-150 cursor-pointer ${
                isActive
                  ? 'bg-teal-50/90 text-teal-800 font-semibold border border-teal-200/70 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center gap-3">
                <Icon
                  className={`w-4 h-4 ${
                    isActive ? 'text-teal-600' : 'text-slate-400 group-hover:text-slate-600'
                  }`}
                />
                <span>{item.label}</span>
              </div>
              {item.count !== undefined && item.count > 0 && (
                <span
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                    isActive ? 'bg-teal-200 text-teal-900' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {item.count}
                </span>
              )}
            </button>
          );
        })}

        {/* External API Docs Link */}
        <a
          href="/docs"
          target="_blank"
          rel="noopener noreferrer"
          className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-[13px] font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-all duration-150 cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <FileCode className="w-4 h-4 text-slate-400" />
            <span>API Docs</span>
          </div>
          <ExternalLink className="w-3 h-3 text-slate-400 opacity-60" />
        </a>
      </div>

      {/* Bottom decorative wave line illustration matching design */}
      <div className="p-4 pt-0">
        <svg viewBox="0 0 160 40" className="w-full text-teal-300/70" fill="none">
          <path
            d="M 5 20 C 40 5, 60 35, 95 20 C 120 10, 140 25, 155 18"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <circle cx="95" cy="20" r="3.5" fill="#0D9488" />
          <circle cx="35" cy="14" r="2.5" fill="#14B8A6" />
        </svg>
      </div>
    </aside>
  );
}
