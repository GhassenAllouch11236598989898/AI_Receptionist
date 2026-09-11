import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Phone,
  PhoneOff,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Bot,
  User,
  Sparkles,
  Loader2,
  Clock,
  X,
  Minimize2,
  Maximize2,
  Send,
} from 'lucide-react';
import { sendChat, testTTS } from '../api';

/**
 * LiveVoiceCallModal — Virtual telephone handset mode for phone or PC.
 *
 * Fixes:
 * - Prevents premature closing caused by React unmount/effect loops.
 * - Handles mobile browser speech recognition seamlessly.
 * - Auto-plays voice responses and toggles listening mode safely.
 */
export default function LiveVoiceCallModal({ isOpen, onClose, onBookingCreated }) {
  const [callStatus, setCallStatus] = useState('connecting'); // 'connecting' | 'mia_speaking' | 'listening' | 'processing' | 'ended'
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [callLogs, setCallLogs] = useState([]);
  const [minimized, setMinimized] = useState(false);
  const [manualInput, setManualInput] = useState('');
  const [errorNotice, setErrorNotice] = useState(null);

  const historyRef = useRef([]);
  const recognitionRef = useRef(null);
  const audioPlayerRef = useRef(null);
  const timerIntervalRef = useRef(null);
  const isMutedRef = useRef(false);
  const callActiveRef = useRef(false);
  const callStatusRef = useRef('connecting');
  const chatScrollRef = useRef(null);

  // Keep refs in sync
  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  useEffect(() => {
    callStatusRef.current = callStatus;
  }, [callStatus]);

  // Auto-scroll call transcript
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [callLogs, transcript]);

  /** Free up audio and timers WITHOUT closing the modal */
  const stopResources = useCallback(() => {
    callActiveRef.current = false;

    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
    }

    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }

    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current = null;
    }
  }, []);

  /** Start listening for user speech via browser SpeechRecognition */
  const startListening = useCallback(() => {
    if (!callActiveRef.current || isMutedRef.current) {
      return;
    }

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setErrorNotice(
        'Speech recognition is not supported in this browser. Use the microphone button or type below.'
      );
      setCallStatus('idle');
      return;
    }

    try {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // ignore
        }
      }

      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        setCallStatus('listening');
        setTranscript('');
        setErrorNotice(null);
      };

      recognition.onresult = (event) => {
        let currentText = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          currentText += event.results[i][0].transcript;
        }
        setTranscript(currentText);

        if (event.results[event.results.length - 1].isFinal) {
          handleUserSpeech(currentText);
        }
      };

      recognition.onerror = (event) => {
        if (event.error === 'no-speech') {
          // Restart listening after brief pause
          if (callActiveRef.current && !isMutedRef.current) {
            setTimeout(() => {
              if (callActiveRef.current && callStatusRef.current === 'listening') {
                try {
                  recognition.start();
                } catch {
                  // ignore
                }
              }
            }, 400);
          }
        } else if (event.error === 'not-allowed') {
          setErrorNotice('Microphone access denied. Tap "Allow" or type your reply below.');
          setCallStatus('idle');
        } else if (event.error !== 'aborted') {
          console.warn('Speech recognition notice:', event.error);
        }
      };

      recognition.onend = () => {
        // If still in listening state and no final speech triggered, restart gracefully
        if (
          callActiveRef.current &&
          callStatusRef.current === 'listening' &&
          !isMutedRef.current
        ) {
          setTimeout(() => {
            if (callActiveRef.current && callStatusRef.current === 'listening') {
              try {
                recognition.start();
              } catch {
                // ignore
              }
            }
          }, 300);
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.warn('Speech recognition start error:', err);
      setCallStatus('idle');
    }
  }, []);

  /** Speak text out loud */
  const speakText = useCallback(
    async (textToSpeak) => {
      if (!callActiveRef.current) return;
      setCallStatus('mia_speaking');

      // Pause mic while Mia speaks
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // ignore
        }
      }

      // Try ElevenLabs backend TTS first
      try {
        const blob = await testTTS(textToSpeak);
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audioPlayerRef.current = audio;

        audio.onended = () => {
          URL.revokeObjectURL(url);
          if (callActiveRef.current) {
            startListening();
          }
        };
        audio.onerror = () => {
          URL.revokeObjectURL(url);
          playBrowserSpeechFallback(textToSpeak);
        };
        await audio.play();
        return;
      } catch {
        playBrowserSpeechFallback(textToSpeak);
      }
    },
    [startListening]
  );

  /** Browser Speech Synthesis Fallback */
  const playBrowserSpeechFallback = (textToSpeak) => {
    if (!('speechSynthesis' in window)) {
      if (callActiveRef.current) startListening();
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(textToSpeak);

    const voices = window.speechSynthesis.getVoices();
    const friendlyVoice = voices.find(
      (v) =>
        (v.name.includes('Female') ||
          v.name.includes('Natural') ||
          v.name.includes('Samantha') ||
          v.name.includes('Zira') ||
          v.name.includes('Google')) &&
        v.lang.startsWith('en')
    );
    if (friendlyVoice) utterance.voice = friendlyVoice;
    utterance.rate = 1.0;
    utterance.pitch = 1.05;

    utterance.onend = () => {
      if (callActiveRef.current) {
        startListening();
      }
    };
    utterance.onerror = () => {
      if (callActiveRef.current) {
        startListening();
      }
    };

    window.speechSynthesis.speak(utterance);
  };

  /** Process User's Spoken or Typed Message */
  const handleUserSpeech = async (userText) => {
    const cleanText = userText.trim();
    if (!cleanText || !callActiveRef.current) return;

    setCallStatus('processing');
    setTranscript('');
    setCallLogs((prev) => [...prev, { role: 'user', text: cleanText }]);

    try {
      const response = await sendChat(cleanText, '+14165550198', historyRef.current);
      historyRef.current = response.updated_history || [];

      setCallLogs((prev) => [...prev, { role: 'assistant', text: response.reply }]);

      if (
        response.tools_called?.some(
          (t) => t.name === 'book_appointment' && t.result?.status === 'confirmed'
        )
      ) {
        if (onBookingCreated) onBookingCreated();
      }

      speakText(response.reply);
    } catch {
      const errReply = "I'm having trouble connecting right now. Please try again shortly.";
      setCallLogs((prev) => [...prev, { role: 'assistant', text: errReply }]);
      speakText(errReply);
    }
  };

  /** User explicitly clicks the red End Call button */
  const handleEndCall = () => {
    stopResources();
    setCallStatus('ended');
    setTimeout(() => {
      onClose();
    }, 400);
  };

  /** Start Call when modal opens */
  useEffect(() => {
    if (!isOpen) return;

    callActiveRef.current = true;
    setCallStatus('connecting');
    setDuration(0);
    setTranscript('');
    setErrorNotice(null);
    historyRef.current = [];

    // Call duration timer
    timerIntervalRef.current = setInterval(() => {
      setDuration((prev) => prev + 1);
    }, 1000);

    // Initial greeting from Mia
    const greeting =
      "Hello! I'm Mia, your virtual receptionist. How can I help you schedule an appointment today?";
    setCallLogs([{ role: 'assistant', text: greeting }]);
    speakText(greeting);

    // Cleanup ONLY frees resources on unmount; does NOT call onClose()
    return () => {
      stopResources();
    };
  }, [isOpen, speakText, stopResources]);

  // Format call timer 00:00
  const formatTime = (secs) => {
    const m = Math.floor(secs / 60)
      .toString()
      .padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  if (!isOpen) return null;

  return (
    <div
      className={`fixed z-50 transition-all duration-300 ${
        minimized
          ? 'bottom-6 right-6 w-96 rounded-2xl shadow-2xl bg-slate-900 border border-slate-700 p-4'
          : 'inset-0 bg-slate-950/85 backdrop-blur-xl flex items-center justify-center p-4'
      }`}
    >
      <div
        className={`w-full ${
          minimized
            ? ''
            : 'max-w-md bg-slate-900/95 border border-slate-800 rounded-3xl shadow-2xl shadow-indigo-500/10 flex flex-col overflow-hidden h-[630px]'
        }`}
      >
        {/* Header Bar */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800/80 bg-slate-900/60">
          <div className="flex items-center gap-2.5">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </span>
            <div>
              <h3 className="text-sm font-semibold text-white tracking-wide">Live Phone Call</h3>
              <p className="text-[11px] text-slate-400">Handset Mode &bull; {formatTime(duration)}</p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setMinimized(!minimized)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              title={minimized ? 'Expand' : 'Minimize'}
            >
              {minimized ? <Maximize2 className="w-4 h-4" /> : <Minimize2 className="w-4 h-4" />}
            </button>
            <button
              onClick={handleEndCall}
              className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-slate-800 transition"
              title="End Call"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Minimized Content */}
        {minimized ? (
          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-indigo-600/30 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
                <Bot className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-medium text-white">Mia Receptionist</p>
                <p className="text-[11px] text-slate-400">{formatTime(duration)}</p>
              </div>
            </div>
            <button
              onClick={handleEndCall}
              className="w-9 h-9 rounded-full bg-red-600 hover:bg-red-500 flex items-center justify-center text-white shadow-md shadow-red-600/30 transition"
            >
              <PhoneOff className="w-4 h-4" />
            </button>
          </div>
        ) : (
          /* Full Call Screen */
          <div className="flex-1 flex flex-col justify-between p-5 overflow-hidden">
            {/* Caller Info & Animated Avatar */}
            <div className="flex flex-col items-center text-center space-y-2.5 pt-1">
              <div className="relative flex items-center justify-center">
                {/* Pulsing ring when Mia is speaking */}
                {callStatus === 'mia_speaking' && (
                  <>
                    <div className="absolute -inset-4 rounded-full bg-indigo-500/20 animate-ping"></div>
                    <div className="absolute -inset-8 rounded-full bg-indigo-500/10 animate-pulse"></div>
                  </>
                )}

                {/* Green pulse when listening to user */}
                {callStatus === 'listening' && (
                  <>
                    <div className="absolute -inset-4 rounded-full bg-emerald-500/20 animate-ping"></div>
                    <div className="absolute -inset-8 rounded-full bg-emerald-500/10 animate-pulse"></div>
                  </>
                )}

                <div className="relative w-20 h-20 rounded-full bg-gradient-to-tr from-indigo-600 via-indigo-500 to-emerald-400 p-1 shadow-xl shadow-indigo-500/25">
                  <div className="w-full h-full rounded-full bg-slate-900 flex items-center justify-center text-white">
                    <Bot className="w-10 h-10 text-indigo-300" />
                  </div>
                </div>
              </div>

              <div>
                <h2 className="text-base font-bold text-white tracking-tight">Mia Virtual Receptionist</h2>
                <div className="flex items-center justify-center gap-1.5 text-xs text-slate-400 mt-0.5">
                  <Clock className="w-3.5 h-3.5 text-indigo-400" />
                  <span>{formatTime(duration)}</span>
                </div>
              </div>

              {/* Status Badge */}
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-slate-800/90 border border-slate-700">
                {callStatus === 'connecting' && (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin text-indigo-400" />
                    <span className="text-indigo-300">Connecting call...</span>
                  </>
                )}
                {callStatus === 'mia_speaking' && (
                  <>
                    <Volume2 className="w-3 h-3 text-indigo-400 animate-pulse" />
                    <span className="text-indigo-300">Mia is speaking...</span>
                  </>
                )}
                {callStatus === 'listening' && (
                  <>
                    <Mic className="w-3 h-3 text-emerald-400 animate-bounce" />
                    <span className="text-emerald-300">Listening (Speak into phone)...</span>
                  </>
                )}
                {callStatus === 'processing' && (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin text-amber-400" />
                    <span className="text-amber-300">Mia is thinking...</span>
                  </>
                )}
                {callStatus === 'idle' && (
                  <>
                    <Mic className="w-3 h-3 text-slate-400" />
                    <span className="text-slate-300">Tap mic below to speak</span>
                  </>
                )}
                {callStatus === 'ended' && (
                  <>
                    <PhoneOff className="w-3 h-3 text-red-400" />
                    <span className="text-red-300">Call ended</span>
                  </>
                )}
              </div>
            </div>

            {/* Live Captions / Conversation Feed */}
            <div
              ref={chatScrollRef}
              className="flex-1 my-3 p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800/70 overflow-y-auto max-h-44 space-y-2 text-xs"
            >
              {callLogs.map((log, idx) => (
                <div
                  key={idx}
                  className={`flex gap-2 ${
                    log.role === 'user' ? 'justify-end' : 'justify-start'
                  }`}
                >
                  <div
                    className={`max-w-[85%] px-3 py-2 rounded-xl ${
                      log.role === 'user'
                        ? 'bg-indigo-600 text-white rounded-br-none'
                        : 'bg-slate-800 text-slate-200 rounded-bl-none'
                    }`}
                  >
                    <p className="font-semibold text-[10px] mb-0.5 opacity-70">
                      {log.role === 'user' ? 'You' : 'Mia'}
                    </p>
                    <p className="leading-relaxed">{log.text}</p>
                  </div>
                </div>
              ))}

              {/* Live preview while speaking */}
              {transcript && (
                <div className="flex justify-end">
                  <div className="max-w-[85%] px-3 py-2 rounded-xl bg-indigo-950/70 border border-indigo-500/40 text-indigo-200 italic">
                    {transcript}...
                  </div>
                </div>
              )}
            </div>

            {/* Notice banner */}
            {errorNotice && (
              <div className="mb-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[11px] text-center">
                {errorNotice}
              </div>
            )}

            {/* Quick Text Fallback Input (for noisy rooms or mic denial) */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (manualInput.trim()) {
                  handleUserSpeech(manualInput.trim());
                  setManualInput('');
                }
              }}
              className="flex items-center gap-1.5 mb-3 bg-slate-950/80 border border-slate-800 rounded-xl px-2 py-1"
            >
              <input
                type="text"
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
                placeholder="Type if mic is busy or quiet..."
                className="flex-1 bg-transparent text-xs text-white placeholder-slate-500 px-2 py-1 outline-none"
              />
              <button
                type="submit"
                disabled={!manualInput.trim()}
                className="p-1.5 rounded-lg text-indigo-400 hover:text-white disabled:opacity-40"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </form>

            {/* Phone Call Controls Bar */}
            <div className="flex items-center justify-center gap-6 pt-1">
              {/* Mute Button */}
              <button
                type="button"
                onClick={() => {
                  setIsMuted(!isMuted);
                  if (!isMuted && recognitionRef.current) {
                    try {
                      recognitionRef.current.abort();
                    } catch {
                      // ignore
                    }
                  } else if (isMuted && callActiveRef.current) {
                    startListening();
                  }
                }}
                className={`w-13 h-13 rounded-full flex flex-col items-center justify-center transition cursor-pointer ${
                  isMuted
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white border border-slate-700'
                }`}
                title={isMuted ? 'Unmute' : 'Mute'}
              >
                {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                <span className="text-[10px] mt-0.5">{isMuted ? 'Muted' : 'Mute'}</span>
              </button>

              {/* End Call Button */}
              <button
                type="button"
                onClick={handleEndCall}
                className="w-16 h-16 rounded-full bg-red-600 hover:bg-red-500 active:scale-95 text-white flex flex-col items-center justify-center shadow-lg shadow-red-600/40 transition cursor-pointer"
                title="End Call"
              >
                <PhoneOff className="w-7 h-7" />
              </button>

              {/* Interrupt / Push to Speak */}
              <button
                type="button"
                onClick={() => {
                  if (window.speechSynthesis) window.speechSynthesis.cancel();
                  if (audioPlayerRef.current) audioPlayerRef.current.pause();
                  startListening();
                }}
                className="w-13 h-13 rounded-full bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white border border-slate-700 flex flex-col items-center justify-center transition cursor-pointer"
                title="Interrupt Mia and speak"
              >
                <VolumeX className="w-5 h-5" />
                <span className="text-[10px] mt-0.5">Interrupt</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
