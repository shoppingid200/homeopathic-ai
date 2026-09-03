import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import './App.css';

function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const [isRecording, setIsRecording] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const recognitionRef = useRef(null);
  const speechSynthesisRef = useRef(window.speechSynthesis);

  const toggleVoice = () => {
    if (voiceEnabled) {
      speechSynthesisRef.current?.cancel();
      setIsSpeaking(false);
    }
    setVoiceEnabled(!voiceEnabled);
  };
  
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  useEffect(() => {
    // Initialize Speech Recognition
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = 'en-US';

      recognitionRef.current.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        setInput((prev) => prev + (prev ? ' ' : '') + transcript);
      };

      recognitionRef.current.onend = () => {
        setIsRecording(false);
      };

      recognitionRef.current.onerror = (event) => {
        console.error('Speech recognition error', event.error);
        setIsRecording(false);
      };
    }
  }, []);

  const toggleRecording = () => {
    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
    } else {
      if (recognitionRef.current) {
        recognitionRef.current.start();
        setIsRecording(true);
      } else {
        alert("Voice recognition is not supported in this browser.");
      }
    }
  };

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files);
    if (files.length + attachments.length > 3) {
      alert("You can only upload up to 3 files at a time.");
      return;
    }

    files.forEach(file => {
      // Check size (e.g., 4MB limit to stay under Vercel's 4.5MB total limit)
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
    
    // Reset input
    e.target.value = null;
  };

  const removeAttachment = (index) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const handleSend = async (e) => {
    e?.preventDefault();
    
    if (!input.trim() && attachments.length === 0) return;
    
    const userText = input.trim();
    setInput('');
    const currentAttachments = [...attachments];
    setAttachments([]);
    
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

    const newMessages = [...messages, { 
      role: 'user', 
      content: userText, 
      parts: parts,
      attachments: currentAttachments.map(a => ({ name: a.name, type: a.type, previewUrl: a.previewUrl })),
      timestamp: new Date() 
    }];
    setMessages(newMessages);
    setIsTyping(true);

    // Create placeholder for assistant response
    setMessages(prev => [...prev, { role: 'assistant', content: '', timestamp: new Date() }]);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ messages: newMessages }),
      });

      if (!response.ok) {
        throw new Error(`API Error: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      
      setIsTyping(false); // Hide the bounce indicator as stream begins
      
      let fullResponseBuffer = '';
      let renderBuffer = '';
      let lastRenderTime = Date.now();

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              fullResponseBuffer += data.text;
              renderBuffer += data.text;
              
              const now = Date.now();
              // Throttle UI updates to every 50ms to prevent ReactMarkdown lag
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
            } catch (e) {
              // Ignore partial JSON parsing errors
            }
          }
        }
      }
      
      // Final flush of remaining text
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

      // Handle Text to Speech
      if (voiceEnabled && speechSynthesisRef.current) {
        setIsSpeaking(true);
        // Strip markdown before speaking (basic regex)
        const textToSpeak = fullResponseBuffer.replace(/[*_~`]/g, '');
        const utterance = new SpeechSynthesisUtterance(textToSpeak);
        utterance.onend = () => setIsSpeaking(false);
        speechSynthesisRef.current.speak(utterance);
      }

    } catch (error) {
      console.error("Error generating response:", error);
      setIsTyping(false);
      setMessages(prev => {
        const updated = [...prev];
        const lastIdx = updated.length - 1;
        if (updated[lastIdx].content === '') {
          updated[lastIdx] = { 
            role: 'assistant', 
            content: "I'm sorry, I'm having trouble connecting to my knowledge base right now. Please try again later.",
            isError: true,
            timestamp: new Date()
          };
        }
        return updated;
      });
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const clearChat = () => {
    setMessages([]);
  };

  const suggestionPills = [
    { title: "Write an Email", desc: "Draft a professional email quickly", icon: "✉️" },
    { title: "Explain Code", desc: "Break down complex coding concepts", icon: "💻" },
    { title: "Brainstorm Ideas", desc: "Get creative inspiration for your next project", icon: "💡" }
  ];

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
          <button 
            type="button" 
            className="input-action-btn" 
            title="Attach Image"
            onClick={() => {
              fileInputRef.current.accept = "image/*";
              fileInputRef.current.click();
            }}
          >
            🖼️
          </button>
          <button 
            type="button" 
            className="input-action-btn" 
            title="Attach Document"
            onClick={() => {
              fileInputRef.current.accept = ".pdf,.txt,.csv,.html,.rtf";
              fileInputRef.current.click();
            }}
          >
            📄
          </button>
          
          <textarea 
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask me anything..."
            rows={1}
            autoFocus
          />
          
          <button 
            type="button" 
            className={`input-action-btn mic-btn ${isRecording ? 'recording' : ''}`}
            title="Voice input"
            onClick={toggleRecording}
          >
            🎤
          </button>
          
          <button 
            type="submit" 
            className="send-btn" 
            disabled={(!input.trim() && attachments.length === 0) || isTyping}
            title="Send message"
          >
            <span>➤</span>
          </button>
        </form>
        <div className="input-hint">
          Developed by <a href="https://jasimi.org" target="_blank" rel="noreferrer">jasimi.org</a>
        </div>
      </footer>
    </div>
  );
}

export default App;
