// Xử lý các phần tử có thể thu gọn
document.addEventListener('DOMContentLoaded', function() {
  var coll = document.getElementsByClassName("collapsible");
  
  // Khôi phục trạng thái của các phần tử có thể thu gọn từ localStorage
  chrome.storage.sync.get(['collapsibleState'], function(result) {
    var savedState = result.collapsibleState || {};
    
    // Nếu không có trạng thái đã lưu, hiển thị phần API Key mặc định
    if (Object.keys(savedState).length === 0) {
      var apiKeySection = document.querySelector('.collapsible');
      if (apiKeySection) {
        apiKeySection.classList.add("active");
        var content = apiKeySection.nextElementSibling;
        content.classList.add("show");
        content.style.maxHeight = content.scrollHeight + "px";
        
        // Lưu trạng thái mặc định
        savedState['collapsible-0'] = true;
        chrome.storage.sync.set({collapsibleState: savedState});
      }
    } else {
      // Khôi phục trạng thái đã lưu cho từng phần tử
      for (var i = 0; i < coll.length; i++) {
        var id = 'collapsible-' + i;
        if (savedState[id]) {
          coll[i].classList.add("active");
          var content = coll[i].nextElementSibling;
          content.classList.add("show");
          content.style.maxHeight = content.scrollHeight + "px";
        }
      }
    }
  });
  
  // Thêm sự kiện click cho từng phần tử
  for (var i = 0; i < coll.length; i++) {
    // Gán ID cho mỗi phần tử để dễ dàng lưu trạng thái
    coll[i].setAttribute('data-id', 'collapsible-' + i);
    
    coll[i].addEventListener("click", function() {
      this.classList.toggle("active");
      var content = this.nextElementSibling;
      var id = this.getAttribute('data-id');
      
      if (content.style.maxHeight) {
        content.style.maxHeight = null;
        content.classList.remove("show");
        
        // Lưu trạng thái đóng
        chrome.storage.sync.get(['collapsibleState'], function(result) {
          var state = result.collapsibleState || {};
          state[id] = false;
          chrome.storage.sync.set({collapsibleState: state});
        });
      } else {
        content.classList.add("show");
        content.style.maxHeight = content.scrollHeight + "px";
        
        // Lưu trạng thái mở
        chrome.storage.sync.get(['collapsibleState'], function(result) {
          var state = result.collapsibleState || {};
          state[id] = true;
          chrome.storage.sync.set({collapsibleState: state});
        });
      }
    });
  }
});