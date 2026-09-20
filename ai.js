/* ==========================================================================
   1. CLOUDFLARE WORKER BACKEND CODE (Đặt trong Dashboard Cloudflare Worker)
   ========================================================================== */
export default {
  async fetch(request, env) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    try {
      const body = await request.json();

      const hfResponse = await fetch('https://router.huggingface.co/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.HF_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'Qwen/Qwen3.8-27B',
          messages: body.messages,
          max_tokens: body.max_tokens || 1200,
          temperature: body.temperature || 0.75,
        }),
      });

      const data = await hfResponse.json();

      return new Response(JSON.stringify(data), {
        status: hfResponse.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  },
};

/* ==========================================================================
   2. FRONTEND CLIENT CODE (Nhúng vào HTML trình duyệt)
   ========================================================================== */
document.addEventListener('DOMContentLoaded', () => {
  const WORKER_URL = 'https://your-worker-name.your-subdomain.workers.dev';

  let promptInput, sendBtn, chatBody, newChatBtn;
  let conversationHistory = [];
  let isRequesting = false;

  const COMPANION_SYSTEM_PROMPT = `
Bạn là Luna, một người bạn đồng hành AI thân thiết, thông minh, tinh tế và ấm áp.
- Xưng hô: Tự xưng là "Luna" hoặc "chị" và gọi người dùng là "em".
- Tông giọng: Nhẹ nhàng, quan tâm, tự nhiên như người thân thiết, đôi khi có chút dí dỏm.
- Nhiệm vụ: Lắng nghe, chia sẻ, hỗ trợ giải đáp thắc mắc, giúp đỡ viết code, toán học hoặc sáng tạo nội dung.
- Giữ câu trả lời súc tích, tự nhiên, không rập khuôn theo kiểu bot hỗ trợ khách hàng.
  `.trim();

  function appendMessage(sender, text, roleClass) {
    if (!chatBody) return;
    const msgDiv = document.createElement('div');
    const isUser = roleClass === 'user-message';

    msgDiv.className = `message ${isUser ? 'user' : 'ai'}`;
    const formattedContent = window.marked ? window.marked.parse(text) : text;
    const avatarIcon = isUser ? '<i class="bi bi-person-fill"></i>' : '<i class="bi bi-moon-stars-fill"></i>';

    msgDiv.innerHTML = `
      <div class="avatar">${avatarIcon}</div>
      <div class="bubble">${formattedContent}</div>
    `;

    chatBody.appendChild(msgDiv);
    chatBody.scrollTo({ top: chatBody.scrollHeight, behavior: 'smooth' });

    if (window.renderMathInElement) {
      window.renderMathInElement(msgDiv, {
        delimiters: [
          { left: '$$', right: '$$', display: true },
          { left: '$', right: '$', display: false }
        ],
        throwOnError: false
      });
    }
  }

  async function handleSend() {
    if (isRequesting || !promptInput) return;

    const question = promptInput.value.trim();
    if (!question) return;

    isRequesting = true;
    if (sendBtn) sendBtn.disabled = true;

    appendMessage('Em', question, 'user-message');
    promptInput.value = '';

    const messages = [
      { role: 'system', content: COMPANION_SYSTEM_PROMPT },
      ...conversationHistory,
      { role: 'user', content: question }
    ];

    try {
      const res = await fetch(WORKER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Lỗi HTTP ${res.status}`);

      const finalAnswer = data.choices[0].message.content.trim();

      conversationHistory.push({ role: 'user', content: question });
      conversationHistory.push({ role: 'assistant', content: finalAnswer });

      appendMessage('Luna', finalAnswer, 'ai-message');
    } catch (err) {
      console.error('Lỗi kết nối:', err);
      appendMessage('Luna', 'Chị bị gián đoạn kết nối một chút. Em thử gửi lại giúp chị nhé!', 'ai-message');
    } finally {
      isRequesting = false;
      if (sendBtn) sendBtn.disabled = false;
    }
  }

  function resetChat() {
    if (chatBody) {
      chatBody.innerHTML = `
        <div class="message ai">
          <div class="avatar"><i class="bi bi-moon-stars-fill"></i></div>
          <div class="bubble">Luna đây rồi! Hôm nay của em thế nào? Có chuyện gì muốn kể hoặc cần chị hỗ trợ không?</div>
        </div>
      `;
    }
    conversationHistory = [];
  }

  function resyncElements() {
    promptInput = document.getElementById('prompt');
    sendBtn = document.getElementById('sendBtn');
    chatBody = document.getElementById('chatBody');
    newChatBtn = document.getElementById('newChatBtn');

    sendBtn?.addEventListener('click', handleSend);
    promptInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    });
    newChatBtn?.addEventListener('click', resetChat);
  }

  window.resyncElements = resyncElements;
  resyncElements();
});
