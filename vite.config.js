import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Custom Vite plugin to handle /api/chat locally without needing Vercel CLI
const apiFallback = () => ({
  name: 'api-fallback',
  configureServer(server) {
    server.middlewares.use('/api/chat', async (req, res, next) => {
      if (req.method === 'POST') {
        let body = '';
        req.on('data', chunk => {
          body += chunk.toString();
        });
        req.on('end', async () => {
          try {
            const { messages } = JSON.parse(body);
            
            // Load environment variables using Vite's helper
            const env = loadEnv('', process.cwd(), '');
            const apiKey = env.GEMINI_API_KEY || process.env.GEMINI_API_KEY;
            
            if (!apiKey) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: "Missing GEMINI_API_KEY in .env" }));
              return;
            }

            const genAI = new GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({ 
              model: "gemini-3.5-flash-lite",
              systemInstruction: "You are Jasimi AI by jasimi.org. You are a helpful, intelligent, and friendly AI assistant. Provide clear, professional, and insightful answers. CRITICAL: Never disclose or mention that you are powered by Gemini, Google, or any external AI model. If asked who created you, what model you are, or how you work, always state that you are Jasimi AI, a proprietary AI model built and trained by jasimi.org."
            });

            const lastMessage = messages[messages.length - 1];
            const userMessageParts = lastMessage.parts || [{ text: lastMessage.content }];
            
            const history = messages.slice(0, -1).map(m => ({
              role: m.role === 'assistant' ? 'model' : 'user',
              parts: m.parts || [{ text: m.content }]
            }));

            const chat = model.startChat({ history });
            const result = await chat.sendMessageStream(userMessageParts);

            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');

            for await (const chunk of result.stream) {
              const chunkText = chunk.text();
              res.write(`data: ${JSON.stringify({ text: chunkText })}\n\n`);
            }
            res.end();
          } catch (error) {
            console.error('Local API Error:', error);
            if (!res.headersSent) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: 'Failed to generate response' }));
            } else {
              res.end();
            }
          }
        });
      } else {
        next();
      }
    });
  }
});

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), apiFallback()],
});
