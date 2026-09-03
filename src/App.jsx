import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import './App.css';

function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef(null);
  
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  const handleSend = async (e) => {
    e?.preventDefault();
    
    if (!input.trim()) return;
    
    const userText = input.trim();
    setInput('');
    
    const newMessages = [...messages, { role: 'user', content: userText, timestamp: new Date() }];
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

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              setMessages(prev => {
                const updated = [...prev];
                const lastIdx = updated.length - 1;
                updated[lastIdx] = {
                  ...updated[lastIdx],
                  content: updated[lastIdx].content + data.text
                };
                return updated;
              });
            } catch (e) {
              // Ignore partial JSON parsing errors
            }
          }
        }
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
        <form className="input-container" onSubmit={handleSend}>
          <textarea 
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask me anything..."
            rows={1}
            autoFocus
          />
          <button 
            type="submit" 
            className="send-btn" 
            disabled={!input.trim() || isTyping}
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
