import { useState, useEffect, useMemo } from 'react';
import {
  Calendar,
  Search,
  RefreshCw,
  Phone,
  User,
  Clock,
  Briefcase,
  FileText,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { fetchBookings } from '../api';

export default function BookingsList({ refreshTrigger }) {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [selectedBooking, setSelectedBooking] = useState(null);

  const loadBookings = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchBookings(50, 0);
      setBookings(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || 'Failed to load bookings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBookings();
  }, [refreshTrigger]);

  const filteredBookings = useMemo(() => {
    if (!search.trim()) return bookings;
    const q = search.toLowerCase();
    return bookings.filter(
      (b) =>
        (b.customer_name && b.customer_name.toLowerCase().includes(q)) ||
        (b.caller_phone && b.caller_phone.toLowerCase().includes(q)) ||
        (b.service_type && b.service_type.toLowerCase().includes(q)) ||
        (b.notes && b.notes.toLowerCase().includes(q))
    );
  }, [bookings, search]);

  const formatDate = (isoString) => {
    if (!isoString) return 'N/A';
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-2xl shadow-sm flex flex-col h-full overflow-hidden">
      {/* Header bar */}
      <div className="p-4 sm:p-5 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/40">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <Calendar className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-white">Confirmed Appointments</h2>
            <p className="text-xs text-slate-400">
              Live schedule synchronized with database
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Search bar */}
          <div className="relative flex-1 sm:w-60">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search appointments..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg bg-slate-800/80 border border-slate-700/80 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>

          <button
            onClick={loadBookings}
            disabled={loading}
            className="p-2 rounded-lg text-slate-400 hover:text-white bg-slate-800/80 hover:bg-slate-700 border border-slate-700/60 transition-all active:scale-95 disabled:opacity-50"
            title="Refresh bookings"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* Content body */}
      <div className="flex-1 overflow-y-auto min-h-[250px] p-4">
        {loading && bookings.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-slate-400 gap-2">
            <RefreshCw className="w-6 h-6 animate-spin text-emerald-400" />
            <span className="text-sm">Fetching appointments...</span>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-48 text-center p-4">
            <div className="p-3 rounded-full bg-red-500/10 text-red-400 border border-red-500/20 mb-2">
              <AlertCircle className="w-6 h-6" />
            </div>
            <p className="text-sm font-medium text-slate-300">Could not retrieve bookings</p>
            <p className="text-xs text-slate-500 mt-1 max-w-sm">{error}</p>
            <button
              onClick={loadBookings}
              className="mt-3 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
            >
              Try Again
            </button>
          </div>
        ) : filteredBookings.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center p-4">
            <div className="p-3 rounded-full bg-slate-800/60 text-slate-500 border border-slate-700/60 mb-2">
              <Calendar className="w-6 h-6" />
            </div>
            <p className="text-sm font-medium text-slate-300">
              {search ? 'No matching appointments found' : 'No appointments scheduled yet'}
            </p>
            <p className="text-xs text-slate-500 mt-1 max-w-xs">
              {search
                ? 'Try adjusting your search query.'
                : 'Bookings made via phone calls or chat will automatically appear here.'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredBookings.map((item, index) => {
              const isExpanded = selectedBooking === (item.id || index);
              return (
                <div
                  key={item.id || index}
                  onClick={() => setSelectedBooking(isExpanded ? null : (item.id || index))}
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                    isExpanded
                      ? 'bg-slate-800/80 border-indigo-500/50 shadow-md'
                      : 'bg-slate-800/40 hover:bg-slate-800/60 border-slate-800/80'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 mt-0.5">
                        <CheckCircle2 className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-white">
                            {item.customer_name || 'Anonymous Caller'}
                          </span>
                          <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            {item.status || 'confirmed'}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-xs text-slate-400">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5 text-indigo-400" />
                            {formatDate(item.booking_time)}
                          </span>
                          <span className="flex items-center gap-1">
                            <Briefcase className="w-3.5 h-3.5 text-amber-400" />
                            {item.service_type || 'General Consultation'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="text-slate-400 hover:text-white">
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t border-slate-700/60 text-xs text-slate-300 grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div className="flex items-center gap-1.5 text-slate-400">
                        <Phone className="w-3.5 h-3.5 text-indigo-400" />
                        <span>Phone:</span>
                        <span className="text-slate-200 font-mono">{item.caller_phone || 'None recorded'}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-slate-400">
                        <User className="w-3.5 h-3.5 text-indigo-400" />
                        <span>Booking ID:</span>
                        <span className="text-slate-200 font-mono text-[11px] truncate">{item.id || 'N/A'}</span>
                      </div>
                      {item.notes && (
                        <div className="sm:col-span-2 flex items-start gap-1.5 text-slate-400 mt-1">
                          <FileText className="w-3.5 h-3.5 text-slate-400 mt-0.5" />
                          <span>Notes:</span>
                          <span className="text-slate-200 italic">{item.notes}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer stats */}
      <div className="p-3 bg-slate-900/80 border-t border-slate-800 text-xs text-slate-400 flex items-center justify-between">
        <span>
          Showing <strong className="text-white">{filteredBookings.length}</strong> of{' '}
          <strong className="text-white">{bookings.length}</strong> bookings
        </span>
        <span className="text-emerald-400 flex items-center gap-1 text-[11px]">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
          Auto-synchronized
        </span>
      </div>
    </div>
  );
}
