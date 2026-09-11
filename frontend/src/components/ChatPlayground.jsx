import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Send,
  RotateCcw,
  Bot,
  User,
  Loader2,
  CalendarCheck,
  AlertCircle,
  Sparkles,
  Phone,
} from 'lucide-react';
import { sendChat } from '../api';

/**
 * ChatPlayground — interactive conversation window to test Mia
 * without making a real phone call. Shows message bubbles, tool
 * executions (booking confirmations), and supports conversation reset.
 */
export default function ChatPlayground({ onBookingCreated, onMessageCountChange, onStartCall }) {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: "Hello! I'm Mia, your virtual receptionist. How can I help you schedule an appointment today?",
    },
  ]);
  const [history, setHistory] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [toolsUsed, setToolsUsed] = useState([]);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  /** Auto-scroll to bottom when new messages arrive */
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  /** Send a message to the chat endpoint */
  const handleSend = useCallback(async () => {
    const msg = input.trim();
    if (!msg || loading) return;

    setInput('');
    setError(null);

    // Add user message to display
    setMessages((prev) => [...prev, { role: 'user', content: msg }]);
    setLoading(true);

    try {
      const result = await sendChat(msg, null, history);

      // Show Mia's reply
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: result.reply },
      ]);

      // Track tool executions for badge display
      if (result.tools_called && result.tools_called.length > 0) {
        setToolsUsed((prev) => [...prev, ...result.tools_called]);
      }

      // Update conversation history for next turn
      setHistory(result.updated_history);
      onMessageCountChange?.();
      if (result.tools_called?.some((t) => t.tool === 'book_appointment')) {
        onBookingCreated?.();
      }
    } catch (err) {
      setError(err.message || 'Failed to reach Mia. Is the backend running?');
      // Remove the failed message indicator
      setMessages((prev) => [
        ...prev,
        { role: 'error', content: err.message || 'Connection failed' },
      ]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }, [input, loading, history]);

  /** Reset the conversation */
  const handleReset = () => {
    setMessages([
      {
        role: 'assistant',
        content: "Hello! I'm Mia, your virtual receptionist. How can I help you schedule an appointment today?",
      },
    ]);
    setHistory([]);
    setToolsUsed([]);
    setError(null);
    setInput('');
  };

  /** Handle Enter to send */
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  /** Check if any booking was confirmed */
  const hasBookingConfirmed = toolsUsed.some(
    (t) => t.name === 'book_appointment' && t.result?.status === 'confirmed'
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-surface-700/50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-surface-100">Chat with Mia</h3>
            <p className="text-[11px] text-surface-500">Test redirection &amp; booking</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {onStartCall && (
            <button
              onClick={onStartCall}
              className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm shadow-emerald-600/30 transition-all active:scale-95 cursor-pointer"
              title="Start live phone call with Mia"
            >
              <Phone className="w-3.5 h-3.5" />
              <span>Voice Call</span>
            </button>
          )}
          <button
            id="chat-reset-btn"
            onClick={handleReset}
            title="Reset conversation"
            className="p-1.5 rounded-md text-surface-400 hover:text-surface-200 hover:bg-surface-700/50 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Booking confirmed banner */}
      {hasBookingConfirmed && (
        <div className="mx-3 mt-2 flex items-center gap-2 rounded-lg bg-success-500/15 border border-success-500/25 px-3 py-2 animate-fade-in">
          <CalendarCheck className="w-4 h-4 text-success-400 shrink-0" />
          <span className="text-xs font-medium text-success-400">
            Booking confirmed via AI tool call
          </span>
        </div>
      )}

      {/* Messages area */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0"
      >
        {messages.map((msg, i) => (
          <MessageBubble key={i} message={msg} index={i} />
        ))}

        {/* Typing indicator */}
        {loading && (
          <div className="flex items-start gap-2.5 animate-fade-in">
            <div className="w-7 h-7 rounded-full bg-primary-600/20 flex items-center justify-center shrink-0">
              <Bot className="w-3.5 h-3.5 text-primary-400" />
            </div>
            <div className="bg-surface-800/60 border border-surface-700/30 rounded-2xl rounded-tl-sm px-4 py-2.5">
              <div className="flex gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-surface-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-surface-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-surface-400 animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div className="mx-3 mb-1 flex items-center gap-2 text-xs text-danger-400 bg-danger-500/10 border border-danger-500/20 rounded-lg px-3 py-2">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          {error}
        </div>
      )}

      {/* Input area */}
      <div className="p-3 border-t border-surface-700/50">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            id="chat-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message… (try 'What's the weather?' or 'كيفاش الطقس؟')"
            rows={1}
            maxLength={2000}
            className="flex-1 rounded-xl bg-surface-800/60 border border-surface-700/50 px-4 py-2.5
                       text-sm text-surface-200 placeholder:text-surface-500
                       focus:outline-none focus:ring-2 focus:ring-primary-500/40 focus:border-primary-600
                       transition-all resize-none min-h-[40px] max-h-[100px]"
            style={{ fieldSizing: 'content' }}
          />
          <button
            id="chat-send-btn"
            onClick={handleSend}
            disabled={!input.trim() || loading}
            className="p-2.5 rounded-xl bg-primary-600 text-white hover:bg-primary-500
                       active:scale-[0.95] transition-all cursor-pointer
                       disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Individual message bubble. */
function MessageBubble({ message, index }) {
  const isUser = message.role === 'user';
  const isError = message.role === 'error';

  if (isError) {
    return (
      <div className="flex justify-center animate-slide-up">
        <span className="text-xs text-danger-400 bg-danger-500/10 rounded-full px-3 py-1">
          {message.content}
        </span>
      </div>
    );
  }

  return (
    <div
      className={`flex items-start gap-2.5 animate-slide-up ${isUser ? 'flex-row-reverse' : ''}`}
      style={{ animationDelay: `${Math.min(index * 30, 150)}ms` }}
    >
      {/* Avatar */}
      <div
        className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
          isUser
            ? 'bg-surface-600/40'
            : 'bg-primary-600/20'
        }`}
      >
        {isUser ? (
          <User className="w-3.5 h-3.5 text-surface-300" />
        ) : (
          <Bot className="w-3.5 h-3.5 text-primary-400" />
        )}
      </div>

      {/* Bubble */}
      <div
        className={`max-w-[80%] px-4 py-2.5 text-sm leading-relaxed ${
          isUser
            ? 'bg-primary-600/20 border border-primary-500/20 text-surface-100 rounded-2xl rounded-tr-sm'
            : 'bg-surface-800/60 border border-surface-700/30 text-surface-200 rounded-2xl rounded-tl-sm'
        }`}
      >
        {message.content}
      </div>
    </div>
  );
}
