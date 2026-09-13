document.addEventListener('DOMContentLoaded', () => {
  let promptInput, sendBtn, chatBody, newChatBtn;

  // Lấy API key từ localStorage
  const OPENROUTER_API_KEY = localStorage.getItem('openrouter_key') || "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";
  const TAVILY_API_KEY = localStorage.getItem('tavily_key') || "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";

  let conversationHistory = [];
  let pastedImage = null;
  let isRequesting = false; // Chống spam request (429 Rate Limit)

  function getActiveSystemPrompt() {
    return typeof sysPrompt !== 'undefined' ? sysPrompt : 'Bạn là Luna, một trợ lý AI thông minh.';
  }

  // Tối ưu query tìm kiếm
  function prepareSearchQuery(userMessage) {
    if (!userMessage) return '';
    const quotedText = userMessage.match(/"([^"]+)"/);
    if (quotedText && quotedText[1]) {
      return `lời bài hát "${quotedText[1]}"`;
    }
    return userMessage.replace(/(là lời bài hát nào|của ca sĩ|của|là bài gì)/gi, '').trim();
  }

  // Gọi Tavily API
  async function executeTavilySearch(args) {
    try {
      const searchArgs = typeof args === 'string' ? JSON.parse(args) : args;
      const rawQuery = searchArgs.query || searchArgs;
      const cleanQuery = prepareSearchQuery(rawQuery);

      const res = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: TAVILY_API_KEY,
          query: cleanQuery,
          search_depth: "advanced",
          max_results: 3
        })
      });

      const data = await res.json();
      if (!data.results || data.results.length === 0) {
        return "Không tìm thấy thông tin phù hợp.";
      }

      return data.results.map(item => ({
        title: item.title,
        snippet: item.content,
        url: item.url
      }));
    } catch (err) {
      console.error("Lỗi Tavily API:", err);
      return "Không thể truy vấn dữ liệu từ Tavily.";
    }
  }

  function appendMessage(sender, text, roleClass) {
  if (!chatBody) return;
  const msgDiv = document.createElement('div');
  const isUser = roleClass === 'user-message';

  msgDiv.className = `message ${isUser ? 'user' : 'ai'}`;

  // 1. Tự động chuẩn hóa cú pháp LaTeX từ LLM trước khi render
  let cleanText = text
    .replace(/\\\[\s*/g, '$$$$')  // Đổi \[ thành $$
    .replace(/\s*\\\]/g, '$$$$')  // Đổi \] thành $$
    .replace(/\\\(\s*/g, '$')     // Đổi \( thành $
    .replace(/\s*\\\)/g, '$');    // Đổi \) thành $

  // 2. Parse Markdown và Render Avatar
  const formattedContent = window.marked ? window.marked.parse(cleanText) : cleanText;
  const avatarIcon = isUser ? '<i class="bi bi-person-fill"></i>' : '<i class="bi bi-moon-stars-fill"></i>';

  msgDiv.innerHTML = `
    <div class="avatar">${avatarIcon}</div>
    <div class="bubble">${formattedContent}</div>
  `;

  chatBody.appendChild(msgDiv);
  chatBody.scrollTo({ top: chatBody.scrollHeight, behavior: 'smooth' });

  // 3. Render KaTeX
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

    const toolsDefinition = [
      {
        type: 'function',
        function: {
          name: 'web_search',
          description: 'Tìm kiếm thông tin thực tế trên Internet khi cần dữ liệu mới, tra cứu lời bài hát hoặc kiểm chứng thông tin.',
          parameters: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Từ khóa tìm kiếm trên web'
              }
            },
            required: ['query']
          }
        }
      }
    ];

    try {
      // LƯỢT 1: Gửi request tới OpenRouter API
      const res1 = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'HTTP-Referer': window.location.href, // Bắt buộc theo chuẩn OpenRouter
          'X-Title': 'Luna Assistant',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'nex-agi/nex-n2.5-pro:free', // Model mạnh mẽ hỗ trợ Tool Call chuẩn
          messages: messages,
          tools: toolsDefinition,
          tool_choice: 'auto'
        })
      });

      const res1Data = await res1.json();
      if (!res1.ok) throw new Error(res1Data?.error?.message || `OpenRouter API HTTP ${res1.status}`);

      const responseMessage = res1Data.choices[0].message;

      // KIỂM TRA VÀ THỰC THI TOOL CALL
      if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
        messages.push(responseMessage);

        for (const toolCall of responseMessage.tool_calls) {
          if (toolCall.function.name === 'web_search') {
            const searchResults = await executeTavilySearch(toolCall.function.arguments);

            messages.push({
              tool_call_id: toolCall.id,
              role: 'tool',
              name: 'web_search',
              content: typeof searchResults === 'string' ? searchResults : JSON.stringify(searchResults)
            });
          }
        }

        // LƯỢT 2: Trả kết quả tìm kiếm lại cho OpenRouter
        const res2 = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
            'HTTP-Referer': window.location.href,
            'X-Title': 'Luna Assistant',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'meta-llama/llama-3.3-70b-instruct',
            messages: messages
          })
        });

        const res2Data = await res2.json();
        if (!res2.ok) throw new Error(res2Data?.error?.message || `OpenRouter API HTTP ${res2.status}`);

        const finalAnswer = res2Data.choices[0].message.content.trim();

        conversationHistory.push({ role: 'user', content: question });
        conversationHistory.push({ role: 'assistant', content: finalAnswer });

        appendMessage('Luna', finalAnswer, 'ai-message');
      } else {
        // Trả lời trực tiếp
        const finalAnswer = responseMessage.content.trim();

        conversationHistory.push({ role: 'user', content: question });
        conversationHistory.push({ role: 'assistant', content: finalAnswer });

        appendMessage('Luna', finalAnswer, 'ai-message');
      }

    } catch (err) {
      console.error('Lỗi OpenRouter API:', err);
      appendMessage('Luna', 'Có vẻ kết nối tới OpenRouter API gặp sự cố. Bạn kiểm tra lại API Key nhé.', 'ai-message');
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
            Chào bạn. Tôi là Luna. Tôi có thể hỗ trợ gì cho bạn hôm nay?
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
