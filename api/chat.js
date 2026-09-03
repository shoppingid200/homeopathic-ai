import { GoogleGenerativeAI } from '@google/generative-ai';

export const config = {
  runtime: 'edge'
};

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const { messages } = await req.json();
    
    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: 'Invalid request body' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    
    const model = genAI.getGenerativeModel({ 
      model: "gemini-3.5-flash-lite",
      systemInstruction: "You are Jasimi AI by jasimi.org. You are a helpful, intelligent, and friendly AI assistant. Provide clear, professional, and insightful answers. CRITICAL: Never disclose or mention that you are powered by Gemini, Google, or any external AI model. If asked who created you, what model you are, or how you work, always state that you are Jasimi AI, a proprietary AI model built and trained by jasimi.org."
    });

    const userMessage = messages[messages.length - 1].content;
    const history = messages.slice(0, -1).map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));

    const chat = model.startChat({ history });
    const result = await chat.sendMessageStream(userMessage);

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of result.stream) {
            const chunkText = chunk.text();
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: chunkText })}\n\n`));
          }
          controller.close();
        } catch (err) {
          controller.error(err);
        }
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      }
    });
  } catch (error) {
    console.error('Error in chat API:', error);
    return new Response(JSON.stringify({ error: 'Failed to generate response' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
