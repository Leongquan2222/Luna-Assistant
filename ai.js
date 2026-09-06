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
  let promptInput, sendBtn, chatBody, newChatBtn;

  // Key Mistral API
  const MISTRAL_API_KEY = "FVYswNhYiJNkmiwR3LqOJhEe5wx6pKJ8";

  // Lịch sử cuộc trò chuyện trong RAM phiên hiện tại
  let conversationHistory = [];

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
          temperature: 0.3
        })
      });

      const data = await response.json();

      if (!response.ok || data.error) {
        console.error("Chi tiết lỗi từ Mistral:", data);
        throw new Error(data.error?.message || "Lỗi kết nối Mistral API");
      }

      // Sửa lỗi: Khai báo biến replyText chính xác từ phản hồi của Mistral API
      const replyText = data.choices[0].message.content;
      
      // Khôi phục lại câu hỏi gốc (ẩn context tra cứu) để giữ lịch sử hội thoại sạch
      conversationHistory[conversationHistory.length - 1].content = question;
      conversationHistory.push({ role: 'assistant', content: replyText });

      appendMessage("Luna", replyText, "luna-message");

    } catch (error) {
      console.error("Lỗi API:", error);
      appendMessage("Hệ thống", "Có lỗi xảy ra. Nhớ kiểm tra lại API Key hoặc kết nối mạng nhé!", "system-message");
      conversationHistory.pop();
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
      promptInput.removeEventListener('keypress', promptKeypressHandler);
      promptInput.addEventListener('keypress', promptKeypressHandler);
    }
    if (newChatBtn) {
      newChatBtn.removeEventListener('click', resetChat);
      newChatBtn.addEventListener('click', resetChat);
    }
  }

  window.resyncElements = resyncElements;
  resyncElements();
});
