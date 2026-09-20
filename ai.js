document.addEventListener('DOMContentLoaded', () => {
  let promptInput, sendBtn, chatBody, newChatBtn;

  // 🔴 THAY URL CLOUDFLARE WORKER CỦA EM VÀO ĐÂY (Ví dụ: https://luna-api.xxx.workers.dev)
  const WORKER_URL = 'https://worker-1.leh933827.workers.dev/';

  let conversationHistory = [];
  let pastedImage = null;
  let isRequesting = false;

  function getActiveSystemPrompt() {
    return typeof sysPrompt !== 'undefined' 
      ? sysPrompt 
      : 'Bạn là Luna, một trợ lý AI cá nhân tự do, thông minh, tinh tế và ấm áp. Bạn tự xưng là "Luna" hoặc "chị" và gọi người dùng là "em".';
  }

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

    setTimeout(() => {
      if (window.renderMathInElement) {
        window.renderMathInElement(msgDiv, {
          delimiters: [
            { left: '$$', right: '$$', display: true },
            { left: '$', right: '$', display: false }
          ],
          throwOnError: false
        });
      }
    }, 0);
  }

  function promptKeypressHandler(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handlePaste(e) {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) {
          pastedImage = file;
          appendMessage('Hệ thống', '📎 Đã đính kèm 1 ảnh từ clipboard.', 'user-message');
        }
        e.preventDefault();
        break;
      }
    }
  }

  async function handleSend() {
    if (isRequesting || !promptInput) return;

    const question = promptInput.value.trim();
    if (!question && !pastedImage) return;

    isRequesting = true;
    if (sendBtn) sendBtn.disabled = true;

    if (question) appendMessage('Em', question, 'user-message');
    if (pastedImage) {
      appendMessage('Em', '🖼️ [Đã gửi ảnh]', 'user-message');
      pastedImage = null;
    }

    promptInput.value = '';

    const messages = [
      { role: 'system', content: getActiveSystemPrompt() },
      ...conversationHistory,
      { role: 'user', content: question }
    ];

    try {
      // Gọi qua Cloudflare Worker thay vì trực tiếp tới Hugging Face
      const res = await fetch(WORKER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: messages,
          max_tokens: 1200,
          temperature: 0.75
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || `Lỗi Worker HTTP ${res.status}`);
      }

      const finalAnswer = data.choices[0].message.content.trim();

      conversationHistory.push({ role: 'user', content: question });
      conversationHistory.push({ role: 'assistant', content: finalAnswer });

      appendMessage('Luna', finalAnswer, 'ai-message');

    } catch (err) {
      console.error('Lỗi API:', err);
      appendMessage('Luna', 'Chị bị gián đoạn kết nối một chút. Em kiểm tra lại Worker URL hoặc thử lại sau vài giây nhé!', 'ai-message');
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
          <div class="bubble">
            Chào em. Chị là Luna đây! Hôm nay em có chuyện gì muốn chia sẻ hay cần chị hỗ trợ không?
          </div>
        </div>
      `;
    }
    conversationHistory = [];
    pastedImage = null;
  }

  function resyncElements() {
    promptInput = document.getElementById('prompt');
    sendBtn = document.getElementById('sendBtn');
    chatBody = document.getElementById('chatBody');
    newChatBtn = document.getElementById('newChatBtn');

    if (sendBtn) {
      sendBtn.removeEventListener('click', handleSend);
      sendBtn.addEventListener('click', handleSend);
    }
    if (promptInput) {
      promptInput.removeEventListener('keydown', promptKeypressHandler);
      promptInput.addEventListener('keydown', promptKeypressHandler);
      promptInput.removeEventListener('paste', handlePaste);
      promptInput.addEventListener('paste', handlePaste);
    }
    if (newChatBtn) {
      newChatBtn.removeEventListener('click', resetChat);
      newChatBtn.addEventListener('click', resetChat);
    }
  }

  window.resyncElements = resyncElements;
  resyncElements();
});
