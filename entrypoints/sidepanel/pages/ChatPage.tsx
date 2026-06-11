import { useState, useEffect, useRef } from 'react';
import type { ChatMessage as ChatMessageType } from '../../../core/types';
import {
  DEFAULT_VOICE_SETTINGS,
  detectVoiceCapabilities,
  normalizeVoiceSettings,
  type VoiceSettings,
} from '../../../core/voice/settings';
import ChatMessage from '../components/ChatMessage';
import { consumePendingText, onPendingText } from '../pending-text';
import { useI18n } from '../i18n';

type ChatProvider = 'official-api' | 'deepseek-web' | null;

interface ChatAuthStatus {
  available?: boolean;
  provider?: ChatProvider;
  hasApiKey?: boolean;
  hasToken?: boolean;
}

export default function ChatPage() {
  const { t } = useI18n();
  const [messages, setMessages] = useState<ChatMessageType[]>([]);
  const [inputText, setInputText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [authStatus, setAuthStatus] = useState<ChatAuthStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [voiceSettings, setVoiceSettings] = useState<VoiceSettings>(DEFAULT_VOICE_SETTINGS);
  const [isListening, setIsListening] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesRef = useRef<ChatMessageType[]>([]);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const voiceCapabilities = detectVoiceCapabilities(window);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Consume pending text from right-click on mount + register live callback
  useEffect(() => {
    const text = consumePendingText();
    if (text) {
      setInputText(text);
      inputRef.current?.focus();
    }
    return onPendingText((t) => {
      setInputText(t);
      inputRef.current?.focus();
    });
  }, []);

  // Check auth status on mount
  useEffect(() => {
    chrome.runtime.sendMessage({ type: 'GET_AUTH_STATUS' })
      .then((resp: ChatAuthStatus | undefined) => {
        setAuthStatus({
          available: resp?.available ?? resp?.hasToken ?? false,
          provider: resp?.provider ?? (resp?.hasToken ? 'deepseek-web' : null),
          hasApiKey: resp?.hasApiKey ?? false,
          hasToken: resp?.hasToken ?? false,
        });
      })
      .catch(() => setAuthStatus({ available: false, provider: null, hasApiKey: false, hasToken: false }));
  }, []);

  useEffect(() => {
    chrome.runtime.sendMessage({ type: 'GET_VOICE_SETTINGS' })
      .then((result) => setVoiceSettings(normalizeVoiceSettings(result)))
      .catch(() => setVoiceSettings(DEFAULT_VOICE_SETTINGS));
    const handler = (msg: { type?: string; voiceSettings?: VoiceSettings }) => {
      if (msg.type === 'VOICE_SETTINGS_UPDATED') {
        setVoiceSettings(normalizeVoiceSettings(msg.voiceSettings));
      }
    };
    chrome.runtime.onMessage.addListener(handler);
    return () => chrome.runtime.onMessage.removeListener(handler);
  }, []);

  // Listen for streaming chunks and incoming text
  useEffect(() => {
    const handler = (msg: { type: string; text?: string; done?: boolean; error?: string } & ChatAuthStatus) => {
      if (msg.type === 'CHAT_SET_INPUT_TEXT' && typeof msg.text === 'string') {
        setInputText(msg.text);
        inputRef.current?.focus();
        return;
      }
      if (msg.type === 'AUTH_STATUS_CHANGED') {
        setAuthStatus({
          available: msg.available ?? msg.hasToken ?? false,
          provider: msg.provider ?? (msg.hasToken ? 'deepseek-web' : null),
          hasApiKey: msg.hasApiKey ?? false,
          hasToken: msg.hasToken ?? false,
        });
        return;
      }
      if (msg.type === 'CHAT_STREAM_CHUNK') {
        if (msg.error) {
          setError(msg.error);
          setIsStreaming(false);
          return;
        }
        if (msg.done) {
          setIsStreaming(false);
          if (voiceSettings.readAloudEnabled) {
            setTimeout(() => speakLatestAssistant(messagesRef.current, voiceSettings), 0);
          }
          return;
        }
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === 'assistant') {
            return [...prev.slice(0, -1), { role: 'assistant', text: last.text + (msg.text ?? '') }];
          }
          return [...prev, { role: 'assistant', text: msg.text ?? '' }];
        });
      }
    };
    chrome.runtime.onMessage.addListener(handler);
    return () => chrome.runtime.onMessage.removeListener(handler);
  }, [voiceSettings]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = () => {
    const text = inputText.trim();
    if (!text || isStreaming) return;

    setMessages((prev) => [...prev, { role: 'user', text }]);
    setInputText('');
    setIsStreaming(true);
    setError(null);

    chrome.runtime.sendMessage({ type: 'CHAT_SUBMIT_PROMPT', payload: { text } })
      .catch((err: Error) => {
        setError(err.message);
        setIsStreaming(false);
      });
  };

  const newSession = () => {
    chrome.runtime.sendMessage({ type: 'CHAT_NEW_SESSION' }).catch(() => {});
    setMessages([]);
    setError(null);
    setIsStreaming(false);
    inputRef.current?.focus();
  };

  const startVoiceInput = () => {
    const Recognition = getSpeechRecognitionConstructor();
    if (!Recognition || isListening) return;
    const recognition = new Recognition();
    recognition.lang = 'zh-CN';
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0]?.transcript ?? '')
        .join('')
        .trim();
      if (transcript) setInputText(transcript);
    };
    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };
    recognition.onerror = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };
    recognitionRef.current = recognition;
    setIsListening(true);
    recognition.start();
  };

  const stopVoiceInput = () => {
    recognitionRef.current?.stop();
    setIsListening(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  if (authStatus?.available === false) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center">
        <p className="text-sm mb-3" style={{ color: 'var(--ds-text-secondary)' }}>
          {t('sidepanel.chatPage.authRequired')}
        </p>
        <p className="text-xs" style={{ color: 'var(--ds-text-tertiary)' }}>
          {t('sidepanel.chatPage.authHint')}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 px-4 py-3" style={{ borderBottom: '1px solid var(--ds-border)' }}>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium" style={{ color: 'var(--ds-text)' }}>{t('sidepanel.chatPage.title')}</span>
            {authStatus?.provider && (
              <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ color: 'var(--ds-text-tertiary)', background: 'var(--ds-surface)' }}>
                {authStatus.provider === 'official-api' ? 'API' : 'Web'}
              </span>
            )}
          </div>
          <p className="text-[11px] mt-1 leading-relaxed" style={{ color: 'var(--ds-text-secondary)' }}>
            {t('sidepanel.chatPage.description')}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {voiceSettings.readAloudEnabled && voiceCapabilities.speechSynthesis && (
            <button
              onClick={() => speakLatestAssistant(messagesRef.current, voiceSettings)}
              className="text-xs px-2.5 py-1 rounded-md"
              style={{ color: 'var(--ds-text-tertiary)', background: 'var(--ds-surface)' }}
              title={t('sidepanel.chatPage.readLatest')}
            >
              {t('sidepanel.chatPage.read')}
            </button>
          )}
          <button
            onClick={newSession}
            className="text-xs px-2.5 py-1 rounded-md"
            style={{ color: 'var(--ds-text-tertiary)', background: 'var(--ds-surface)' }}
            title={t('sidepanel.chatPage.newSessionTitle')}
          >
            {t('sidepanel.chatPage.newSession')}
          </button>
        </div>
      </div>

      {/* Messages */}
      <div ref={listRef} className="flex-1 overflow-y-auto p-3">
        {messages.length === 0 && !isStreaming && (
          <div className="ds-empty-state h-full">
            <div className="ds-empty-state-icon">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <div className="ds-empty-state-title">{t('sidepanel.chatPage.empty')}</div>
            <div className="ds-empty-state-description">{t('sidepanel.chatPage.emptyHelp')}</div>
          </div>
        )}
        {messages.map((msg, i) => (
          <ChatMessage
            key={i}
            message={msg}
            isStreaming={isStreaming && i === messages.length - 1 && msg.role === 'assistant'}
          />
        ))}
        {error && (
          <div className="text-xs text-red-400 text-center mt-2">{error}</div>
        )}
      </div>

      {/* Input */}
      <div className="p-3" style={{ borderTop: '1px solid var(--ds-border)' }}>
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('sidepanel.chatPage.inputPlaceholder')}
            rows={2}
            className="flex-1 resize-none rounded-lg px-3 py-2 text-sm outline-none"
            style={{ background: 'var(--ds-surface)', color: 'var(--ds-text)', border: '1px solid var(--ds-border)' }}
          />
          {voiceSettings.inputEnabled && voiceCapabilities.speechRecognition && (
            <button
              onClick={isListening ? stopVoiceInput : startVoiceInput}
              className="self-end px-3 py-2 rounded-lg text-sm font-medium"
              style={{
                background: isListening ? 'var(--ds-danger-bg)' : 'var(--ds-surface)',
                color: isListening ? 'var(--ds-danger)' : 'var(--ds-text-secondary)',
                border: '1px solid var(--ds-border)',
              }}
              title={isListening ? t('sidepanel.chatPage.stopListening') : t('sidepanel.chatPage.voiceInput')}
            >
              {isListening ? t('sidepanel.chatPage.stop') : t('sidepanel.chatPage.mic')}
            </button>
          )}
          <button
            onClick={sendMessage}
            disabled={isStreaming || !inputText.trim()}
            className="self-end px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-40"
            style={{ background: 'var(--ds-accent)', color: '#fff' }}
          >
            {isStreaming ? '...' : t('sidepanel.chatPage.send')}
          </button>
        </div>
      </div>
    </div>
  );
}

type SpeechRecognitionResultLike = {
  readonly 0: { transcript: string };
};

type SpeechRecognitionEventLike = {
  results: Iterable<SpeechRecognitionResultLike> | ArrayLike<SpeechRecognitionResultLike>;
};

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start(): void;
  stop(): void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | null {
  const value = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return value.SpeechRecognition ?? value.webkitSpeechRecognition ?? null;
}

function speakLatestAssistant(messages: ChatMessageType[], settings: VoiceSettings) {
  if (!('speechSynthesis' in window)) return;
  const text = [...messages].reverse().find((message) => message.role === 'assistant')?.text.trim();
  if (!text) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = settings.rate;
  utterance.pitch = settings.pitch;
  window.speechSynthesis.speak(utterance);
}
