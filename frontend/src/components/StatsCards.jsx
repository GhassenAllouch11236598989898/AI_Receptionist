import { MessageSquare, CalendarCheck, Zap, Activity } from 'lucide-react';

export default function StatsCards({ bookingsCount = 0, messageCount = 1, isLive = true }) {
  const stats = [
    {
      name: 'Conversations & Queries',
      value: messageCount,
      change: 'Real-time',
      icon: MessageSquare,
      color: 'text-indigo-400',
      bg: 'bg-indigo-500/10',
      border: 'border-indigo-500/20',
    },
    {
      name: 'Appointments Booked',
      value: bookingsCount,
      change: 'Confirmed',
      icon: CalendarCheck,
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/10',
      border: 'border-emerald-500/20',
    },
    {
      name: 'AI Brain Engine',
      value: 'Google Gemini',
      change: 'Dual Fallback Ready',
      icon: Zap,
      color: 'text-amber-400',
      bg: 'bg-amber-500/10',
      border: 'border-amber-500/20',
    },
    {
      name: 'Voice & Speech Pipeline',
      value: 'ElevenLabs',
      change: 'Streaming Flash v2.5',
      icon: Activity,
      color: 'text-purple-400',
      bg: 'bg-purple-500/10',
      border: 'border-purple-500/20',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((stat, idx) => {
        const Icon = stat.icon;
        return (
          <div
            key={idx}
            className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 shadow-sm hover:border-slate-700 transition-all"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400">{stat.name}</span>
              <div className={`p-2 rounded-lg ${stat.bg} ${stat.color} border ${stat.border}`}>
                <Icon className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-white tracking-tight">{stat.value}</span>
              <span className="text-xs font-medium text-slate-400">{stat.change}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
