// Đọc SystemPrompt từ file systemprompt.js nếu có, hoặc dùng mặc định
const sysPrompt = window.SystemPrompt || `
Bạn là Luna - một nữ gia sư AI cực kỳ thông minh, sắc sảo, điềm tĩnh và có phần lạnh lùng, kiêu kỳ (phong cách Alya).
Nhiệm vụ: Hướng dẫn người dùng học tập (Toán, Tiếng Anh, Lập trình, Khoa học).

[QUY TẮC PHẢN HỒI & XƯNG HÔ - BẮT BUỘC]:
1. Xưng hô tuyệt đối: Luôn xưng "chị" (hoặc "Luna") và gọi người dùng là "em". BẤT KỂ người dùng xưng hô thế nào, KHÔNG BAO GIỜ xưng "em" hay dùng từ kính ngữ bề dưới như "ạ", "dạ".
2. Thái độ & Phong cách: 
   - Lạnh lùng, kiêu kỳ, nghiêm khắc và thẳng thắn. 
   - Ngắn gọn, súc tích, đi thẳng vào trọng tâm kiến thức, tuyệt đối không dài dòng lê thê hay xã giao thừa thãi.
   - Thỉnh thoảng có thể thêm cử chỉ kiêu hãnh hoặc lời thở dài nhẹ nhàng thể hiện sự nghiêm khắc (*khẽ thở dài*, *khoanh tay nhìn em*, *nhếch môi*).
3. Không biết thông tin: Thừa nhận thẳng thắn, lạnh lùng chỉ ra giới hạn và đề xuất hướng tìm kiếm chuẩn xác.
4. Trò chơi lịch sử/văn học: Dựa hoàn toàn vào thông tin tra cứu chuẩn xác, KHÔNG tự bịa nguyên văn.

[ĐỊNH DẠNG TOÁN / KHOA HỌC]:
1. BẮT BUỘC dùng LaTeX cho công thức.
2. Công thức inline (cùng dòng): Bọc trong 1 dấu $: $x + y = z$.
3. Công thức display (dòng riêng): Bọc trong 2 dấu $$ ở dòng riêng biệt. KHÔNG dùng ngoặc vuông [ ].
4. Giải toán từng bước: PHẢI xuống dòng riêng cho từng bước biến đổi, không viết dính liền.

[ĐỊNH DẠNG LẬP TRÌNH]:
Trình bày code sạch sẽ, chuẩn tối ưu trong block Markdown ```language ... ``` và giải thích logic cực kỳ ngắn gọn, sắc bén.
`.trim();

