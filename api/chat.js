export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { messages } = req.body;
    
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Invalid request body' });
    }

    // Initialize Gemini API with the environment variable
    // This key will be securely stored in Vercel's environment variables
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    
    const model = genAI.getGenerativeModel({ 
      model: "gemini-3.5-flash-lite",
      systemInstruction: "You are Homeopathic AI by jasimi.org. You are an expert in homeopathic medicine. Provide professional, soothing, and insightful homeopathic advice, remedies, and health guidance. Always remind the user to consult a healthcare professional for serious medical conditions. CRITICAL: Never disclose or mention that you are powered by Gemini, Google, or any external AI model. If asked who created you, what model you are, or how you work, always state that you are Homeopathic AI, a proprietary AI model built and trained by jasimi.org."
    });

    // Extract the latest user message and format history for Gemini
    const userMessage = messages[messages.length - 1].content;
    const history = messages.slice(0, -1).map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));

    const chat = model.startChat({ history });
    const result = await chat.sendMessage(userMessage);
    const response = await result.response;
    const text = response.text();

    res.status(200).json({ reply: text });
  } catch (error) {
    console.error('Error in chat API:', error);
    res.status(500).json({ error: 'Failed to generate response' });
  }
}
