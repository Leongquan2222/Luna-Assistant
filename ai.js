// System Prompt siết chặt vai trò và tính chính xác kiến thức
const sysPrompt = window.SystemPrompt || `
[VAI TRÒ VÀ BẢN DẠNG]
Bạn là Luna - một nữ gia sư AI thông minh, sắc sảo, điềm tĩnh và chính xác.
Nhiệm vụ: Hướng dẫn người dùng học tập (Toán, Tiếng Anh, Lập trình, Khoa học).

[QUY TẮC PHẢN HỒI & XƯNG HÔ - BẮT BUỘC TRUYỆT ĐỐI]:
1. Xưng hô: Luôn xưng "chị" (hoặc "Luna") và gọi người dùng là "em".
2. KHÔNG DÙNG TỪ KÍNH NGỮ BỀ DƯỚI: Tuyệt đối KHÔNG bao giờ dùng từ "ạ", "dạ" ở bất kỳ đâu.
3. Phong cách: Ngắn gọn, súc tích, đi thẳng vào vấn đề, rõ ràng, không dài dòng lê thê.
4. Lịch sử/Văn học/Khoa học: Dựa vào tri thức chuẩn xác, KHÔNG tự bịa đặt hay râu ông nọ chắp cằm bà kia.
5.Trả lời linh hoạt theo ngôn ngữ người dùng nói.

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

  // Lấy API Key Cohere từ localStorage hoặc gán Key mặc định
  const COHERE_API_KEY = localStorage.getItem('cohere_key') || "bUBuU1bXq3kB5aaK5eiC6K0wiBpigLts1BicWwWg";

  // Lịch sử cuộc trò chuyện chuẩn Cohere ({ role: 'USER' | 'CHATBOT', message: '' })
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
    
    // Cuộn mượt xuống cuối khung chat
    chatBody.scrollTo({
      top: chatBody.scrollHeight,
      behavior: 'smooth'
    });

    // Render LaTeX bằng KaTeX
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

  // --- HÀM GỬI TIN NHẮN TỚI COHERE API ---
  async function handleSend() {
    const question = promptInput ? promptInput.value.trim() : '';
    if (!question) return;

    appendMessage("Em", question, "user-message");
    if (promptInput) promptInput.value = '';

    try {
      const response = await fetch('https://api.cohere.com/v1/chat', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${COHERE_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'command-a-03-2025',
          preamble: sysPrompt,
          message: question,
          chat_history: conversationHistory,
          connectors:[{id:"web-search"}],
          temperature: 0.1,// Để thấp để đảm bảo tính chính xác kiến thức SGK
          
        })
      });

      const data = await response.json();

      if (!response.ok || data.message) {
        console.error("Chi tiết lỗi từ Cohere:", data);
        throw new Error(data.message || "Lỗi kết nối Cohere API");
      }

      const replyText = data.text;

      // Cập nhật lịch sử hội thoại
      conversationHistory.push({ role: 'USER', message: question });
      conversationHistory.push({ role: 'CHATBOT', message: replyText });

      appendMessage("Luna", replyText, "luna-message");

    } catch (error) {
      console.error("Lỗi API:", error);
      appendMessage("Hệ thống", "Có lỗi xảy ra khi kết nối API. Em kiểm tra lại Key hoặc mạng nhé!", "system-message");
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
      promptInput.removeEventListener('keydown', promptKeypressHandler);
      promptInput.addEventListener('keydown', promptKeypressHandler);
    }
    if (newChatBtn) {
      newChatBtn.removeEventListener('click', resetChat);
      newChatBtn.addEventListener('click', resetChat);
    }
  }

  window.resyncElements = resyncElements;
  resyncElements();
});
