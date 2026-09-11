import { useState, useRef, useEffect, useCallback } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  Phone,
  PhoneCall,
  Send,
  Smile,
  ExternalLink,
  Loader2,
  CalendarCheck,
  RotateCcw,
  Sparkles,
  MapPin,
  Mic,
} from 'lucide-react';
import { MiaAvatarIllustration } from './MiaLogo';
import { sendChat } from '../api';

export default function RealtimeCallsView({
  bookings = [],
  onBookingCreated,
  onStartLiveCall,
}) {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: "Hello! I'm Mia, your virtual receptionist. How can I help you schedule an appointment today?",
    },
  ]);

  const [history, setHistory] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeCallerPhone, setActiveCallerPhone] = useState('+1 416-555-1234');
  const [toolsExecuted, setToolsExecuted] = useState([]);
  const [selectedCallId, setSelectedCallId] = useState('#2214723-4422-455107452257');
  const [lastTranscription, setLastTranscription] = useState('Waiting for caller input...');
  const [lastMiaResponse, setLastMiaResponse] = useState(
    "Mia: Hello! I'm Mia, your virtual receptionist. How can I help you schedule an appointment today?"
  );

  const chatScrollRef = useRef(null);
  const inputRef = useRef(null);

  // Auto-scroll chat area
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  // Send message to real /chat backend
  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    setInput('');
    setLastTranscription(`...${text}`);
    setMessages((prev) => [...prev, { role: 'user', content: text }]);
    setLoading(true);

    try {
      const cleanPhone = activeCallerPhone ? activeCallerPhone.replace(/[^\d+]/g, '') : null;
      const result = await sendChat(text, cleanPhone, history);

      setHistory(result.updated_history || []);
      setLastMiaResponse(`Mia: ${result.reply}`);

      // Check if tool was executed
      const booked = result.tools_called?.some(
        (t) => t.name === 'book_appointment' && t.result?.status === 'confirmed'
      );
      if (booked) {
        setToolsExecuted((prev) => [...prev, 'book_appointment']);
        if (onBookingCreated) onBookingCreated();
      }

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: result.reply,
          isToolCall: result.tools_called?.length > 0,
        },
      ]);
    } catch (err) {
      console.error('Chat error:', err);
      const errMsg = err?.message?.includes('temporarily unavailable')
        ? 'Mia is temporarily unavailable. Please try again shortly.'
        : (err?.message || "I'm having trouble connecting right now. Please try again shortly.");
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: errMsg,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, activeCallerPhone, history, onBookingCreated]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleReset = () => {
    setMessages([
      {
        role: 'assistant',
        content: "Hello! I'm Mia, your virtual receptionist. How can I help you schedule an appointment today?",
      },
    ]);
    setHistory([]);
    setToolsExecuted([]);
    setLastTranscription('Waiting for caller input...');
    setLastMiaResponse(
      "Mia: Hello! I'm Mia, your virtual receptionist. How can I help you schedule an appointment today?"
    );
  };

  // Recent callers list
  const recentCallers = [
    {
      phone: '+1 416-555-1234',
      location: 'Canadian Location',
      flag: '🇨🇦',
      active: true,
    },
    {
      phone: '+1 416-555-8890',
      location: 'Canada',
      flag: '📍',
      active: false,
    },
    {
      phone: '+1 416-555-9012',
      location: 'Canadian Location',
      flag: '🇨🇦',
      active: false,
    },
  ];

  return (
    <div className="space-y-4">
      {/* SaaS Page Title */}
      <h1 className="text-xl font-bold text-slate-800 tracking-tight">
        AI Receptionist SaaS
      </h1>

      {/* Top 2 KPI Cards Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Card 1: AI Agent: Mia */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs">
          <p className="text-xs font-semibold text-slate-500 mb-1.5">AI Agent: Mia</p>
          <div className="flex items-center gap-1.5 text-emerald-600 text-xs font-semibold">
            <CheckCircle2 className="w-4 h-4 fill-emerald-100 text-emerald-600" />
            <span>All Systems Operational</span>
          </div>
        </div>

        {/* Card 2: Reservation Queue */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs">
          <p className="text-xs font-semibold text-slate-500 mb-1.5">Reservation Queue</p>
          <div className="flex items-center gap-2">
            <span className="px-3 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
              {bookings.length} Confirmed
            </span>
            <span className="px-3 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700 border border-red-200">
              0 Cancelled
            </span>
            <span className="px-3 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200">
              {bookings.length} Total
            </span>
          </div>
        </div>
      </div>

      {/* Main 3-Column Panels matching screenshot */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch h-[540px]">
        {/* Column 1: LIVE CALL STREAM LOGS (~3.5 cols) */}
        <div className="lg:col-span-4 bg-white border border-slate-200/90 rounded-2xl p-4 flex flex-col justify-between shadow-2xs">
          <div>
            <h2 className="text-[11px] font-bold text-slate-700 tracking-wider uppercase mb-3">
              1. LIVE CALL STREAM LOGS
            </h2>

            <div className="space-y-2">
              {recentCallers.map((caller, i) => {
                const isSelected = activeCallerPhone === caller.phone;
                return (
                  <div
                    key={i}
                    onClick={() => setActiveCallerPhone(caller.phone)}
                    className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                      isSelected
                        ? 'bg-emerald-50/80 border-emerald-200/80 text-slate-900 shadow-2xs'
                        : 'bg-slate-50/70 border-slate-200/70 hover:bg-slate-100/80 text-slate-700'
                    }`}
                  >
                    <div>
                      <p className="text-[10px] text-slate-400 font-medium">Caller</p>
                      <p className="text-xs font-bold tracking-tight">{caller.phone}</p>
                      <p className="text-[10px] text-slate-500 flex items-center gap-1 mt-0.5">
                        <span>{caller.flag}</span>
                        <span>{caller.location}</span>
                      </p>
                    </div>

                    {isSelected ? (
                      <div className="w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-xs">
                        <CheckCircle2 className="w-4 h-4" />
                      </div>
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-slate-200 text-slate-500 flex items-center justify-center">
                        <Phone className="w-3 h-3" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Bottom Illustration matching screenshot */}
          <div className="pt-4 flex flex-col items-center justify-center border-t border-slate-100">
            <div className="relative flex items-center justify-center">
              <MiaAvatarIllustration className="w-20 h-20" />
            </div>
            <button
              onClick={onStartLiveCall}
              className="mt-3 flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold bg-teal-50 text-teal-700 border border-teal-200 hover:bg-teal-100 transition cursor-pointer"
            >
              <PhoneCall className="w-3 h-3 text-teal-600" />
              <span>Simulate Voice Handset</span>
            </button>
          </div>
        </div>

        {/* Column 2: REAL-TIME CONVERSATION PLAYGROUND (~4.5 cols) */}
        <div className="lg:col-span-5 bg-white border border-slate-200/90 rounded-2xl flex flex-col justify-between shadow-2xs overflow-hidden">
          {/* Header */}
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-[11px] font-bold text-slate-700 tracking-wider uppercase">
              2. REAL-TIME CONVERSATION PLAYGROUND
            </h2>
            <button
              onClick={handleReset}
              className="text-slate-400 hover:text-slate-600 p-1 rounded-md transition"
              title="Reset conversation"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Chat Messages Feed */}
          <div
            ref={chatScrollRef}
            className="flex-1 p-4 overflow-y-auto space-y-3 text-xs"
          >
            {messages.map((msg, i) => {
              const isUser = msg.role === 'user';
              return (
                <div
                  key={i}
                  className={`flex items-start gap-2 ${
                    isUser ? 'justify-end' : 'justify-start'
                  }`}
                >
                  {!isUser && (
                    <div className="w-6 h-6 rounded-full overflow-hidden bg-teal-100 border border-teal-200 shrink-0 flex items-center justify-center mt-0.5">
                      <MiaAvatarIllustration className="w-6 h-6" />
                    </div>
                  )}

                  <div
                    className={`max-w-[80%] px-3.5 py-2 rounded-2xl shadow-2xs leading-relaxed ${
                      isUser
                        ? 'bg-teal-600 text-white rounded-tr-xs font-medium'
                        : 'bg-slate-100 text-slate-800 rounded-tl-xs'
                    }`}
                  >
                    {!isUser && (
                      <p className="text-[10px] font-bold text-slate-500 mb-0.5">
                        Agent: {msg.isToolCall ? 'Create Booking Tool Call' : ''}
                      </p>
                    )}
                    <p>{msg.content}</p>
                  </div>
                </div>
              );
            })}

            {loading && (
              <div className="flex items-center gap-2 text-slate-400 text-xs italic">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-teal-600" />
                <span>Mia is typing...</span>
              </div>
            )}
          </div>

          {/* Chat Input Bar matching screenshot */}
          <div className="p-3 border-t border-slate-100 bg-white">
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-full px-3 py-1.5 focus-within:border-teal-500 focus-within:ring-1 focus-within:ring-teal-500/30 transition">
              <Smile className="w-4 h-4 text-slate-400 shrink-0 cursor-pointer hover:text-slate-600" />
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Chat a message..."
                className="flex-1 bg-transparent text-xs text-slate-800 placeholder-slate-400 outline-none"
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || loading}
                className="w-7 h-7 rounded-full bg-teal-600 hover:bg-teal-700 disabled:opacity-40 text-white flex items-center justify-center transition shrink-0 cursor-pointer shadow-xs"
              >
                <Send className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>

        {/* Column 3: LIVE VOICE STREAM LOGS (~3 cols) */}
        <div className="lg:col-span-3 bg-white border border-slate-200/90 rounded-2xl p-4 flex flex-col justify-between shadow-2xs">
          <div className="space-y-3">
            <h2 className="text-[11px] font-bold text-slate-700 tracking-wider uppercase">
              3. LIVE VOICE STREAM LOGS
            </h2>

            {/* Call ID */}
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase">Call ID</p>
              <p className="text-[11px] font-mono text-slate-700 truncate">
                {selectedCallId}
              </p>
            </div>

            {/* User Phone */}
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase mb-0.5">User Phone</p>
              <div className="p-2 rounded-lg bg-teal-50/70 border border-teal-100 text-xs font-semibold text-slate-800">
                {activeCallerPhone}
              </div>
            </div>

            {/* User Transcription */}
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase mb-0.5">
                User Transcription
              </p>
              <div className="p-2 rounded-lg bg-teal-50/70 border border-teal-100 text-[11px] text-slate-700 italic">
                {lastTranscription}
              </div>
            </div>

            {/* MIA Response */}
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase mb-0.5">MIA Response</p>
              <div className="p-2 rounded-lg bg-teal-50/70 border border-teal-100 text-[11px] text-slate-800 leading-snug">
                {lastMiaResponse}
              </div>
            </div>

            {/* TTS Status Badge */}
            <div className="flex items-center justify-between pt-1">
              <span className="text-[11px] text-slate-500 font-medium">TTS status:</span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                <span>ElevenLabs / Native</span>
              </span>
            </div>

            {/* Call Duration */}
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500 font-medium">Call Duration:</span>
              <span className="font-mono font-bold text-slate-800">00:01:25</span>
            </div>
          </div>

          {/* Bottom Swagger API Link */}
          <div className="pt-3 border-t border-slate-100">
            <a
              href="/docs"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1.5 w-full py-2 rounded-xl text-xs font-semibold text-teal-700 bg-teal-50/80 hover:bg-teal-100 border border-teal-200/80 transition"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>API Docs</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
