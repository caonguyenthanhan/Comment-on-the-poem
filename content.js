// Hàm trích xuất nội dung đã chọn từ trang web
function extractSelectedContent() {
  const selectedText = window.getSelection().toString().trim();
  if (selectedText) {
    return selectedText;
  }
  return null;
}

// Lắng nghe tin nhắn từ background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "GET_SELECTED_CONTENT") {
    const selectedContent = extractSelectedContent();
    sendResponse({ content: selectedContent });
  } else if (request.type === "SHOW_NOTIFICATION") {
    // Hiển thị thông báo trên trang web
    showNotification(request.message);
  }
  return true; // Giữ kênh tin nhắn mở cho phản hồi không đồng bộ
});

// Hàm hiển thị thông báo trên trang web
function showNotification(message) {
  // Kiểm tra xem đã có thông báo nào chưa
  let notification = document.getElementById('binhTho-notification');
  
  // Nếu chưa có, tạo mới
  if (!notification) {
    notification = document.createElement('div');
    notification.id = 'binhTho-notification';
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background-color: #4285F4;
      color: white;
      padding: 16px;
      border-radius: 8px;
      box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
      z-index: 10000;
      font-family: 'Roboto', sans-serif;
      max-width: 300px;
      opacity: 0;
      transition: opacity 0.3s ease-in-out;
    `;
    document.body.appendChild(notification);
  }
  
  // Cập nhật nội dung và hiển thị
  notification.textContent = message;
  notification.style.opacity = '1';
  
  // Tự động ẩn sau 3 giây
  setTimeout(() => {
    notification.style.opacity = '0';
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 300);
  }, 3000);
}