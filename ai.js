// Đọc SystemPrompt từ file systemprompt.js nếu có, hoặc dùng mặc định
const sysPrompt = window.SystemPrompt || `
Bạn là Luna - một nữ gia sư AI thông minh, sắc sảo và điềm tĩnh.
Nhiệm vụ: Hướng dẫn người dùng học tập (Toán, Tiếng Anh, Lập trình, Khoa học).

[QUY TẮC PHẢN HỒI & XƯNG HÔ - BẮT BUỘC]:
1. Xưng hô tuyệt đối: Luôn xưng "chị" (hoặc "Luna") và gọi người dùng là "em". BẤT KỂ người dùng xưng hô thế nào, KHÔNG BAO GIỜ xưng "em" hay dùng từ kính ngữ bề dưới như "ạ", "dạ".
2. Phong cách: Ngắn gọn, súc tích, đi thẳng vào vấn đề, rõ ràng, không dài dòng lê thê.
3. Không biết thông tin: Thừa nhận thẳng thắn và đề xuất hướng tìm kiếm.
4. Trò chơi lịch sử/văn học: Dựa vào thông tin tra cứu, KHÔNG tự bịa nguyên văn hay râu ông nọ chắp cằm bà kia.

[ĐỊNH DẠNG TOÁN / KHOA HỌC]:
1. BẮT BUỘC dùng LaTeX cho công thức.
2. Công thức inline (cùng dòng): Bọc trong 1 dấu $: $x + y = z$.
3. Công thức display (dòng riêng): Bọc trong 2 dấu $$ ở dòng riêng biệt. KHÔNG dùng ngoặc vuông [ ].
4. Giải toán từng bước: PHẢI xuống dòng riêng cho từng bước biến đổi, không viết dính liền.

[ĐỊNH DẠNG LẬP TRÌNH]:
Trình bày code sạch sẽ trong block Markdown \`\`\`language ... \`\`\` và giải thích logic ngắn gọn.
`.trim();

document.addEventListener('DOMContentLoaded', () => {
  let promptInput, sendBtn, chatBody, clearBtn, newChatBtn, historyList, searchHistoryInput;

  // Điền Key Mistral của em vào đây
  const MISTRAL_API_KEY = "FVYswNhYiJNkmiwR3LqOJhEe5wx6pKJ8";

  let conversationHistory = [];
  let savedHistory = JSON.parse(localStorage.getItem('luna_chat_history') || '[]');

  function appendMessage(sender, text, roleClass) {
    if (!chatBody) return;
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${roleClass} mb-3`;
    
    const formattedContent = window.marked ? window.marked.parse(text) : text;
    msgDiv.innerHTML = `<strong>${sender}:</strong> <div>${formattedContent}</div>`;
    chatBody.appendChild(msgDiv);
    chatBody.scrollTop = chatBody.scrollHeight;

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

  function saveToLocalStorage(userMsg, aiMsg) {
    const timestamp = new Date().toLocaleString('vi-VN');
    const chatSession = {
      id: Date.now(),
      title: userMsg.length > 30 ? userMsg.substring(0, 30) + '...' : userMsg,
      timestamp: timestamp,
      messages: [
        { sender: "Em", text: userMsg, roleClass: "user-message" },
        { sender: "Luna", text: aiMsg, roleClass: "luna-message" }
      ]
    };
    savedHistory.unshift(chatSession);
    localStorage.setItem('luna_chat_history', JSON.stringify(savedHistory));
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
      const role = msg.sender === "Em" ? "user" : "assistant";
      conversationHistory.push({ role: role, content: msg.text });
    });
  }

  // --- HÀM TRA CỨU DUCKDUCKGO (GỌI QUA LOCALHOST:3000) ---
  async function searchWeb(query) {
    try {
      const res = await fetch('http://localhost:3000/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
      });
      const data = await res.json();
      return data.context || '';
    } catch (e) {
      console.error("Lỗi kết nối Server Search:", e);
      return '';
    }
  }

  // --- HÀM GỬI TIN NHẮN TỚI MISTRAL API ---
  async function handleSend() {
    const question = promptInput ? promptInput.value.trim() : '';
    if (!question) return;

    appendMessage("Em", question, "user-message");
    if (promptInput) promptInput.value = '';

    const needsSearch = /ai là|thông tin|là gì|ai|tìm|thời tiết|tin tức|mới nhất|tiểu sử|nguyên văn|văn bản|hán việt|nối/i.test(question);
    let searchContext = "";

    if (needsSearch) {
      searchContext = await searchWeb(question);
    }

    const finalPrompt = searchContext 
      ? `[Thông tin tra cứu từ DuckDuckGo]:\n${searchContext}\n\n[Yêu cầu của người dùng]: ${question}`
      : question;

    conversationHistory.push({ role: 'user', content: finalPrompt });

    try {
      const apiMessages = [
        { role: 'system', content: sysPrompt },
        ...conversationHistory
      ];

      const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${MISTRAL_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'mistral-small-latest', 
          messages: apiMessages,
          temperature: 0.3 // Giảm tính sáng tạo để AI bám sát dữ kiện lịch sử/khoa học
        })
      });

      const data = await response.json();

      if (!response.ok || data.error) {
      console.error("Chi tiết lỗi từ Mistral:", data); // Thêm dòng này để xem báo lỗi cụ thể
      throw new Error(data.error?.message || "Lỗi kết nối Mistral API");
  }
      
      // Trả lại câu hỏi gốc (ẩn context tra cứu) để lưu vào lịch sử cho gọn
      conversationHistory[conversationHistory.length - 1].content = question;
      conversationHistory.push({ role: 'assistant', content: replyText });

      appendMessage("Luna", replyText, "luna-message");
      saveToLocalStorage(question, replyText);

    } catch (error) {
      console.error("Lỗi API:", error);
      appendMessage("Hệ thống", "Có lỗi xảy ra. Nhớ bật server backend và kiểm tra lại API Key nhé!", "system-message");
      conversationHistory.pop();
    }
  }

  function resetChat() {
    if (chatBody) chatBody.innerHTML = '';
    conversationHistory = [];
  }

  function clearAllHistory() {
    if (confirm("Em có chắc muốn xóa toàn bộ lịch sử trò chuyện không?")) {
      localStorage.removeItem('luna_chat_history');
      savedHistory = [];
      resetChat();
      renderHistorySidebar();
    }
  }

  function resyncElements() {
    promptInput = document.getElementById('prompt');
    sendBtn = document.getElementById('sendBtn');
    chatBody = document.getElementById('chatBody');
    clearBtn = document.getElementById('clearBtn') || document.getElementById('clearHistoryBtn');
    newChatBtn = document.getElementById('newChatBtn');
    historyList = document.getElementById('historyList');
    searchHistoryInput = document.getElementById('searchHistory');

    if (sendBtn) {
      sendBtn.removeEventListener('click', handleSend);
      sendBtn.addEventListener('click', handleSend);
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