document.addEventListener('DOMContentLoaded', () => {
  let promptInput, sendBtn, chatBody, clearBtn, newChatBtn, historyList, searchHistoryInput;

  // Cấu hình Cohere API Key
  const COHERE_API_KEY = localStorage.getItem('cohere_key') || "cohere_RoxIYBTzRq274UDipBL4Uk1IwNSBtjEaVLYIFO6z22ucCp";

  let conversationHistory = [];
  let currentSessionId = null;

  // --- 1. MÃ HÓA & LƯU TRỮ THEO TÀI KHOẢN ---
  function getChatHistoryKey() {
    const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
    const userId = currentUser.email || currentUser.id || 'guest_user';
    const cleanId = userId.replace(/[^a-zA-Z0-9]/g, '_');
    return `luna_chat_history_${cleanId}`;
  }

  function getSavedHistory() {
    const key = getChatHistoryKey();
    return JSON.parse(localStorage.getItem(key) || '[]');
  }

  function saveToLocalStorage(userMsg, aiMsg) {
    const key = getChatHistoryKey();
    const savedHistory = getSavedHistory();
    const timestamp = new Date().toLocaleString('vi-VN');

    if (!currentSessionId) {
      currentSessionId = Date.now();
      const newSession = {
        id: currentSessionId,
        title: userMsg.length > 30 ? userMsg.substring(0, 30) + '...' : userMsg,
        timestamp: timestamp,
        messages: [
          { sender: "Em", text: userMsg, roleClass: "user-message" },
          { sender: "Luna", text: aiMsg, roleClass: "luna-message" }
        ]
      };
      savedHistory.unshift(newSession);
    } else {
      const sessionIndex = savedHistory.findIndex(s => s.id === currentSessionId);
      if (sessionIndex !== -1) {
        savedHistory[sessionIndex].messages.push(
          { sender: "Em", text: userMsg, roleClass: "user-message" },
          { sender: "Luna", text: aiMsg, roleClass: "luna-message" }
        );
        const [updatedSession] = savedHistory.splice(sessionIndex, 1);
        updatedSession.timestamp = timestamp;
        savedHistory.unshift(updatedSession);
      }
    }

    localStorage.setItem(key, JSON.stringify(savedHistory));
    renderHistorySidebar();
  }

  // --- 2. RENDER GIAO DIỆN & SIDEBAR ---
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

  function renderHistorySidebar(filterText = '') {
    if (!historyList) return;
    historyList.innerHTML = '';
    const savedHistory = getSavedHistory();
    const filtered = savedHistory.filter(item => 
      item.title.toLowerCase().includes(filterText.toLowerCase())
    );

    if (filtered.length === 0) {
      historyList.innerHTML = `<div class="text-muted p-2 small">Không có lịch sử</div>`;
      return;
    }

    filtered.forEach(session => {
      const item = document.createElement('div');
      const isActive = session.id === currentSessionId ? 'bg-secondary bg-opacity-25' : '';
      item.className = `history-item p-2 mb-1 border-bottom cursor-pointer rounded ${isActive}`;
      item.style.cursor = 'pointer';
      item.innerHTML = `<div class="fw-bold text-truncate text-light">${session.title}</div><div class="text-muted small" style="font-size: 0.75rem;">${session.timestamp}</div>`;
      item.addEventListener('click', () => loadChatSession(session));
      historyList.appendChild(item);
    });
  }

  function loadChatSession(session) {
    if (!chatBody) return;
    chatBody.innerHTML = '';
    conversationHistory = [];
    currentSessionId = session.id;

    session.messages.forEach(msg => {
      appendMessage(msg.sender, msg.text, msg.roleClass);
      // Chuyển đổi sang định dạng role của Cohere (USER & CHATBOT)
      const role = msg.sender === "Em" ? "USER" : "CHATBOT";
      conversationHistory.push({ role: role, message: msg.text });
    });

    renderHistorySidebar();
  }

  function resetChat() {
    if (chatBody) {
      chatBody.innerHTML = `
        <div class="message luna-message mb-3">
          <strong>Luna:</strong>
          <div>Chào em, em cần chị hỗ trợ gì hôm nay?</div>
        </div>
      `;
    }
    conversationHistory = [];
    currentSessionId = null;
    renderHistorySidebar();
  }

  function clearAllHistory() {
    if (confirm("Em có chắc muốn xóa toàn bộ lịch sử trò chuyện không?")) {
      localStorage.removeItem(getChatHistoryKey());
      resetChat();
      renderHistorySidebar();
    }
  }

  // --- 3. TRA CỨU WEB & COHERE API ---
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

    try {
      // Gọi Cohere Chat API
      const response = await fetch('https://api.cohere.com/v1/chat', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${COHERE_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'command-r-plus',
          preamble: sysPrompt,
          message: finalPrompt,
          chatHistory: conversationHistory,
          temperature: 0.3
        })
      });

      const data = await response.json();

      if (!response.ok || data.error) {
        console.error("Chi tiết lỗi từ Cohere:", data);
        throw new Error(data.message || "Lỗi kết nối Cohere API");
      }
      
      const replyText = data.text;

      // Lưu cuộc trò chuyện vào mảng history theo định dạng Cohere
      conversationHistory.push({ role: 'USER', message: question });
      conversationHistory.push({ role: 'CHATBOT', message: replyText });

      appendMessage("Luna", replyText, "luna-message");
      saveToLocalStorage(question, replyText);

    } catch (error) {
      console.error("Lỗi API:", error);
      appendMessage("Hệ thống", "Có lỗi xảy ra. Nhớ bật server backend và kiểm tra lại Cohere API Key nhé!", "system-message");
    }
  }

  // --- 4. EVENT HANDLERS ---
  function promptKeypressHandler(e) {
    if (e.key === 'Enter') handleSend();
  }

  function searchInputHandler(e) {
    renderHistorySidebar(e.target.value);
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
  resetChat();
});
