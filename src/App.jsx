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

      const data = await response.json();
      
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply, timestamp: new Date() }]);
    } catch (error) {
      console.error("Error generating response:", error);
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: "I'm sorry, I'm having trouble connecting to my knowledge base right now. Please try again later.",
        isError: true,
        timestamp: new Date()
      }]);
    } finally {
      setIsTyping(false);
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
    { title: "Cold & Flu", desc: "Remedies for common cold symptoms", icon: "🤧" },
    { title: "Stress Relief", desc: "Natural ways to manage daily stress", icon: "🌿" },
    { title: "Sleep Aid", desc: "Homeopathic options for better sleep", icon: "🌙" }
  ];

  return (
    <div className="app">
      <header className="header">
        <div className="header-brand">
          <div className="header-logo">
            <span>🌿</span>
          </div>
          <div className="header-title-group">
            <h1 className="header-title">Homeopathic AI</h1>
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
            <h1>Welcome to Homeopathic AI</h1>
            <p>Your intelligent assistant for natural remedies and homeopathic guidance, proudly developed by jasimi.org.</p>
            
            <div className="suggestion-grid">
              {suggestionPills.map((sugg, i) => (
                <div key={i} className="suggestion-card" onClick={() => {
                  setInput(`What are some homeopathic remedies for ${sugg.title.toLowerCase()}?`);
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
            placeholder="Ask about homeopathic remedies..."
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
