import { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';

function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const [isRecording, setIsRecording] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isTalkMode, setIsTalkMode] = useState(false);
  const [showMediaMenu, setShowMediaMenu] = useState(false);
  const mediaMenuRef = useRef(null);

  // State refs to eliminate stale closure bugs
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  const attachmentsRef = useRef(attachments);
  attachmentsRef.current = attachments;

  const voiceEnabledRef = useRef(voiceEnabled);
  voiceEnabledRef.current = voiceEnabled;

  const isTalkModeRef = useRef(isTalkMode);
  isTalkModeRef.current = isTalkMode;

  const inputRef = useRef(input);
  inputRef.current = input;

  const isSpeakingRef = useRef(false);
  isSpeakingRef.current = isSpeaking;

  const isRecordingRef = useRef(false);
  isRecordingRef.current = isRecording;

  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const recognitionRef = useRef(null);
  const handleSendRef = useRef(null);
  const activeUtterancesRef = useRef([]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  // Close media menu on outside click/tap
  useEffect(() => {
    const handlePointerDown = (e) => {
      if (mediaMenuRef.current && !mediaMenuRef.current.contains(e.target)) {
        setShowMediaMenu(false);
      }
    };
    if (showMediaMenu) {
      document.addEventListener('pointerdown', handlePointerDown);
    }
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [showMediaMenu]);

  // Safe Speech Recognition Starter
  const startRecording = useCallback(() => {
    if (!recognitionRef.current) return;
    if (isSpeakingRef.current) return; // Don't record while AI is speaking

    try {
      recognitionRef.current.abort();
    } catch (e) {}

    try {
      recognitionRef.current.start();
      setIsRecording(true);
      isRecordingRef.current = true;
    } catch (e) {
      console.warn("Could not start speech recognition:", e);
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (!recognitionRef.current) return;
    try {
      recognitionRef.current.stop();
    } catch (e) {}
    setIsRecording(false);
    isRecordingRef.current = false;
  }, []);

  // Initialize Speech Recognition once
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognizer = new SpeechRecognition();
      recognizer.continuous = false;
      recognizer.interimResults = true;
      recognizer.lang = 'en-US';

      let silenceTimer = null;

      recognizer.onresult = (event) => {
        let transcript = '';
        for (let i = 0; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        setInput(transcript);
        inputRef.current = transcript;

        clearTimeout(silenceTimer);
        silenceTimer = setTimeout(() => {
          if (isRecordingRef.current) {
            try { recognizer.stop(); } catch (e) {}
          }
        }, 1200); // Trigger stop after 1.2s to easily fit within 1-1.5s delay requirement
      };

      recognizer.onend = () => {
        clearTimeout(silenceTimer);
        setIsRecording(false);
        isRecordingRef.current = false;

        if (isTalkModeRef.current) {
          const spokenText = inputRef.current.trim();
          if (spokenText) {
            handleSendRef.current?.(null, spokenText);
          } else if (!isSpeakingRef.current) {
            // Nothing was heard, reopen mic smoothly after a brief pause
            setTimeout(() => {
              if (isTalkModeRef.current && !isSpeakingRef.current && !isRecordingRef.current) {
                startRecording();
              }
            }, 400);
          }
        }
      };

      recognizer.onerror = (event) => {
        console.warn('Speech recognition error:', event.error);
        setIsRecording(false);
        isRecordingRef.current = false;

        if (event.error === 'not-allowed') {
          alert("Microphone permission was denied. Please allow microphone access in your browser.");
          setIsTalkMode(false);
          isTalkModeRef.current = false;
          return;
        }

        if (isTalkModeRef.current && !isSpeakingRef.current) {
          setTimeout(() => {
            if (isTalkModeRef.current && !isSpeakingRef.current && !isRecordingRef.current) {
              startRecording();
            }
          }, 600);
        }
      };

      recognitionRef.current = recognizer;
    }
  }, [startRecording]);

  // Robust Text-to-Speech Helper with Garbage Collection prevention
  const speakSentence = useCallback((text, onComplete) => {
    if (!('speechSynthesis' in window)) {
      onComplete?.();
      return;
    }

    const cleanText = text.replace(/[*_~`#>-]/g, '').trim();
    if (!cleanText) {
      onComplete?.();
      return;
    }

    try {
      window.speechSynthesis.resume();
    } catch (e) {}

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'en-US';
    utterance.rate = 1.05;

    activeUtterancesRef.current.push(utterance);

    const cleanup = () => {
      activeUtterancesRef.current = activeUtterancesRef.current.filter(u => u !== utterance);
      onComplete?.();
    };

    utterance.onend = cleanup;
    utterance.onerror = (e) => {
      console.warn("Speech error:", e);
      cleanup();
    };

    window.speechSynthesis.speak(utterance);
  }, []);

  const toggleVoice = () => {
    if (voiceEnabled) {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      setIsSpeaking(false);
      isSpeakingRef.current = false;
      setVoiceEnabled(false);
      voiceEnabledRef.current = false;
    } else {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        window.speechSynthesis.resume();
        const unlock = new SpeechSynthesisUtterance('Voice enabled');
        unlock.lang = 'en-US';
        window.speechSynthesis.speak(unlock);
      }
      setVoiceEnabled(true);
      voiceEnabledRef.current = true;
    }
  };

  const enterTalkMode = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Voice recognition is not supported in this browser. Please use Chrome, Edge, or Safari.");
      return;
    }

    // Audio context unlock
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      window.speechSynthesis.resume();
      const unlock = new SpeechSynthesisUtterance('');
      unlock.volume = 0;
      window.speechSynthesis.speak(unlock);
    }

    setIsTalkMode(true);
    isTalkModeRef.current = true;
    setVoiceEnabled(true);
    voiceEnabledRef.current = true;
    setInput('');
    inputRef.current = '';

    // Start recording synchronously to pass mobile browser user-gesture requirements
    startRecording();
  };

  const exitTalkMode = () => {
    setIsTalkMode(false);
    isTalkModeRef.current = false;
    stopRecording();
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
    isSpeakingRef.current = false;
  };

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files);
    if (files.length + attachments.length > 3) {
      alert("You can only upload up to 3 files at a time.");
      return;
    }

    files.forEach(file => {
      if (file.size > 4 * 1024 * 1024) {
        alert(`File ${file.name} is too large. Limit is 4MB.`);
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        const base64Data = event.target.result.split(',')[1];
        setAttachments(prev => [...prev, {
          name: file.name,
          type: file.type,
          data: base64Data,
          previewUrl: file.type.startsWith('image/') ? event.target.result : null
        }]);
      };
      reader.readAsDataURL(file);
    });
    
    e.target.value = null;
  };

  const removeAttachment = (index) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const handleSend = async (e, textOverride) => {
    e?.preventDefault();
    
    const userText = (textOverride !== undefined && textOverride !== null ? textOverride : input).trim();
    const currentAttachments = [...attachmentsRef.current];
    
    if (!userText && currentAttachments.length === 0) return;
    
    setInput('');
    inputRef.current = '';
    setAttachments([]);
    attachmentsRef.current = [];
    
    // Stop recording while processing response
    stopRecording();
    
    // Stop any existing speech synthesis and unlock audio context for mobile browsers
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      window.speechSynthesis.resume();
      const unlock = new SpeechSynthesisUtterance('');
      unlock.volume = 0;
      window.speechSynthesis.speak(unlock);
    }
    setIsSpeaking(false);
    isSpeakingRef.current = false;

    // Build parts array for API
    const parts = [];
    if (userText) parts.push({ text: userText });
    currentAttachments.forEach(att => {
      parts.push({
        inlineData: {
          mimeType: att.type,
          data: att.data
        }
      });
    });

    const newMessages = [...messagesRef.current, { 
      role: 'user', 
      content: userText, 
      parts: parts,
      attachments: currentAttachments.map(a => ({ name: a.name, type: a.type, previewUrl: a.previewUrl })),
      timestamp: new Date() 
    }];
    setMessages(newMessages);
    messagesRef.current = newMessages;
    setIsTyping(true);

    // Placeholder for assistant response
    setMessages(prev => [...prev, { role: 'assistant', content: '', timestamp: new Date() }]);

    const shouldSpeak = isTalkModeRef.current || voiceEnabledRef.current;
    let pendingUtterances = 0;
    let isStreamComplete = false;

    const checkAllSpeechDone = () => {
      if (isStreamComplete && pendingUtterances === 0) {
        setIsSpeaking(false);
        isSpeakingRef.current = false;
        if (isTalkModeRef.current) {
          setTimeout(() => {
            if (isTalkModeRef.current && !isSpeakingRef.current && !isRecordingRef.current) {
              startRecording();
            }
          }, 350);
        }
      }
    };

    const queueSentence = (sentenceText) => {
      if (!shouldSpeak) return;
      setIsSpeaking(true);
      isSpeakingRef.current = true;
      pendingUtterances++;
      speakSentence(sentenceText, () => {
        pendingUtterances--;
        checkAllSpeechDone();
      });
    };

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          messages: newMessages,
          isTalkMode: isTalkModeRef.current 
        }),
      });

      if (!response.ok) {
        throw new Error(`API Error: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      
      setIsTyping(false);
      
      let renderBuffer = '';
      let speechBuffer = '';
      let lastRenderTime = Date.now();
      const sentenceRegex = /([.?!:])(\s|\n|$)/;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              const newText = data.text;
              renderBuffer += newText;
              speechBuffer += newText;
              
              // Extract and stream sentences to TTS immediately!
              if (shouldSpeak) {
                let match = speechBuffer.match(sentenceRegex);
                while (match) {
                  const cutIndex = match.index + match[1].length;
                  const sentence = speechBuffer.slice(0, cutIndex);
                  speechBuffer = speechBuffer.slice(cutIndex).trimStart();
                  
                  if (sentence.trim().length > 1) {
                    queueSentence(sentence);
                  }
                  match = speechBuffer.match(sentenceRegex);
                }
              }
              
              const now = Date.now();
              if (now - lastRenderTime > 50) {
                const currentRenderBuffer = renderBuffer;
                renderBuffer = '';
                lastRenderTime = now;
                setMessages(prev => {
                  const updated = [...prev];
                  const lastIdx = updated.length - 1;
                  updated[lastIdx] = {
                    ...updated[lastIdx],
                    content: updated[lastIdx].content + currentRenderBuffer
                  };
                  return updated;
                });
              }
            } catch (e) {}
          }
        }
      }
      
      // Final flush of remaining text to screen
      if (renderBuffer) {
        setMessages(prev => {
          const updated = [...prev];
          const lastIdx = updated.length - 1;
          updated[lastIdx] = {
            ...updated[lastIdx],
            content: updated[lastIdx].content + renderBuffer
          };
          return updated;
        });
      }

      // Speak any remaining sentence fragment
      if (shouldSpeak && speechBuffer.trim()) {
        queueSentence(speechBuffer);
        speechBuffer = '';
      }

      isStreamComplete = true;
      checkAllSpeechDone();

    } catch (error) {
      console.error("Error generating response:", error);
      setIsTyping(false);
      setMessages(prev => {
        const updated = [...prev];
        const lastIdx = updated.length - 1;
        if (updated[lastIdx].content === '') {
          updated[lastIdx] = { 
            role: 'assistant', 
            content: "I'm sorry, I encountered an issue while generating a response. Please try again.",
            isError: true,
            timestamp: new Date()
          };
        }
        return updated;
      });

      isStreamComplete = true;
      checkAllSpeechDone();
    }
  };

  // Always keep handleSendRef fresh
  handleSendRef.current = handleSend;

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const clearChat = () => {
    setMessages([]);
    messagesRef.current = [];
  };

  const suggestionPills = [
    { title: "Write an Email", desc: "Draft a professional email quickly", icon: "✉️" },
    { title: "Explain Code", desc: "Break down complex coding concepts", icon: "💻" },
    { title: "Brainstorm Ideas", desc: "Get creative inspiration for your next project", icon: "💡" }
  ];

  const latestAssistantMessage = [...messages].reverse().find(m => m.role === 'assistant')?.content;

  return (
    <div className="app">
      <header className="header">
        <div className="header-brand">
          <div className="header-logo">
            <span>🌿</span>
          </div>
          <div className="header-title-group">
            <h1 className="header-title">Jasimi AI</h1>
            <span className="header-subtitle">by jasimi.org</span>
          </div>
        </div>
        <div style={{display: 'flex', gap: '12px', alignItems: 'center'}}>
          <button 
            className={`voice-toggle-btn ${voiceEnabled ? 'active' : ''} ${isSpeaking ? 'speaking' : ''}`}
            onClick={toggleVoice}
            title={voiceEnabled ? "Mute AI Voice" : "Enable AI Voice"}
          >
            {isSpeaking ? '🗣️' : (voiceEnabled ? '🔊' : '🔇')}
          </button>
          {messages.length > 0 && (
            <button className="new-chat-btn" onClick={clearChat} title="New Chat">
              <span>🔄</span> New Session
            </button>
          )}
          <div className="header-status">
            <div className="status-dot"></div>
            <span>Online</span>
          </div>
        </div>
      </header>

      {isTalkMode ? (
        <main className="talk-mode-overlay">
          <div className="talk-mode-content">
            <div 
              className={`giant-mic ${isRecording ? 'recording' : ''} ${isSpeaking ? 'speaking' : ''}`}
              onClick={() => {
                if (isSpeaking) {
                  // Interrupt AI speech and listen immediately
                  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
                  setIsSpeaking(false);
                  isSpeakingRef.current = false;
                  startRecording();
                } else if (isRecording) {
                  // Tap to submit spoken text or pause
                  if (inputRef.current.trim()) {
                    stopRecording();
                    handleSendRef.current?.(null, inputRef.current);
                  } else {
                    stopRecording();
                  }
                } else {
                  startRecording();
                }
              }}
              title={isSpeaking ? "Tap to interrupt AI" : isRecording ? "Tap to send or pause" : "Tap to speak"}
            >
              {isSpeaking ? '🗣️' : (isRecording ? '🎙️' : '▶️')}
            </div>
            
            <div className="talk-mode-text-display">
              {isSpeaking ? (
                <div className="ai-speaking-text">
                  <span className="speaker-label">Jasimi AI Speaking</span>
                  <p>{latestAssistantMessage || "Speaking..."}</p>
                </div>
              ) : isRecording ? (
                <div className="user-speaking-text">
                  <span className="speaker-label">Listening... (speak now)</span>
                  <p>{input || "..."}</p>
                </div>
              ) : isTyping ? (
                <div className="ai-thinking-text">
                  <span className="speaker-label">Jasimi AI is thinking...</span>
                </div>
              ) : (
                <div className="user-speaking-text">
                  <span className="speaker-label">Paused</span>
                  <p>Tap the mic to talk</p>
                </div>
              )}
            </div>
          </div>
          <button className="exit-talk-btn" onClick={exitTalkMode}>
            ✕ Exit Talk Mode
          </button>
        </main>
      ) : (
        <>
          <main className="chat-area">
            {messages.length === 0 ? (
              <div className="welcome">
                <div className="welcome-icon">🌿</div>
                <h1>Welcome to Jasimi AI</h1>
                <p>Your intelligent, all-purpose AI assistant, proudly developed by jasimi.org.</p>
                
                <div className="suggestion-grid">
                  {suggestionPills.map((sugg, i) => (
                    <div key={i} className="suggestion-card" onClick={() => {
                      setInput(`Help me ${sugg.title.toLowerCase()}`);
                    }}>
                      <div className="icon">{sugg.icon}</div>
                      <div className="label">{sugg.title}</div>
                      <div className="desc">{sugg.desc}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((msg, index) => (
                <div key={index} className={`message ${msg.role}`}>
                  <div className="message-avatar">
                    {msg.role === 'assistant' ? '🌿' : '👤'}
                  </div>
                  <div className="message-content">
                    <div className={`message-bubble ${msg.isError ? 'error-bubble' : ''}`}>
                      {msg.attachments && msg.attachments.length > 0 && (
                        <div className="message-attachments-display">
                          {msg.attachments.map((att, i) => (
                            <div key={i} className="attachment-item-display" title={att.name}>
                              {att.previewUrl ? (
                                <img src={att.previewUrl} alt={att.name} />
                              ) : (
                                <div className="doc-icon">📄</div>
                              )}
                              <span className="attachment-name-display">{att.name}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {msg.role === 'assistant' && !msg.isError ? (
                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                      ) : (
                        msg.content
                      )}
                    </div>
                    <div className="message-time">
                      {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>
              ))
            )}

            {isTyping && (
              <div className="message assistant">
                <div className="message-avatar">🌿</div>
                <div className="message-content">
                  <div className="message-bubble typing-indicator">
                    <div className="typing-dot"></div>
                    <div className="typing-dot"></div>
                    <div className="typing-dot"></div>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </main>

          <footer className="input-area">
            {attachments.length > 0 && (
              <div className="attachments-preview-bar">
                {attachments.map((att, i) => (
                  <div key={i} className="attachment-preview-item">
                    {att.previewUrl ? (
                      <img src={att.previewUrl} alt="preview" />
                    ) : (
                      <div className="doc-icon">📄</div>
                    )}
                    <span className="att-name">{att.name}</span>
                    <button type="button" onClick={() => removeAttachment(i)} className="remove-att-btn">×</button>
                  </div>
                ))}
              </div>
            )}
            <form className="input-container" onSubmit={handleSend}>
              <input 
                type="file" 
                ref={fileInputRef} 
                style={{ display: 'none' }} 
                multiple 
                accept="image/*,.pdf,.txt,.csv,.html,.rtf" 
                onChange={handleFileSelect} 
              />
              <div className="input-text-wrapper">
                <textarea 
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask me anything..."
                  rows={1}
                  autoFocus
                />
              </div>

              <div className="input-controls-row">
                <div className="input-controls-left">
                  <div className="media-menu-container" ref={mediaMenuRef}>
                    <button 
                      type="button" 
                      className={`add-media-btn ${showMediaMenu ? 'active' : ''}`} 
                      title="Add Media & Documents"
                      onClick={() => setShowMediaMenu(prev => !prev)}
                    >
                      <span className="plus-icon">+</span>
                      <span className="add-media-label">Add Media</span>
                    </button>

                    {showMediaMenu && (
                      <div className="media-dropdown-menu">
                        <button 
                          type="button" 
                          className="media-dropdown-item"
                          onClick={() => {
                            setShowMediaMenu(false);
                            fileInputRef.current.accept = "image/*";
                            fileInputRef.current.click();
                          }}
                        >
                          <span className="media-item-icon">🖼️</span>
                          <div className="media-item-info">
                            <span className="media-item-title">Upload Image</span>
                            <span className="media-item-desc">Photos, Diagrams</span>
                          </div>
                        </button>

                        <button 
                          type="button" 
                          className="media-dropdown-item"
                          onClick={() => {
                            setShowMediaMenu(false);
                            fileInputRef.current.accept = ".pdf,.txt,.csv,.html,.rtf";
                            fileInputRef.current.click();
                          }}
                        >
                          <span className="media-item-icon">📄</span>
                          <div className="media-item-info">
                            <span className="media-item-title">Upload Document</span>
                            <span className="media-item-desc">PDF, TXT, CSV, Docs</span>
                          </div>
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="input-controls-right">
                  <button 
                    type="button" 
                    className="start-talk-mode-btn"
                    title="Start Hands-Free Talk Mode"
                    onClick={enterTalkMode}
                  >
                    🎙️ <span className="talk-btn-label">Talk Mode</span>
                  </button>
                  
                  <button 
                    type="submit" 
                    className="send-btn" 
                    disabled={(!input.trim() && attachments.length === 0) || isTyping}
                    title="Send message"
                  >
                    <span>➤</span>
                  </button>
                </div>
              </div>
            </form>
            <div className="input-hint">
              Developed by <a href="https://jasimi.org" target="_blank" rel="noreferrer">jasimi.org</a>
            </div>
          </footer>
        </>
      )}
    </div>
  );
}

export default App;
