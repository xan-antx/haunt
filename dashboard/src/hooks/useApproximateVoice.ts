// Optional "Read aloud (approximation)" for The Listener's spoken text.
// Uses only voices with localService: true, so text never goes to an outside speech service.

import { useCallback, useEffect, useRef, useState } from 'react';

export const NO_VOICE_REASON = 'Your browser has no built-in offline voice.';

export type ApproximateVoice =
  | { available: false; reason: string; speak: (text: string) => void; cancel: () => void }
  | { available: true; voice: SpeechSynthesisVoice; speak: (text: string) => void; cancel: () => void };

function getSynth(): SpeechSynthesis | null {
  if (typeof window === 'undefined') return null;
  if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') return null;
  return window.speechSynthesis;
}

/** Picks a local voice, preferring one whose language matches the document. */
export function pickLocalVoice(voices: SpeechSynthesisVoice[], docLang: string): SpeechSynthesisVoice | null {
  const local = voices.filter((v) => v.localService);
  const lang = (docLang || 'en').toLowerCase();
  const base = lang.split('-')[0]!;
  return (
    local.find((v) => v.lang.toLowerCase().startsWith(lang)) ??
    local.find((v) => v.lang.toLowerCase().startsWith(base)) ??
    local[0] ??
    null
  );
}

export function useApproximateVoice(): ApproximateVoice {
  const synthRef = useRef<SpeechSynthesis | null>(getSynth());
  const [voice, setVoice] = useState<SpeechSynthesisVoice | null>(null);

  useEffect(() => {
    const synth = synthRef.current;
    if (!synth) return;
    const pick = () => setVoice(pickLocalVoice(synth.getVoices(), document.documentElement.lang));
    pick();
    synth.addEventListener?.('voiceschanged', pick);
    return () => {
      synth.removeEventListener?.('voiceschanged', pick);
      // Leaving the Ghost Cam stops any speech in progress.
      synth.cancel();
    };
  }, []);

  const cancel = useCallback(() => {
    synthRef.current?.cancel();
  }, []);

  const speak = useCallback(
    (text: string) => {
      const synth = synthRef.current;
      if (!synth || !voice) return;
      synth.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.voice = voice;
      utterance.lang = voice.lang;
      synth.speak(utterance);
    },
    [voice],
  );

  if (!synthRef.current || !voice) return { available: false, reason: NO_VOICE_REASON, speak, cancel };
  return { available: true, voice, speak, cancel };
}
