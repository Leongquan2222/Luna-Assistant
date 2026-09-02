// -------------------------
// THEME SWITCHER HANDLER
// -------------------------

const themeSelect = document.getElementById("themeSelect");
const themeStyle = document.getElementById("theme-style");

// 1. Tải theme đã lưu từ LocalStorage (nếu có)
const savedTheme = localStorage.getItem("selectedTheme");
if (savedTheme && themeStyle) {
    themeStyle.setAttribute("href", savedTheme);
    if (themeSelect) themeSelect.value = savedTheme;
}

// 2. Lắng nghe sự kiện đổi theme
if (themeSelect && themeStyle) {
    themeSelect.addEventListener("change", () => {
        const selectedCss = themeSelect.value;
        themeStyle.setAttribute("href", selectedCss);
        localStorage.setItem("selectedTheme", selectedCss);
    });
}