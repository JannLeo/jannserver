# huggingface/speech-to-speech

## 分析
该仓库提供低延迟语音代理管道（VAD->STT->LLM->TTS），通过 OpenAI Realtime 兼容 WebSocket API 暴露。支持本地或云端模型，适用于实时语音交互应用。

不适合整合。Next.js 是前端框架，而此项目为后端语音处理服务。虽可通过 API 集成，但核心功能需独立部署为后端服务，无法直接作为 Next.js 应用的一部分运行。

时间: 2026-07-10T06:28:32.352Z
