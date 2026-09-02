const express = require('express');
const cors = require('cors');
const { search } = require('duckduckgo-search-api');

const app = express();
app.use(cors());
app.use(express.json());

app.post('/api/search', async (req, res) => {
  try {
    const { query } = req.body;
    if (!query) return res.json({ context: '' });

    // Gọi DuckDuckGo Search
    const searchResults = await search(query, {
      safeSearch: 'strict'
    });

    // Trích xuất 3 kết quả đầu tiên
    const context = searchResults.results.slice(0, 3)
      .map(r => `Nguồn (${r.title}): ${r.snippet}`)
      .join('\n\n');

    res.json({ context });
  } catch (error) {
    console.error("Lỗi DuckDuckGo Search:", error);
    res.json({ context: '' });
  }
});

app.listen(3000, () => {
  console.log('Server DuckDuckGo Search running on port 3000');
});