import type { VoiceSettings } from "@/lib/types";

type RecResult = { transcript: string; isFinal: boolean };
type Rec = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
};

function recognition(): Rec | null {
  if (typeof window === "undefined") return null;
  const host = window as Window & { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
  const Ctor = host.SpeechRecognition ?? host.webkitSpeechRecognition;
  return Ctor ? new Ctor() : null;
}

export function canSpeak(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function canListen(): boolean {
  return recognition() !== null;
}

export function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  if (!canSpeak()) return Promise.resolve([]);
  const synth = window.speechSynthesis;
  const ready = synth.getVoices();
  if (ready.length) return Promise.resolve(ready);
  return new Promise((resolve) => {
    const done = () => {
      synth.removeEventListener("voiceschanged", done);
      resolve(synth.getVoices());
    };
    synth.addEventListener("voiceschanged", done);
    window.setTimeout(done, 800);
  });
}

function pickVoice(voices: SpeechSynthesisVoice[], settings: VoiceSettings): SpeechSynthesisVoice | null {
  return (
    voices.find((voice) => voice.voiceURI === settings.voiceUri) ??
    voices.find((voice) => voice.lang === settings.lang) ??
    voices.find((voice) => voice.lang.toLowerCase().startsWith("nl")) ??
    null
  );
}

export function silence(): void {
  if (canSpeak()) window.speechSynthesis.cancel();
}

export function speak(text: string, settings: VoiceSettings): void {
  if (!canSpeak()) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  const clean = text.replace(/[*#_`>]/g, "").replace(/\s+/g, " ").trim().slice(0, 2500);
  if (!clean) return;
  const parts = clean.length < 280 ? [clean] : clean.split(/(?<=[.!?])\s+/).reduce<string[]>((groups, sentence) => {
    const last = groups[groups.length - 1];
    if (!last || last.length + sentence.length > 240) groups.push(sentence);
    else groups[groups.length - 1] = `${last} ${sentence}`;
    return groups;
  }, []);
  const voice = pickVoice(synth.getVoices(), settings);
  for (const part of parts) {
    const utterance = new SpeechSynthesisUtterance(part);
    if (voice) utterance.voice = voice;
    utterance.lang = voice?.lang || settings.lang || "nl-BE";
    utterance.rate = settings.rate;
    utterance.pitch = settings.pitch;
    utterance.volume = settings.volume;
    synth.speak(utterance);
  }
}

export function listen(lang: string, onUpdate: (result: RecResult) => void, onEnd: () => void): { stop: () => void } | null {
  const rec = recognition();
  if (!rec) return null;
  rec.lang = lang || "nl-BE";
  rec.interimResults = true;
  rec.continuous = false;
  rec.onresult = (event) => {
    const list = event.results;
    const last = list[list.length - 1];
    const transcript = last?.[0]?.transcript ?? "";
    onUpdate({ transcript, isFinal: Boolean(last?.isFinal) });
  };
  rec.onerror = onEnd;
  rec.onend = onEnd;
  try {
    rec.start();
  } catch {
    onEnd();
    return null;
  }
  return { stop: () => rec.stop() };
}
