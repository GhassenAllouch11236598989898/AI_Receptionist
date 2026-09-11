import { useState, useRef, useCallback, useEffect } from 'react';
import {
  Volume2,
  VolumeX,
  Loader2,
  Play,
  Square,
  Sparkles,
  Info,
} from 'lucide-react';
import { testTTS } from '../api';

/**
 * VoiceTester — lets the operator type text and hear Mia speak it.
 * Uses ElevenLabs TTS via /voice/tts-test when configured.
 * Automatically falls back to browser Web Speech API if ElevenLabs API key is missing.
 */
export default function VoiceTester() {
  const [text, setText] = useState(
    "Hello, thanks for calling! How can I help you book an appointment today?"
  );
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [statusNotice, setStatusNotice] = useState(null);
  const [error, setError] = useState(null);
  const audioRef = useRef(null);
  const urlRef = useRef(null);

  /** Clean up any previous object URL to avoid memory leaks. */
  const revokeOldUrl = useCallback(() => {
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      if (audioRef.current) {
        audioRef.current.pause();
      }
      revokeOldUrl();
    };
  }, [revokeOldUrl]);

  /** Fallback to browser's built-in Web Speech API */
  const playBrowserSpeech = (speechText) => {
    if (!('speechSynthesis' in window)) {
      setError('Browser speech synthesis is not supported in this browser.');
      setPlaying(false);
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(speechText);
    
    // Choose a pleasant female voice if available
    const voices = window.speechSynthesis.getVoices();
    const preferredVoice = voices.find(
      (v) =>
        (v.name.includes('Female') ||
          v.name.includes('Zira') ||
          v.name.includes('Samantha') ||
          v.name.includes('Google') ||
          v.name.includes('Natural')) &&
        v.lang.startsWith('en')
    );
    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }
    utterance.rate = 1.0;
    utterance.pitch = 1.05;

    utterance.onstart = () => {
      setPlaying(true);
      setStatusNotice('Playing with browser speech engine (Add ELEVENLABS_API_KEY in .env for ultra-realistic studio voice).');
    };

    utterance.onend = () => {
      setPlaying(false);
    };

    utterance.onerror = () => {
      setPlaying(false);
      setError('Speech synthesis playback error.');
    };

    window.speechSynthesis.speak(utterance);
  };

  const handleTest = async () => {
    if (!text.trim()) return;
    setError(null);
    setStatusNotice(null);
    setLoading(true);
    setPlaying(false);

    // Stop any active playback
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    revokeOldUrl();

    try {
      const blob = await testTTS(text.trim());
      const url = URL.createObjectURL(blob);
      urlRef.current = url;

      const audio = new Audio(url);
      audioRef.current = audio;

      audio.onplay = () => {
        setPlaying(true);
        setStatusNotice('Playing high-fidelity voice via ElevenLabs stream.');
      };
      audio.onended = () => setPlaying(false);
      audio.onerror = () => {
        setPlaying(false);
        setError('Audio playback failed');
      };

      await audio.play();
    } catch (err) {
      // ElevenLabs is not configured in .env; fallback to browser speech synthesis
      playBrowserSpeech(text.trim());
    } finally {
      setLoading(false);
    }
  };

  const handleStop = () => {
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setPlaying(false);
  };

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-2xl shadow-sm flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/40">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
            <Volume2 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-white">Voice Synthesizer Studio</h2>
            <p className="text-xs text-slate-400">
              Test Mia's spoken voice and vocal responses
            </p>
          </div>
        </div>
        <span className="px-2.5 py-1 text-[11px] font-semibold rounded-full bg-purple-500/10 text-purple-300 border border-purple-500/20">
          TTS Engine
        </span>
      </div>

      {/* Main Form */}
      <div className="flex-1 p-5 flex flex-col gap-4 overflow-y-auto">
        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center justify-between">
            <span>Speech Prompt</span>
            <span className="text-slate-500 lowercase font-normal">{text.length}/500 chars</span>
          </label>
          <textarea
            id="voice-test-input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            maxLength={500}
            placeholder="Type something for Mia to say…"
            className="w-full rounded-xl bg-slate-800/80 border border-slate-700/80 p-3.5
                       text-sm text-slate-100 placeholder:text-slate-500
                       focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500
                       transition-all resize-none shadow-inner"
          />
        </div>

        {/* Quick sample chips */}
        <div className="space-y-1.5">
          <span className="text-xs text-slate-400 font-medium">Quick presets:</span>
          <div className="flex flex-wrap gap-2">
            {[
              "Hello, thanks for calling! How can I help you book today?",
              "Bonjour, bienvenue! Comment puis-je vous aider pour votre rendez-vous?",
              "Your appointment is confirmed for tomorrow at 2 PM.",
            ].map((sample, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setText(sample)}
                className="text-xs px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700/60 transition-colors text-left truncate max-w-full"
              >
                {sample}
              </button>
            ))}
          </div>
        </div>

        {/* Status / Fallback Notice */}
        {statusNotice && (
          <div className="flex items-start gap-2 text-xs text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-3 animate-fade-in">
            <Info className="w-4 h-4 shrink-0 mt-0.5 text-indigo-400" />
            <span>{statusNotice}</span>
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3.5 py-2.5">
            <VolumeX className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Action Controls */}
        <div className="mt-auto pt-3 border-t border-slate-800 flex items-center justify-between">
          <button
            id="voice-test-btn"
            onClick={playing ? handleStop : handleTest}
            disabled={loading || !text.trim()}
            className={`
              flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold
              transition-all duration-200 cursor-pointer shadow-lg
              ${playing
                ? 'bg-red-500/20 text-red-300 border border-red-500/40 hover:bg-red-500/30'
                : 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:from-indigo-500 hover:to-purple-500 shadow-indigo-600/30 active:scale-95'
              }
              disabled:opacity-40 disabled:cursor-not-allowed
            `}
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Synthesizing…</span>
              </>
            ) : playing ? (
              <>
                <Square className="w-4 h-4" />
                <span>Stop Speaking</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-current" />
                <span>Play Voice</span>
              </>
            )}
          </button>

          {playing && (
            <div className="flex items-center gap-1">
              <span className="w-1 h-3 bg-purple-400 animate-pulse rounded-full"></span>
              <span className="w-1 h-5 bg-indigo-400 animate-pulse delay-75 rounded-full"></span>
              <span className="w-1 h-4 bg-emerald-400 animate-pulse delay-150 rounded-full"></span>
              <span className="text-xs text-slate-400 ml-2">Speaking...</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
