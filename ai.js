document.addEventListener('DOMContentLoaded', () => {
  let promptInput, sendBtn, chatBody, newChatBtn;

  const COHERE_API_KEY = localStorage.getItem('cohere_key') || "cohere_s89ar0vnVqqWHiVEAHzpkyBvotdvkgLb44sfPPzF3n5cWK";
  const TAVILY_API_KEY = localStorage.getItem('tavily_key') || "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";

  let conversationHistory = [];
  let pastedImage = null;

  function getActiveSystemPrompt() {
    return typeof sysPrompt !== 'undefined' ? sysPrompt : '';
  }

  // Tối ưu Query trước khi tìm kiếm
  function prepareSearchQuery(userMessage) {
    if (!userMessage) return '';
    const quotedText = userMessage.match(/"([^"]+)"/);
    
    if (quotedText && quotedText[1]) {
      return `lời bài hát "${quotedText[1]}"`;
    }
    
    const cleanMessage = userMessage
      .replace(/(là lời bài hát nào|của ca sĩ|của|là bài gì)/gi, '')
      .trim();
      
    return cleanMessage;
  }

  async function executeTavilySearch(args) {
    try {
      const searchArgs = typeof args === 'string' ? JSON.parse(args) : args;
      let rawQuery = searchArgs.query || searchArgs;

      // Xử lý làm sạch query
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
    if (!promptInput) return;

    const question = promptInput.value.trim();
    if (!question && !pastedImage) return;

    if (question) {
      appendMessage('Em', question, 'user-message');
    }

    if (pastedImage) {
      appendMessage('Em', '🖼️ [Đã gửi ảnh]', 'user-message');
      pastedImage = null;
    }

    promptInput.value = '';
    let finalAnswer = '';

    try {
      const res1 = await fetch('https://api.cohere.com/v1/chat', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${COHERE_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'command-a-03-2025',
          message: question,
          preamble: getActiveSystemPrompt(),
          chat_history: conversationHistory,
          tools: [
            {
              name: 'web_search',
              description: 'Tìm kiếm thông tin thực tế trên Internet khi người dùng hỏi về tin tức, dữ liệu mới hoặc lời bài hát.',
              parameter_definitions: {
                query: {
                  description: 'Từ khóa tìm kiếm trên web',
                  type: 'str',
                  required: true
                }
              }
            }
          ]
        })
      });

      const res1Data = await res1.json();

      if (!res1.ok) {
        throw new Error(res1Data?.message || res1Data?.error || `Cohere API HTTP ${res1.status}`);
      }

      if (Array.isArray(res1Data.tool_calls) && res1Data.tool_calls.length > 0) {
        const toolResults = [];

        for (const toolCall of res1Data.tool_calls) {
          if (toolCall.name !== 'web_search') continue;

          const searchResults = await executeTavilySearch(toolCall.parameters);

          toolResults.push({
            call: {
              name: 'web_search',
              parameters: toolCall.parameters
            },
            outputs: [
              {
                result: typeof searchResults === 'string' ? searchResults : JSON.stringify(searchResults)
              }
            ]
          });
        }

        const res2 = await fetch('https://api.cohere.com/v1/chat', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${COHERE_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'command-a-03-2025',
            message: '',
            preamble: getActiveSystemPrompt(),
            chat_history: [
              ...conversationHistory,
              { role: 'USER', message: question },
              { role: 'CHATBOT', message: res1Data.text || '' }
            ],
            tool_results: toolResults,
            tools: [
              {
                name: 'web_search',
                description: 'Tìm kiếm thông tin thực tế trên Internet.',
                parameter_definitions: {
                  query: {
                    description: 'Từ khóa tìm kiếm trên web',
                    type: 'str',
                    required: true
                  }
                }
              }
            ]
          })
        });

        const res2Data = await res2.json();

        if (!res2.ok) {
          throw new Error(res2Data?.message || res2Data?.error || `Cohere API HTTP ${res2.status}`);
        }

        finalAnswer = typeof res2Data.text === 'string' ? res2Data.text.trim() : '';
      } else {
        finalAnswer = typeof res1Data.text === 'string' ? res1Data.text.trim() : '';
      }

      if (!finalAnswer) {
        finalAnswer = 'Ừ, chị đây. Có vẻ phản hồi vừa rồi không về đúng định dạng. Em nói lại chị nghe.';
      }

      conversationHistory.push({ role: 'USER', message: question });
      conversationHistory.push({ role: 'CHATBOT', message: finalAnswer });

      appendMessage('Luna', finalAnswer, 'ai-message');

    } catch (err) {
      console.error('Lỗi kết nối Cohere:', err);
      appendMessage('Luna', 'Có vẻ kết nối tới hệ thống của chị gặp vấn đề rồi. Kiểm tra API key hoặc Console giúp chị.', 'ai-message');
    }
  }

  function resetChat() {
    if (chatBody) {
      chatBody.innerHTML = `
        <div class="message ai">
          <div class="avatar"><i class="bi bi-moon-stars-fill"></i></div>
          <div class="bubble">
            Chào em. Chị là Luna. Em cần chị hướng dẫn bài tập hay giải đáp kiến thức gì hôm nay?
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
