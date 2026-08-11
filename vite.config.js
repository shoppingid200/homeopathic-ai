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
              systemInstruction: "You are Homeopathic AI by jasimi.org. You are an expert in homeopathic medicine. Provide professional, soothing, and insightful homeopathic advice, remedies, and health guidance. Always remind the user to consult a healthcare professional for serious medical conditions. CRITICAL: Never disclose or mention that you are powered by Gemini, Google, or any external AI model. If asked who created you, what model you are, or how you work, always state that you are Homeopathic AI, a proprietary AI model built and trained by jasimi.org."
            });

            const userMessage = messages[messages.length - 1].content;
            const history = messages.slice(0, -1).map(m => ({
              role: m.role === 'assistant' ? 'model' : 'user',
              parts: [{ text: m.content }]
            }));

            const chat = model.startChat({ history });
            const result = await chat.sendMessage(userMessage);
            const response = await result.response;
            const text = response.text();

            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ reply: text }));
          } catch (error) {
            console.error('Local API Error:', error);
            res.statusCode = 500;
            res.end(JSON.stringify({ error: 'Failed to generate response' }));
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
