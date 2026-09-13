"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

interface ServerMessage {
  type: string;
  transcript?: string;
  audio?: string;
  content?: string;
  error?: string;
}

// Helper function to convert ArrayBuffer to Base64
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Helper function to convert Base64 to ArrayBuffer
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export default function SpeechToSpeechPage() {
  const [connected, setConnected] = useState(false);
  const [recording, setRecording] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [partialTranscript, setPartialTranscript] = useState("");
  const [isPlaying, setIsPlaying] = useState(false);
  const [serverUrl, setServerUrl] = useState("ws://localhost:8765/v1/realtime");
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const audioQueueRef = useRef<string[]>([]);
  const isPlayingRef = useRef(false);
  const conversationStartedRef = useRef(false);

  // Initialize AudioContext
  const initAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    }
    return audioContextRef.current;
  }, []);

  // Play audio from base64
  const playAudio = useCallback(async (base64Audio: string) => {
    try {
      const audioContext = initAudioContext();
      const arrayBuffer = base64ToArrayBuffer(base64Audio);
      
      // Create WAV header parser or use raw PCM
      // The audio is typically 16-bit PCM, so we need to handle it properly
      const uint8Array = new Uint8Array(arrayBuffer);
      
      // Try to decode as raw PCM (16-bit, mono, 16kHz)
      const pcmData = new Int16Array(uint8Array.length / 2);
      for (let i = 0; i < pcmData.length; i++) {
        pcmData[i] = (uint8Array[i * 2] | (uint8Array[i * 2 + 1] << 8)) - 32768;
      }
      
      // Create AudioBuffer
      const sampleRate = 16000;
      const audioBuffer = audioContext.createBuffer(1, pcmData.length, sampleRate);
      const channelData = audioBuffer.getChannelData(0);
      
      for (let i = 0; i < pcmData.length; i++) {
        channelData[i] = pcmData[i] / 32768;
      }
      
      // Play the audio
      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContext.destination);
      source.start();
      
      setIsPlaying(true);
      source.onended = () => {
        setIsPlaying(false);
      };
    } catch (e) {
      console.error("Failed to play audio:", e);
      setIsPlaying(false);
    }
  }, [initAudioContext]);

  // Process audio queue
  const processAudioQueue = useCallback(async () => {
    if (isPlayingRef.current || audioQueueRef.current.length === 0) {
      return;
    }
    
    isPlayingRef.current = true;
    const base64Audio = audioQueueRef.current.shift()!;
    
    try {
      await playAudio(base64Audio);
    } catch (e) {
      console.error("Failed to play audio:", e);
    }
    
    isPlayingRef.current = false;
    
    // Process next in queue
    if (audioQueueRef.current.length > 0) {
      processAudioQueue();
    }
  }, [playAudio]);

  // Connect to WebSocket server
  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    setError(null);
    const ws = new WebSocket(serverUrl);

    ws.onopen = () => {
      setConnected(true);
      setError(null);
      console.log("WebSocket connected");
    };

    ws.onmessage = async (event) => {
      try {
        const data: ServerMessage = JSON.parse(event.data);
        console.log("Received message:", data.type, data);

        switch (data.type) {
          case "session.created":
            console.log("Session created");
            break;

          case "session.updated":
            console.log("Session updated");
            break;

          case "conversation.item.created":
            if (data.transcript) {
              const isUser = data.transcript.includes("[user]");
              setMessages(prev => [...prev, {
                role: isUser ? "user" : "assistant",
                content: data.transcript?.replace("[user]", "").trim() || "",
                timestamp: Date.now(),
              }]);
              setPartialTranscript("");
            }
            break;

          case "input_audio_buffer.speech_started":
            setPartialTranscript("Listening...");
            break;

          case "input_audio_buffer.speech_stopped":
            break;

          case "conversation.item.input_audio_transcription.completed":
            if (data.transcript) {
              setPartialTranscript(data.transcript);
            }
            break;

          case "response.audio_transcript.done":
            if (data.transcript) {
              setMessages(prev => [...prev, {
                role: "assistant" as const,
                content: String(data.transcript),
                timestamp: Date.now(),
              }]);
            }
            break;

          case "response.done":
            console.log("Response done");
            setPartialTranscript("");
            break;

          case "response.audio.delta":
            if (data.audio) {
              audioQueueRef.current.push(data.audio);
              if (!isPlayingRef.current) {
                processAudioQueue();
              }
            }
            break;

          case "error":
            setError(data.error || "Unknown error");
            break;
        }
      } catch (e) {
        console.error("Failed to parse message:", e);
      }
    };

    ws.onerror = () => {
      setError("WebSocket connection error");
      setConnected(false);
    };

    ws.onclose = () => {
      setConnected(false);
      stopRecording();
    };

    wsRef.current = ws;
  }, [serverUrl, processAudioQueue]);

  // Disconnect
  const disconnect = useCallback(() => {
    stopRecording();
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setConnected(false);
    conversationStartedRef.current = false;
  }, []);

  // Start recording from microphone
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { 
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
        } 
      });
      mediaStreamRef.current = stream;

      const audioContext = initAudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      
      // Use ScriptProcessor for broader compatibility
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        
        // Send audio data to server if connected
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          // Convert Float32 to Int16 PCM
          const pcmData = new Int16Array(inputData.length);
          for (let i = 0; i < inputData.length; i++) {
            pcmData[i] = Math.max(-1, Math.min(1, inputData[i])) * 0x7FFF;
          }
          
          // Send as base64 encoded array
          wsRef.current.send(JSON.stringify({
            type: "input_audio_buffer.append",
            audio: arrayBufferToBase64(pcmData.buffer),
          }));
        }
      };

      source.connect(processor);
      // Don't connect to destination to avoid feedback
      // processor.connect(audioContext.destination);

      setRecording(true);
      setError(null);
      
      // Start conversation if not started
      if (!conversationStartedRef.current && wsRef.current?.readyState === WebSocket.OPEN) {
        conversationStartedRef.current = true;
        wsRef.current.send(JSON.stringify({
          type: "conversation.item.create",
          item: {
            type: "message",
            role: "user",
            content: [],
          },
        }));
        
        wsRef.current.send(JSON.stringify({
          type: "response.create",
          response: {
            modalities: ["audio", "text"],
            instructions: "You are a helpful voice assistant. Keep responses concise and natural for speech.",
          },
        }));
      }
    } catch (e) {
      console.error("Failed to start recording:", e);
      setError("Failed to access microphone. Please check permissions.");
    }
  };

  // Stop recording
  const stopRecording = useCallback(() => {
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    
    setRecording(false);
    
    // Commit audio buffer
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: "input_audio_buffer.commit",
      }));
      
      wsRef.current.send(JSON.stringify({
        type: "response.create",
        response: {
          modalities: ["audio", "text"],
          instructions: "You are a helpful voice assistant. Keep responses concise and natural for speech.",
        },
      }));
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, [disconnect]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-800 p-8">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">
            🎙️ 语音对话
          </h1>
          <p className="text-purple-200">
            通过 WebSocket 连接实时语音对话服务
          </p>
        </div>

        {/* Settings Panel */}
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 mb-6">
          <h2 className="text-lg font-semibold text-white mb-4">服务器设置</h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-purple-200 text-sm mb-2">
                WebSocket 地址
              </label>
              <input
                type="text"
                value={serverUrl}
                onChange={(e) => setServerUrl(e.target.value)}
                placeholder="ws://localhost:8765/v1/realtime"
                className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-400"
              />
            </div>
            
            <div>
              <label className="block text-purple-200 text-sm mb-2">
                API Key (可选)
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-..."
                className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-400"
              />
            </div>
            
            <div className="flex gap-3">
              {!connected ? (
                <button
                  onClick={connect}
                  className="flex-1 bg-green-500 hover:bg-green-600 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
                >
                  连接服务器
                </button>
              ) : (
                <button
                  onClick={disconnect}
                  className="flex-1 bg-red-500 hover:bg-red-600 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
                >
                  断开连接
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Status Display */}
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <span className="text-white font-medium">连接状态</span>
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${
              connected 
                ? "bg-green-500/20 text-green-300" 
                : "bg-red-500/20 text-red-300"
            }`}>
              {connected ? "已连接" : "未连接"}
            </span>
          </div>
          
          <div className="flex items-center justify-between">
            <span className="text-white font-medium">播放状态</span>
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${
              isPlaying 
                ? "bg-blue-500/20 text-blue-300" 
                : "bg-gray-500/20 text-gray-300"
            }`}>
              {isPlaying ? "播放中" : "空闲"}
            </span>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-500/20 border border-red-500/40 rounded-xl p-4 mb-6">
            <p className="text-red-200 text-sm">{error}</p>
          </div>
        )}

        {/* Recording Control */}
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 mb-6">
          <div className="flex flex-col items-center">
            {/* Recording Indicator */}
            <div className={`relative w-32 h-32 mb-6 ${
              recording ? "animate-pulse" : ""
            }`}>
              <button
                onClick={recording ? stopRecording : startRecording}
                disabled={!connected}
                className={`w-full h-full rounded-full transition-all duration-300 ${
                  recording
                    ? "bg-red-500 hover:bg-red-600 scale-95"
                    : "bg-purple-500 hover:bg-purple-600"
                } ${!connected ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <div className="flex items-center justify-center h-full">
                  {recording ? (
                    <svg className="w-16 h-16 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <rect x="6" y="6" width="12" height="12" rx="2" />
                    </svg>
                  ) : (
                    <svg className="w-16 h-16 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                      <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
                    </svg>
                  )}
                </div>
              </button>
              
              {/* Recording Ring */}
              {recording && (
                <div className="absolute inset-0 rounded-full border-4 border-red-400 animate-ping opacity-50" />
              )}
            </div>
            
            <p className="text-white text-lg font-medium mb-2">
              {recording ? "点击停止录音" : "点击开始录音"}
            </p>
            <p className="text-purple-200 text-sm">
              {connected ? "请对着麦克风说话" : "请先连接服务器"}
            </p>
          </div>
        </div>

        {/* Partial Transcript */}
        {partialTranscript && (
          <div className="bg-yellow-500/20 border border-yellow-500/40 rounded-xl p-4 mb-6">
            <p className="text-yellow-200 text-sm">
              <span className="font-medium">正在识别: </span>
              {partialTranscript}
            </p>
          </div>
        )}

        {/* Messages History */}
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">对话历史</h2>
          
          <div className="space-y-4 max-h-96 overflow-y-auto">
            {messages.length === 0 ? (
              <p className="text-purple-300 text-center py-8">
                开始对话后会显示在这里
              </p>
            ) : (
              messages.map((msg, index) => (
                <div
                  key={index}
                  className={`p-4 rounded-xl ${
                    msg.role === "user"
                      ? "bg-blue-500/20 ml-8"
                      : "bg-purple-500/20 mr-8"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`text-sm font-medium ${
                      msg.role === "user" ? "text-blue-300" : "text-purple-300"
                    }`}>
                      {msg.role === "user" ? "👤 用户" : "🤖 助手"}
                    </span>
                    <span className="text-purple-400 text-xs">
                      {new Date(msg.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="text-white">{msg.content}</p>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Clear Messages Button */}
        {messages.length > 0 && (
          <button
            onClick={() => setMessages([])}
            className="w-full mt-4 bg-white/10 hover:bg-white/20 text-white py-2 px-4 rounded-lg transition-colors"
          >
            清空对话历史
          </button>
        )}
      </div>
    </div>
  );
}