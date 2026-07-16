'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import NavBar from '@/components/NavBar';

type AnyRecognition = any;
declare global {
  interface Window {
    SpeechRecognition?: any;
    webkitSpeechRecognition?: any;
  }
}

const LLM_URL = '/api/llm';
const LLM_MODEL = 'qwen3.6-35b-a3b';
const SYSTEM_PROMPT =
  '你是一个简洁的语音助手。请用简体中文回答，保持简短（一般不超过 60 字），' +
  '避免使用 markdown 符号、代码块、列表。直接给出结论即可。' +
  '重要：直接输出回答，不要有"思考过程"、"analysis"、"thinking"等前缀。';

type Message = { role: 'user' | 'assistant'; content: string };

export default function VoicePage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [transcript, setTranscript] = useState('');
  const [listening, setListening] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [streaming, setStreaming] = useState('');
  const [ttsOn, setTtsOn] = useState(true);
  const [autoListen, setAutoListen] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [typed, setTyped] = useState('');

  const chatRef = useRef<HTMLDivElement>(null);
  const autoListenRef = useRef(true);
  const listeningRef = useRef(false);
  const sendToLLMRef = useRef<(text: string) => void>(async () => { /* placeholder */ });
  const inputRef = useRef<HTMLInputElement>(null);
  const recogRef = useRef<AnyRecognition | null>(null);

  useEffect(() => { autoListenRef.current = autoListen; }, [autoListen]);
  useEffect(() => { listeningRef.current = listening; }, [listening]);
  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, streaming]);

  // 朗读（浏览器内置 TTS）
  const speakText = useCallback((text: string) => {
    if (!ttsOn || !('speechSynthesis' in window) || !text) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'zh-CN';
    u.rate = 1.05;
    const voices = window.speechSynthesis.getVoices();
    const zh = voices.find(v => /zh|chinese/i.test(v.lang));
    if (zh) u.voice = zh;
    window.speechSynthesis.speak(u);
  }, [ttsOn]);

  // 停止语音识别
  const stopListen = useCallback(() => {
    if (recogRef.current) { try { recogRef.current.abort(); } catch {} recogRef.current = null; }
    window.speechSynthesis?.cancel();
    setListening(false);
  }, []);

  // LLM 调用（通过 ref 暴露给语音识别和键盘）
  const sendToLLM = useCallback(async (userText: string) => {
    setMessages(prev => [...prev, { role: 'user', content: userText }]);
    setTranscript('');
    setStreaming('');
    setThinking(true);

    const history = ([...messages, { role: 'user', content: userText }] as Message[]).slice(-10);
    try {
      const res = await fetch(LLM_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: LLM_MODEL,
          messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...history],
          max_tokens: 200,
          temperature: 0.7,
          stream: true,
        }),
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      let acc = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, idx).trim();
          buf = buf.slice(idx + 1);
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (payload === '[DONE]') continue;
          try {
            const j = JSON.parse(payload);
            const delta = j.choices?.[0]?.delta?.content || '';
            if (delta) { acc += delta; setStreaming(acc); setThinking(false); }
          } catch {}
        }
      }
      const finalText = acc.trim() || '（无回复）';
      setMessages(prev => [...prev, { role: 'assistant', content: finalText }]);
      setStreaming('');
      speakText(finalText);
    } catch (e: any) {
      setError(`LLM 调用失败: ${e.message}`);
      setThinking(false);
      setStreaming('');
    }
  }, [messages, speakText]);

  // 用 ref 持有 sendToLLM 的最新引用
  useEffect(() => { sendToLLMRef.current = sendToLLM; }, [sendToLLM]);

  // —— 双模式语音输入 ——

  // 模式1: 浏览器 SpeechRecognition（桌面 Chrome / Android 有 Google 服务的设备）
  const startNativeSR = useCallback(async () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return false;
    if (recogRef.current) { try { recogRef.current.abort(); } catch {} recogRef.current = null; }

    const r = new SR();
    r.lang = 'zh-CN';
    r.continuous = false;
    r.interimResults = true;
    r.maxAlternatives = 1;
    let finalText = '';
    let onEndFired = false;

    r.onresult = (e: any) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) finalText += res[0].transcript;
        else interim += res[0].transcript;
      }
      setTranscript(finalText + interim);
    };

    r.onerror = (e: any) => {
      if (e?.error === 'no-speech' || e?.error === 'aborted') return;
      // not-allowed = 国内 Android 无法使用浏览器语音识别，降级到键盘输入
      if (e?.error === 'not-allowed') {
        // 静默降级 — 不做任何报错
        return;
      }
      setTranscript('');
    };

    r.onend = () => {
      if (onEndFired) return;
      onEndFired = true;
      setListening(false);
      const t = finalText.trim();
      if (t) { sendToLLMRef.current(t); }
    };

    try {
      recogRef.current = r;
      r.start();
      setListening(true);
      return true;
    } catch { return false; }
  }, []);

  // 模式2: 键盘输入——用户点击🎤→聚焦输入框→手机键盘弹出（含键盘自带麦克风）
  const focusKeyboard = useCallback(() => {
    inputRef.current?.focus();
    // 如果是触屏设备，延迟再 focus 一次确保键盘弹出
    if ('ontouchstart' in window) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, []);

  // 🎤 按钮点击：优先尝试原生 SpeechRecognition，不支持/not-allowed 则聚焦键盘
  const startListen = useCallback(async () => {
    if (listeningRef.current) return;

    // 试原生 SpeechRecognition
    const srStarted = await startNativeSR();
    if (srStarted) return;

    // 原生不可用 → 聚焦键盘输入（手机键盘自带麦克风，100% 兼容）
    focusKeyboard();
    setError(null);
  }, [startNativeSR, focusKeyboard]);

  // 打字发送
  const sendTyped = () => {
    const t = typed.trim();
    if (!t) return;
    setTyped('');
    stopListen();
    sendToLLM(t);
  };

  useEffect(() => () => stopListen(), [stopListen]);

  return (
    <div className="page-shell">
      <NavBar title="🎤 语音助手" />
      <main className="max-w-2xl mx-auto p-4 space-y-4">
        <div className="app-card p-3 flex flex-wrap items-center gap-3 text-xs">
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={ttsOn} onChange={e => setTtsOn(e.target.checked)} /><span>🔊 朗读</span></label>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={autoListen} onChange={e => setAutoListen(e.target.checked)} /><span>🔁 播完继续听</span></label>
          <span className="ml-auto text-slate-400">{LLM_MODEL}</span>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700 flex justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-red-400">✕</button>
          </div>
        )}

        <div ref={chatRef} className="app-card p-4 h-80 overflow-y-auto space-y-3">
          {messages.length === 0 && !streaming && (
            <div className="text-center text-slate-400 text-sm py-10">
              <p className="text-3xl mb-2">🎙️</p>
              <p>点击下方🎤按钮 → 键盘弹出 → 点键盘上的麦克风说话</p>
              <p className="text-xs mt-1 text-slate-300">Android、iPhone 键盘自带语音输入，无需额外权限</p>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${m.role === 'user' ? 'bg-teal-500 text-white' : 'bg-slate-100 text-slate-800'}`}>
                <div className="text-[10px] opacity-60 mb-0.5">{m.role === 'user' ? '我' : 'AI'}</div>
                {m.content}
              </div>
            </div>
          ))}
          {thinking && !streaming && <div className="flex justify-start"><div className="bg-slate-100 text-slate-400 rounded-2xl px-3 py-2 text-sm animate-pulse">思考中...</div></div>}
          {streaming && (
            <div className="flex justify-start">
              <div className="bg-slate-100 text-slate-800 rounded-2xl px-3 py-2 text-sm">
                <div className="text-[10px] opacity-60 mb-0.5">AI</div>{streaming}<span className="inline-block w-1.5 h-3.5 bg-slate-400 ml-0.5 animate-pulse" />
              </div>
            </div>
          )}
        </div>

        {transcript && <div className="text-center text-sm text-slate-500 italic">{transcript}</div>}

        <div className="flex gap-2">
          <input ref={inputRef} type="text" value={typed} onChange={e => setTyped(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendTyped()}
            placeholder="在此打字，或点🎤用键盘自带语音" className="flex-1 app-input rounded-lg px-3 py-3 text-base" />
          <button onClick={sendTyped} disabled={!typed.trim()} className="px-4 py-2 app-button-primary rounded-lg text-sm disabled:opacity-50">发送</button>
        </div>

        <div className="flex justify-center pt-2">
          <button onClick={() => listening ? stopListen() : startListen()}
            className={`relative w-24 h-24 rounded-full flex items-center justify-center text-4xl shadow-lg transition-all ${listening ? 'bg-red-500 text-white scale-110 animate-pulse' : 'bg-teal-500 text-white hover:bg-teal-600'}`}
            title="点击聚焦输入框，键盘自带麦克风">
            {listening ? '⏹' : '🎤'}
          </button>
        </div>
        <p className="text-center text-xs text-slate-400">
          🎤 点击后键盘弹出 → 点键盘上的麦克风键说话<br/>
          所有手机通用，无需额外权限
        </p>
      </main>
    </div>
  );
}