// Utility functions for speech-to-speech functionality

/**
 * Convert ArrayBuffer to Base64 string
 */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Convert Base64 string to ArrayBuffer
 */
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Convert Float32Array PCM to Int16Array
 */
export function float32ToInt16(pcmFloat32: Float32Array): Int16Array {
  const pcmInt16 = new Int16Array(pcmFloat32.length);
  for (let i = 0; i < pcmFloat32.length; i++) {
    pcmInt16[i] = Math.max(-1, Math.min(1, pcmFloat32[i])) * 0x7FFF;
  }
  return pcmInt16;
}

/**
 * Convert Int16Array to Float32Array
 */
export function int16ToFloat32(pcmInt16: Int16Array): Float32Array {
  const pcmFloat32 = new Float32Array(pcmInt16.length);
  for (let i = 0; i < pcmInt16.length; i++) {
    pcmFloat32[i] = pcmInt16[i] / 0x7FFF;
  }
  return pcmFloat32;
}

/**
 * Create an AudioBuffer from raw PCM data
 */
export function createAudioBufferFromPCM(
  audioContext: AudioContext,
  pcmData: Int16Array,
  sampleRate: number = 16000
): AudioBuffer {
  const audioBuffer = audioContext.createBuffer(1, pcmData.length, sampleRate);
  const channelData = audioBuffer.getChannelData(0);
  
  for (let i = 0; i < pcmData.length; i++) {
    channelData[i] = pcmData[i] / 32768;
  }
  
  return audioBuffer;
}

/**
 * Play audio from base64 encoded PCM
 */
export async function playBase64Audio(
  audioContext: AudioContext,
  base64Audio: string,
  onEnded?: () => void
): Promise<void> {
  const arrayBuffer = base64ToArrayBuffer(base64Audio);
  const uint8Array = new Uint8Array(arrayBuffer);
  
  // Convert to Int16Array (assuming 16-bit PCM)
  const pcmData = new Int16Array(uint8Array.length / 2);
  for (let i = 0; i < pcmData.length; i++) {
    pcmData[i] = uint8Array[i * 2] | (uint8Array[i * 2 + 1] << 8);
    // Convert signed short
    if (pcmData[i] >= 32768) {
      pcmData[i] -= 65536;
    }
  }
  
  const audioBuffer = createAudioBufferFromPCM(audioContext, pcmData);
  
  return new Promise((resolve, reject) => {
    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContext.destination);
    
    source.onended = () => {
      onEnded?.();
      resolve();
    };
    
    (source as any).onerror = (e: any) => {
      reject(e);
    };
    
    source.start();
  });
}

/**
 * WebSocket message types for Realtime API
 */
export interface RealtimeSessionConfig {
  modalities?: ("text" | "audio")[];
  instructions?: string;
  voice?: string;
  inputAudioTranscription?: {
    model: string;
  };
  outputAudioTranscription?: {
    model: string;
  };
}

export interface RealtimeMessage {
  type: string;
  [key: string]: unknown;
}

/**
 * Create session.update message
 */
export function createSessionUpdateMessage(config: RealtimeSessionConfig): RealtimeMessage {
  return {
    type: "session.update",
    session: {
      modalities: config.modalities || ["audio", "text"],
      instructions: config.instructions || "You are a helpful voice assistant.",
      voice: config.voice || "alloy",
      input_audio_transcription: config.inputAudioTranscription || { model: "whisper-1" },
      ...config,
    },
  };
}

/**
 * Create input_audio_buffer.append message
 */
export function createAudioBufferAppendMessage(pcmData: Int16Array): RealtimeMessage {
  return {
    type: "input_audio_buffer.append",
    audio: arrayBufferToBase64(pcmData.buffer as ArrayBuffer),
  };
}

/**
 * Create input_audio_buffer.commit message
 */
export function createAudioBufferCommitMessage(): RealtimeMessage {
  return {
    type: "input_audio_buffer.commit",
  };
}

/**
 * Create response.create message
 */
export function createResponseCreateMessage(
  modalities?: ("text" | "audio")[],
  instructions?: string
): RealtimeMessage {
  return {
    type: "response.create",
    response: {
      modalities: modalities || ["audio", "text"],
      instructions: instructions || "You are a helpful voice assistant.",
    },
  };
}

/**
 * Create conversation.item.create message
 */
export function createConversationItemCreateMessage(
  role: "user" | "assistant",
  content: unknown[] = []
): RealtimeMessage {
  return {
    type: "conversation.item.create",
    item: {
      type: "message",
      role,
      content,
    },
  };
}