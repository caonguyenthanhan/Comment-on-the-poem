// Tạo context menu khi extension được cài đặt
chrome.runtime.onInstalled.addListener(() => {
  // Menu bình thơ cho văn bản đã chọn
  chrome.contextMenus.create({
    id: "analyzePoem",
    title: "Bình thơ với Gemini",
    contexts: ["selection"]
  });
});

// Xử lý khi người dùng nhấp vào context menu
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "analyzePoem" && info.selectionText) {
    // Lấy API key và prompt từ storage
    chrome.storage.sync.get(['geminiApiKey', 'customPrompt'], function(result) {
      if (result.geminiApiKey) {
        // Tải prompt mặc định nếu không có prompt tùy chỉnh
        if (!result.customPrompt) {
          fetch(chrome.runtime.getURL('prompt.txt'))
            .then(response => response.text())
            .then(promptText => {
              // Gọi API để bình luận thơ đã chọn
              callGeminiApi(result.geminiApiKey, info.selectionText, promptText, true);
            })
            .catch(error => {
              console.error("Lỗi khi tải prompt:", error);
              // Nếu không tải được prompt, sử dụng prompt mặc định
              const defaultPrompt = "Bạn là một nhà phê bình văn học chuyên về thơ ca Việt Nam. Hãy phân tích và bình luận bài thơ sau đây.";
              callGeminiApi(result.geminiApiKey, info.selectionText, defaultPrompt, true);
            });
        } else {
          // Sử dụng prompt tùy chỉnh
          callGeminiApi(result.geminiApiKey, info.selectionText, result.customPrompt, true);
        }
        
        // Thông báo cho người dùng
        chrome.action.setBadgeText({ text: "...", tabId: tab.id });
        chrome.action.setBadgeBackgroundColor({ color: "#4285F4", tabId: tab.id });
        
        // Xóa badge sau 3 giây
        setTimeout(() => {
          chrome.action.setBadgeText({ text: "", tabId: tab.id });
        }, 3000);
      } else {
        // Thông báo nếu chưa có API key
        chrome.tabs.sendMessage(tab.id, { type: "SHOW_NOTIFICATION", message: "Vui lòng nhập Gemini API Key trong popup của extension." });
        chrome.action.openPopup();
      }
    });
  }
});

// Lắng nghe tin nhắn
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "ANALYZE_REQUEST") {
    // Xử lý không đồng bộ và gửi phản hồi ngay lập tức
    callGeminiApi(request.apiKey, request.content, request.prompt)
      .catch(error => console.error("Lỗi khi gọi Gemini API:", error));
    // Không trả về true, không giữ kênh tin nhắn mở
    return false;
  } else if (request.type === "TTS_REQUEST") {
    // Xử lý không đồng bộ và gửi phản hồi ngay lập tức
    callGoogleTtsApi(request.config, request.text)
      .catch(error => console.error("Lỗi khi gọi Google TTS API:", error));
    // Không trả về true, không giữ kênh tin nhắn mở
    return false;
  }
});

// --- HÀM GỌI API GEMINI ---
async function callGeminiApi(apiKey, poemText, promptTemplate, fromContextMenu = false, port = null) {
  const apiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`;
  
  // Thay thế placeholder trong prompt template
  const prompt = promptTemplate.replace('{poem}', poemText);

  try {
    const response = await fetch(apiEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        safetySettings: [
          { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
        ]
      })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(`Lỗi API (${response.status}): ${data.error?.message || 'Unknown error'}`);
    }

    const analysis = data.candidates[0].content.parts[0].text;
    
    // Nếu được gọi từ context menu, lưu kết quả vào storage và mở popup
    if (fromContextMenu) {
      // Lưu kết quả bình luận vào storage
      chrome.storage.local.set({ contextMenuAnalysis: analysis.trim() }, function() {
        // Mở popup
        chrome.action.openPopup();
      });
    } else {
      // Gửi kết quả về popup như bình thường
      if (port) {
        port.postMessage({ type: "ANALYSIS_RESULT", success: true, analysis: analysis.trim() });
      } else {
        chrome.runtime.sendMessage({ type: "ANALYSIS_RESULT", success: true, analysis: analysis.trim() });
      }
    }

  } catch (error) {
    console.error("Lỗi khi gọi Gemini API:", error);
    if (fromContextMenu) {
      // Lưu thông báo lỗi vào storage
      chrome.storage.local.set({ contextMenuAnalysis: `Lỗi khi bình luận: ${error.message}` }, function() {
        // Mở popup
        chrome.action.openPopup();
      });
    } else {
      if (port) {
        port.postMessage({ type: "ANALYSIS_RESULT", success: false, error: error.message });
      } else {
        chrome.runtime.sendMessage({ type: "ANALYSIS_RESULT", success: false, error: error.message });
      }
    }
  }
}

// --- HÀM GỌI API GOOGLE TTS ---
// Thêm bộ nhớ đệm cho kết quả TTS
const ttsCache = new Map();

async function callGoogleTtsApi(config, text, port = null) {
  // Kiểm tra cache
  const cacheKey = `${config.apiKey}_${text}`;
  if (ttsCache.has(cacheKey)) {
    const cachedAudio = ttsCache.get(cacheKey);
    if (port) {
      port.postMessage({ type: "TTS_RESULT", success: true, audioData: cachedAudio });
    } else {
      chrome.runtime.sendMessage({ type: "TTS_RESULT", success: true, audioData: cachedAudio });
    }
    return;
  }
  
  // Lấy API key từ config
  const { apiKey } = config;
  const url = `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`;

  try {
    // Chuẩn bị dữ liệu cho request
    const requestData = {
      input: {
        text: text
      },
      voice: {
        languageCode: "vi-VN",
        name: "vi-VN-Wavenet-A", // Giọng nữ Wavenet chất lượng cao
        ssmlGender: "FEMALE"
      },
      audioConfig: {
        audioEncoding: "MP3",
        speakingRate: 1.0,
        pitch: 0.0
      }
    };

    // Gửi request đến Google Cloud TTS API
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestData)
    });

    // Xử lý response
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Lỗi API (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    
    // Lưu vào cache
    ttsCache.set(cacheKey, data.audioContent);
    // Giới hạn kích thước cache
    if (ttsCache.size > 20) {
      const firstKey = ttsCache.keys().next().value;
      ttsCache.delete(firstKey);
    }
    
    // Gửi kết quả
    if (port) {
      port.postMessage({ type: "TTS_RESULT", success: true, audioData: data.audioContent });
    } else {
      chrome.runtime.sendMessage({ type: "TTS_RESULT", success: true, audioData: data.audioContent });
    }
  } catch (error) {
    console.error("Lỗi khi gọi Google TTS API:", error);
    if (port) {
      port.postMessage({ type: "TTS_RESULT", success: false, error: error.message });
    } else {
      chrome.runtime.sendMessage({ type: "TTS_RESULT", success: false, error: error.message });
    }
  }
}

// Cập nhật xử lý kết nối từ popup
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === "popup") {
    // Xử lý khi kết nối bị đóng
    port.onDisconnect.addListener(() => {
      console.log("Kết nối với popup bị đóng");
    });
    
    port.onMessage.addListener((request) => {
      if (request.type === "ANALYZE_REQUEST") {
        callGeminiApi(request.apiKey, request.content, request.prompt, false, port);
      } else if (request.type === "TTS_REQUEST") {
        callGoogleTtsApi(request.config, request.text, port);
      }
    });
  }
});