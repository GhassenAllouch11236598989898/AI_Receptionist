import { useState, useCallback, useEffect } from 'react';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import RealtimeCallsView from './components/RealtimeCallsView';
import BookingsList from './components/BookingsList';
import VoiceTester from './components/VoiceTester';
import LiveVoiceCallModal from './components/LiveVoiceCallModal';
import { fetchBookings } from './api';
import './App.css';

export default function App() {
  const [activeTab, setActiveTab] = useState('realtime-calls');
  const [bookings, setBookings] = useState([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [isCallModalOpen, setIsCallModalOpen] = useState(false);

  // Sync real confirmed bookings from backend
  const syncBookings = useCallback(async () => {
    try {
      const data = await fetchBookings(100, 0);
      if (Array.isArray(data)) {
        setBookings(data);
      }
    } catch {
      // Graceful fallback
    }
  }, []);

  useEffect(() => {
    syncBookings();
  }, [syncBookings, refreshKey]);

  const handleGlobalRefresh = () => {
    setRefreshKey((prev) => prev + 1);
    syncBookings();
  };

  const handleNewBooking = () => {
    setRefreshKey((prev) => prev + 1);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col antialiased selection:bg-teal-500/20 selection:text-teal-900">
      {/* Top Navbar Header */}
      <Header
        onRefresh={handleGlobalRefresh}
        onStartCall={() => setIsCallModalOpen(true)}
      />

      {/* Main Workspace with Left Sidebar */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar matching screenshot */}
        <Sidebar
          activeTab={activeTab}
          onTabChange={setActiveTab}
          bookingsCount={bookings.length}
        />

        {/* Main Content Pane with soft mint gradient mesh */}
        <main className="flex-1 overflow-y-auto bg-gradient-to-br from-[#EBF7F5] via-[#F4FBF9] to-white p-5 lg:p-7">
          <div className="max-w-7xl mx-auto">
            {activeTab === 'realtime-calls' && (
              <RealtimeCallsView
                bookings={bookings}
                onBookingCreated={handleNewBooking}
                onStartLiveCall={() => setIsCallModalOpen(true)}
              />
            )}

            {activeTab === 'reservations' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h1 className="text-xl font-bold text-slate-800 tracking-tight">
                    All Reservations ({bookings.length})
                  </h1>
                  <button
                    onClick={() => setActiveTab('realtime-calls')}
                    className="text-xs font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 px-3 py-1.5 rounded-lg transition"
                  >
                    ← Back to Real-time Calls
                  </button>
                </div>
                <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs">
                  <BookingsList refreshTrigger={refreshKey} />
                </div>
              </div>
            )}

            {activeTab === 'configuration' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h1 className="text-xl font-bold text-slate-800 tracking-tight">
                    Voice Synthesizer Studio &amp; Configuration
                  </h1>
                  <button
                    onClick={() => setActiveTab('realtime-calls')}
                    className="text-xs font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 px-3 py-1.5 rounded-lg transition"
                  >
                    ← Back to Real-time Calls
                  </button>
                </div>
                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs max-w-2xl">
                  <VoiceTester />
                </div>
              </div>
            )}

            {(activeTab === 'dashboard' || activeTab === 'customers' || activeTab === 'analytics') && (
              <div className="space-y-4">
                <h1 className="text-xl font-bold text-slate-800 tracking-tight capitalize">
                  {activeTab} Overview
                </h1>
                <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-3 shadow-2xs">
                  <p className="text-slate-600 text-sm">
                    Active call logs and conversational appointment scheduling are monitored live under{' '}
                    <button
                      onClick={() => setActiveTab('realtime-calls')}
                      className="text-teal-600 font-semibold underline hover:text-teal-700"
                    >
                      Real-time Calls
                    </button>
                    .
                  </p>
                  <p className="text-xs text-slate-400">
                    Total Confirmed Appointments in System: <span className="font-bold text-slate-700">{bookings.length}</span>
                  </p>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Live Phone Call Handset Mode Modal */}
      <LiveVoiceCallModal
        isOpen={isCallModalOpen}
        onClose={() => setIsCallModalOpen(false)}
        onBookingCreated={handleNewBooking}
      />
    </div>
  );
}
