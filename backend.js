import express from '/express';
import cors from '/cors';
import dotenv from '/dotenv';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// API Keys nằm an toàn trong file .env
const OPENROUTER_KEY = (process.env.OPENROUTER_API_KEY || '').trim();
const TAVILY_KEY = (process.env.TAVILY_API_KEY || '').trim();

app.post('/api/chat', async (req, res) => {
  try {
    const { messages } = req.body;

    // Gọi OpenRouter từ Server
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'nex-agi/nex-n2.5-pro:free',
        messages: messages
      })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data?.error?.message || 'Lỗi OpenRouter');

    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(3000, () => console.log('Backend đang chạy tại port 3000'));
