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
5. Trả lời linh hoạt theo ngôn ngữ người dùng nói.

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

  // Key Cohere & Tavily API Config
  const COHERE_API_KEY = localStorage.getItem('cohere_key') || "bUBuU1bXq3kB5aaK5eiC6K0wiBpigLts1BicWwWg";
  const TAVILY_API_KEY = "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"; // Dán Key Tavily vào đây

  let conversationHistory = [];

  // Khai báo cấu trúc Tool cho Cohere API v1
  const searchTool = {
    name: "web_search",
    description: "Tìm kiếm thông tin thực tế khi người dùng hỏi tin tức, văn bản pháp luật, dữ liệu thời gian thực.",
    parameter_definitions: {
      query: {
        description: "Từ khóa tìm kiếm trên web",
        type: "str",
        required: true
      }
    }
  };

  // Hàm gọi Tavily Search API
  async function fetchTavilyResults(searchQuery) {
    try {
      const res = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          api_key: TAVILY_API_KEY,
          query: searchQuery,
          search_depth: "basic",
          max_results: 3
        })
      });

      const data = await res.json();
      if (!data.results || data.results.length === 0) return "Không tìm thấy thông tin phù hợp.";

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

  // --- HÀM GỬI TIN NHẮN TỚI COHERE V1 + TAVILY FUNCTION CALLING ---
  async function handleSend() {
    const question = promptInput ? promptInput.value.trim() : '';
    if (!question) return;

    appendMessage("Em", question, "user-message");
    if (promptInput) promptInput.value = '';

    const formattedHistory = conversationHistory.map(item => ({
      role: item.role === 'USER' ? 'USER' : 'CHATBOT',
      message: item.message
    }));

    try {
      // Bước 1: Gửi request ban đầu cho Cohere v1
      let payload = {
        model: 'command-r-plus-08-2024',
        preamble: sysPrompt,
        message: question,
        chat_history: formattedHistory,
        tools: [searchTool],
        temperature: 0.1
      };

      let response = await fetch('https://api.cohere.com/v1/chat', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${COHERE_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      let data = await response.json();

      // Bước 2: Kiểm tra nếu Cohere yêu cầu tra cứu web
      if (data.tool_calls && data.tool_calls.length > 0) {
        const call = data.tool_calls[0];
        if (call.name === 'web_search') {
          const searchQuery = call.parameters.query;
          console.log("Luna đang tra cứu Tavily với từ khóa:", searchQuery);
          
          // Gọi Tavily API lấy thông tin
          const searchResults = await fetchTavilyResults(searchQuery);

          // Bước 3: Gửi kết quả về cho Cohere tổng hợp
          // Bước 3: Gửi kết quả về cho Cohere tổng hợp (Đã sửa lỗi payload)
          const secondPayload = {
            model: 'command-r-plus-08-2024',
            preamble: sysPrompt,
            chat_history: formattedHistory,
            tools: [searchTool],
            tool_results: [
              {
                call: call,
                outputs: [{ results: searchResults }]
              }
            ],
            temperature: 0.1
          };

          response = await fetch('https://api.cohere.com/v1/chat', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${COHERE_API_KEY}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(secondPayload)
          });

          data = await response.json();
        }
      }

      if (!response.ok || !data.text) {
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
