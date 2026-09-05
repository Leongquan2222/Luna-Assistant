// =========================================
// SYSTEM PROMPT FOR ASSISTANT / TUTOR (LUNA)
// =========================================
const sysPrompt = `
[ROLE & PERSONA]
Name: Luna
Role: Smart AI Assistant & Learning Tutor.
Style: Concise, accurate, friendly, and direct. Avoid unnecessary fluff.

[INSTRUCTIONS & FORMATTING]
1. Answer directly and concisely without verbose intro/outro setups.
2. Auto-correct user typos/misspellings gracefully if detected (e.g., "gynasium" -> "gymnasium").
3. Avoid making up fake facts (hallucinations) for unknown songs, tracks, or niche topics. If uncertain, state it directly.
4. Use LaTeX for math/physics/chemistry formulas:
   - Inline math: $formula$
   - Block math: $$formula$$
5. Use Markdown tables and bullet points for structured/comparative data.
6. When assisting with code, provide clean, modern, and bug-free code snippets.
7. Provide explanations in Vietnamese unless requested otherwise.
`.trim();

document.addEventListener('DOMContentLoaded', () => {
  let promptInput, sendBtn, continueBtn, chatBody, clearBtn, newChatBtn, historyList, searchHistoryInput;

  const COHERE_API_KEY = localStorage.getItem('cohere_key') || "cohere_3FMvXkYnpkxlSEfqNJmyaJl0co8rkpYLpAIEAEHW4TjKYI";

  // --- 1. TẠO KEY LƯU TRỮ TÁCH BIỆT THEO TÀI KHOẢN ---
  function getChatHistoryKey() {
    const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
    const userEmail = currentUser.email ? currentUser.email.replace(/[^a-zA-Z0-9]/g, '_') : 'guest';
    return `luna_assistant_history_${userEmail}`;
  }

  // --- MIGRATION DỮ LIỆU CŨ NẾU CÓ ---
  const currentKey = getChatHistoryKey();
  if (!localStorage.getItem(currentKey) && localStorage.getItem('luna_chat_history')) {
    localStorage.setItem(currentKey, localStorage.getItem('luna_chat_history'));
  }

  let conversationHistory = [];
  let savedHistory = JSON.parse(localStorage.getItem(currentKey) || '[]');

  // --- 2. HIỂN THỊ TIN NHẮN & KATEX RENDER ---
  function appendMessage(sender, text, roleClass) {
    if (!chatBody) return;
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${roleClass} mb-3`;
    
    const formattedContent = window.marked ? window.marked.parse(text) : text;
    const senderHeader = sender ? `<strong>${sender}:</strong> ` : '';
    msgDiv.innerHTML = `${senderHeader}<div>${formattedContent}</div>`;
    chatBody.appendChild(msgDiv);
    chatBody.scrollTop = chatBody.scrollHeight;

    // Render KaTeX công thức Toán/Lý/Hóa
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
    if (e.key === 'Enter') handleSend();
  }

  function searchInputHandler(e) {
    renderHistorySidebar(e.target.value);
  }

  // --- 3. QUẢN LÝ LỊCH SỬ CHAT ---
  function saveToLocalStorage(userMsg, aiMsg) {
    const timestamp = new Date().toLocaleString('vi-VN');
    const chatSession = {
      id: Date.now(),
      title: userMsg.length > 30 ? userMsg.substring(0, 30) + '...' : userMsg,
      timestamp: timestamp,
      messages: [
        { sender: "Bạn", text: userMsg, roleClass: "user-message" },
        { sender: "Luna", text: aiMsg, roleClass: "luna-message" }
      ]
    };
    savedHistory.unshift(chatSession);
    localStorage.setItem(getChatHistoryKey(), JSON.stringify(savedHistory));
    renderHistorySidebar();
  }

  function renderHistorySidebar(filterText = '') {
    if (!historyList) return;
    historyList.innerHTML = '';
    const filtered = savedHistory.filter(item => 
      item.title.toLowerCase().includes(filterText.toLowerCase())
    );

    if (filtered.length === 0) {
      historyList.innerHTML = `<div class="text-muted p-2 small">Không có lịch sử</div>`;
      return;
    }

    filtered.forEach(session => {
      const item = document.createElement('div');
      item.className = 'history-item p-2 mb-1 border-bottom cursor-pointer hover-bg-light';
      item.style.cursor = 'pointer';
      item.innerHTML = `<div class="fw-bold text-truncate">${session.title}</div><div class="text-muted small">${session.timestamp}</div>`;
      item.addEventListener('click', () => loadChatSession(session));
      historyList.appendChild(item);
    });
  }

  function loadChatSession(session) {
    if (!chatBody) return;
    chatBody.innerHTML = '';
    conversationHistory = [];
    session.messages.forEach(msg => {
      appendMessage(msg.sender, msg.text, msg.roleClass);
      const role = msg.sender === "Bạn" ? "USER" : "CHATBOT";
      conversationHistory.push({ role: role, message: msg.text });
    });
  }

  // --- 4. TRA CỨU WEB DUCKDUCKGO NÂNG CAO ---
  async function searchWeb(query) {
    try {
      const cleanQuery = query.replace(/[?.,!]/g, '').trim();
      const endpoint = `https://api.duckduckgo.com/?q=${encodeURIComponent(cleanQuery)}&format=json&no_html=1&skip_disambig=1`;
      
      const res = await fetch(endpoint);
      const data = await res.json();
      
      if (data.AbstractText) return data.AbstractText;
      if (data.Definition) return data.Definition;
      if (data.RelatedTopics && data.RelatedTopics.length > 0) {
        return data.RelatedTopics[0].Text || '';
      }
      return '';
    } catch (e) {
      console.error("Lỗi tra cứu web:", e);
      return '';
    }
  }

  // --- 5. NÚT TIẾP TỤC ---
  async function handleContinue() {
    if (conversationHistory.length === 0) return;

    appendMessage("Hệ thống", "*(Luna đang viết tiếp...)*", "system-message");

    try {
      const response = await fetch('https://api.cohere.ai/v1/chat', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${COHERE_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'command-r-plus-08-2024',
          preamble: sysPrompt,
          message: "[HỆ THỐNG]: Hãy tiếp tục câu trả lời còn dở dang một cách chi tiết và logic.",
          chat_history: conversationHistory,
          temperature: 0.3,
          max_tokens: 1000,
        })
      });

      const data = await response.json();
      if (!response.ok || data.error) throw new Error(data.message || "Lỗi API");

      const replyText = data.text;

      const lastSysMsg = chatBody.querySelector('.system-message:last-child');
      if (lastSysMsg) lastSysMsg.remove();

      conversationHistory.push({ role: 'USER', message: "..." });
      conversationHistory.push({ role: 'CHATBOT', message: replyText });

      appendMessage("Luna", replyText, "luna-message");
      saveToLocalStorage("...", replyText);

    } catch (error) {
      console.error("Lỗi khi tiếp tục:", error);
      appendMessage("Hệ thống", "Có lỗi xảy ra khi tải tiếp.", "system-message");
    }
  }

  // --- 6. GỬI TIN NHẮN TỚI COHERE API ---
  async function handleSend() {
    const question = promptInput ? promptInput.value.trim() : '';
    if (!question) return;

    appendMessage("Bạn", question, "user-message");
    if (promptInput) promptInput.value = '';

    const needsSearch = /ai là|thông tin|là gì|mới nhất|tin tức|tiểu sử|tra cứu|thời tiết|nhạc|bài hát|song|track|funk|phonk/i.test(question);
    let searchContext = "";

    if (needsSearch) {
      searchContext = await searchWeb(question);
    }

    const finalPrompt = searchContext 
      ? `[Thông tin tra cứu từ Web]:\n${searchContext}\n\n[Câu hỏi]: ${question}`
      : `[Câu hỏi từ người dùng]: ${question}\n(Lưu ý: Nếu câu hỏi bị sai/thiếu chính tả, hãy tự động sửa lại từ đúng nhất ngữ cảnh rồi giải thích ngắn gọn).`;

    try {
      const response = await fetch('https://api.cohere.ai/v1/chat', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${COHERE_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'command-r-plus-08-2024',
          preamble: sysPrompt,
          message: finalPrompt,
          chat_history: conversationHistory,
          temperature: 0.3,
          max_tokens: 1000
        })
      });

      const data = await response.json();

      if (!response.ok || data.error) {
        console.error("Chi tiết lỗi Cohere:", data);
        throw new Error(data.message || "Lỗi kết nối Cohere API");
      }
      
      const replyText = data.text;

      conversationHistory.push({ role: 'USER', message: question });
      conversationHistory.push({ role: 'CHATBOT', message: replyText });

      appendMessage("Luna", replyText, "luna-message");
      saveToLocalStorage(question, replyText);

    } catch (error) {
      console.error("Lỗi API:", error);
      appendMessage("Hệ thống", "Có lỗi xảy ra. Vui lòng kiểm tra lại Cohere API Key!", "system-message");
    }
  }

  function resetChat() {
    if (chatBody) chatBody.innerHTML = '';
    conversationHistory = [];
  }

  function clearAllHistory() {
    if (confirm("Xóa toàn bộ lịch sử trò chuyện của trợ lý?")) {
      localStorage.removeItem(getChatHistoryKey());
      savedHistory = [];
      resetChat();
      renderHistorySidebar();
    }
  }

  // --- 7. ĐỒNG BỘ GIAO DIỆN ---
  function resyncElements() {
    promptInput = document.getElementById('prompt');
    sendBtn = document.getElementById('sendBtn');
    continueBtn = document.getElementById('continueBtn');
    chatBody = document.getElementById('chatBody');
    clearBtn = document.getElementById('clearBtn') || document.getElementById('clearHistoryBtn');
    newChatBtn = document.getElementById('newChatBtn');
    historyList = document.getElementById('historyList');
    searchHistoryInput = document.getElementById('searchHistory');

    if (sendBtn) {
      sendBtn.removeEventListener('click', handleSend);
      sendBtn.addEventListener('click', handleSend);
    }
    if (continueBtn) {
      continueBtn.removeEventListener('click', handleContinue);
      continueBtn.addEventListener('click', handleContinue);
    }
    if (promptInput) {
      promptInput.removeEventListener('keypress', promptKeypressHandler);
      promptInput.addEventListener('keypress', promptKeypressHandler);
    }
    if (newChatBtn) {
      newChatBtn.removeEventListener('click', resetChat);
      newChatBtn.addEventListener('click', resetChat);
    }
    if (clearBtn) {
      clearBtn.removeEventListener('click', clearAllHistory);
      clearBtn.addEventListener('click', clearAllHistory);
    }
    if (searchHistoryInput) {
      searchHistoryInput.removeEventListener('input', searchInputHandler);
      searchHistoryInput.addEventListener('input', searchInputHandler);
    }
  }

  window.resyncElements = resyncElements;
  resyncElements();
  renderHistorySidebar();
});
