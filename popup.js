document.addEventListener('DOMContentLoaded', function () {
    // Khai báo các đối tượng giao diện
    const analyzeBtn = document.getElementById('analyzeBtn');
    const playPauseBtn = document.getElementById('playPauseBtn');
    const stopBtn = document.getElementById('stopBtn');
    const copyBtn = document.getElementById('copyBtn');
    const resultBox = document.getElementById('result-box');
    
    // Gemini
    const apiKeyInput = document.getElementById('apiKey');
    const saveKeyBtn = document.getElementById('saveKeyBtn');
    const getKeyBtn = document.getElementById('getKeyBtn');

    // Google TTS
    const googleTtsApiKeyInput = document.getElementById('googleTtsApiKey');
    const saveGoogleTtsBtn = document.getElementById('saveGoogleTtsBtn');
    const ttsEngineSelect = document.getElementById('ttsEngine');

    // Prompt
    const promptEditor = document.getElementById('promptEditor');
    const savePromptBtn = document.getElementById('savePromptBtn');
    const resetPromptBtn = document.getElementById('resetPromptBtn');

    let selectedText = '';
    let utterance = null;
    let audioContext = null;
    let audioSource = null;
    let port = null;

    // --- CÁC HÀM TẢI VÀ LƯU KEY ---

    // Tải các key đã lưu khi mở popup
    chrome.storage.sync.get(['geminiApiKey', 'googleTtsConfig', 'ttsEngine', 'customPrompt'], function (result) {
        if (result.geminiApiKey) {
            apiKeyInput.value = result.geminiApiKey;
        }
        if (result.googleTtsConfig) {
            googleTtsApiKeyInput.value = result.googleTtsConfig.apiKey || '';
        }
        if (result.ttsEngine) {
            ttsEngineSelect.value = result.ttsEngine;
        }
        
        // Tải prompt từ storage hoặc từ file
        if (result.customPrompt) {
            promptEditor.value = result.customPrompt;
        } else {
            // Tải prompt mặc định từ file
            loadDefaultPrompt();
        }
    });

    // Lưu Gemini API key
    saveKeyBtn.addEventListener('click', function () {
        const apiKey = apiKeyInput.value.trim();
        if (apiKey) {
            chrome.storage.sync.set({ geminiApiKey: apiKey }, function () {
                resultBox.textContent = 'Đã lưu Gemini API Key!';
                setTimeout(() => { resultBox.textContent = 'Trạng thái: Sẵn sàng.'; }, 2000);
            });
        }
    });
    
    // Mở trang lấy Gemini API key
    getKeyBtn.addEventListener('click', function() {
        chrome.tabs.create({ url: 'https://aistudio.google.com/apikey' });
    });
    
    // Lưu Google TTS config
    saveGoogleTtsBtn.addEventListener('click', function() {
        const config = {
            apiKey: googleTtsApiKeyInput.value.trim()
        };
        if (config.apiKey) {
            chrome.storage.sync.set({ googleTtsConfig: config }, function() {
                resultBox.textContent = 'Đã lưu Google TTS Key thành công!';
                setTimeout(() => { resultBox.textContent = 'Trạng thái: Sẵn sàng.'; }, 2000);
            });
        }
    });
    
    // Lưu lựa chọn công cụ TTS
    ttsEngineSelect.addEventListener('change', function() {
        chrome.storage.sync.set({ ttsEngine: this.value });
    });

    // Lưu prompt tùy chỉnh
    savePromptBtn.addEventListener('click', function() {
        const customPrompt = promptEditor.value.trim();
        if (customPrompt) {
            chrome.storage.sync.set({ customPrompt: customPrompt }, function() {
                resultBox.textContent = 'Đã lưu prompt thành công!';
                setTimeout(() => { resultBox.textContent = 'Trạng thái: Sẵn sàng.'; }, 2000);
            });
        }
    });

    // Khôi phục prompt mặc định
    resetPromptBtn.addEventListener('click', function() {
        loadDefaultPrompt();
        chrome.storage.sync.remove('customPrompt', function() {
            resultBox.textContent = 'Đã khôi phục prompt mặc định!';
            setTimeout(() => { resultBox.textContent = 'Trạng thái: Sẵn sàng.'; }, 2000);
        });
    });

    // Tải prompt mặc định từ file
    function loadDefaultPrompt() {
        fetch('prompt.txt')
            .then(response => {
                if (!response.ok) {
                    throw new Error('Không thể tải file prompt.txt');
                }
                return response.text();
            })
            .then(text => {
                promptEditor.value = text;
            })
            .catch(error => {
                console.error('Lỗi khi tải prompt:', error);
                promptEditor.value = 'Lỗi khi tải prompt. Vui lòng kiểm tra file prompt.txt';
            });
    }

    // --- XỬ LÝ TIN NHẮN TỪ BACKGROUND/CONTENT SCRIPT ---
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.type === "CONTENT_RESULT") {
            selectedText = request.content;
            resultBox.textContent = "Đã lấy nội dung thơ. Sẵn sàng để bình luận.";
            analyzeBtn.disabled = false;
        } else if (request.type === "ANALYSIS_RESULT") {
            if (request.success) {
                resultBox.textContent = request.analysis;
                // Tự động sao chép kết quả vào clipboard
                try {
                    const textArea = document.createElement('textarea');
                    textArea.value = request.analysis;
                    textArea.style.position = 'fixed';
                    textArea.style.left = '-999999px';
                    textArea.style.top = '-999999px';
                    document.body.appendChild(textArea);
                    textArea.focus();
                    textArea.select();
                    document.execCommand('copy');
                    document.body.removeChild(textArea);
                    copyBtn.textContent = '✓ Đã sao chép';
                    setTimeout(() => { copyBtn.textContent = 'Sao chép kết quả'; }, 2000);
                } catch (err) {
                    console.error('Lỗi khi sao chép:', err);
                }
            } else {
                resultBox.textContent = `Lỗi bình luận: ${request.error}`;
            }
            analyzeBtn.textContent = 'Bình thơ đã chọn';
            analyzeBtn.disabled = false;
        } else if (request.type === "TTS_RESULT") {
            if (request.success) {
                playAudioFromBase64(request.audioData);
            } else {
                resultBox.textContent = `Lỗi đọc: ${request.error}`;
                resetPlayButton();
            }
        }
    });
    
    // Xử lý tin nhắn từ background script
    function handleMessage(message) {
        if (message.type === "ANALYSIS_RESULT") {
            if (message.success) {
                resultBox.textContent = message.analysis;
                // Tự động sao chép kết quả vào clipboard
                try {
                    const textArea = document.createElement('textarea');
                    textArea.value = message.analysis;
                    textArea.style.position = 'fixed';
                    textArea.style.left = '-999999px';
                    textArea.style.top = '-999999px';
                    document.body.appendChild(textArea);
                    textArea.focus();
                    textArea.select();
                    document.execCommand('copy');
                    document.body.removeChild(textArea);
                    copyBtn.textContent = '✓ Đã sao chép';
                    setTimeout(() => { copyBtn.textContent = 'Sao chép kết quả'; }, 2000);
                } catch (err) {
                    console.error('Lỗi khi sao chép:', err);
                }
            } else {
                resultBox.textContent = `Lỗi bình luận: ${message.error}`;
            }
            analyzeBtn.textContent = 'Bình thơ đã chọn';
            analyzeBtn.disabled = false;
        } else if (message.type === "TTS_RESULT") {
            if (message.success) {
                playAudioFromBase64(message.audioData);
            } else {
                resultBox.textContent = `Lỗi đọc: ${message.error}`;
                resetPlayButton();
            }
        }
    }
    
    // Khởi tạo kết nối với background script
    function initializeConnection() {
        try {
            port = chrome.runtime.connect({ name: "popup" });
            port.onMessage.addListener(handleMessage);
            
            // Xử lý khi kết nối bị đóng
            port.onDisconnect.addListener(() => {
                console.log("Port bị ngắt kết nối");
                port = null;
            });
            
            return port;
        } catch (error) {
            console.error("Lỗi khi kết nối port:", error);
            port = null;
            return null;
        }
    }
    
    // Đảm bảo kết nối được thiết lập
    function ensureConnected() {
        if (!port || port.error) {
            return initializeConnection();
        }
        return port;
    }
    
    // Tạo kết nối với background script khi popup mở
    ensureConnected();
    
    // Sự kiện nhấn nút Bình thơ
    analyzeBtn.addEventListener('click', function () {
        stopReading(); // Dừng đọc nếu đang đọc
        chrome.storage.sync.get(['geminiApiKey', 'customPrompt'], function (result) {
            if (!result.geminiApiKey) {
                resultBox.textContent = 'Vui lòng nhập và lưu Gemini API Key.';
                return;
            }
            if (!selectedText) {
                // Lấy nội dung đã chọn từ trang hiện tại
                chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
                    if (tabs[0] && tabs[0].id) {
                        chrome.scripting.executeScript({
                            target: { tabId: tabs[0].id },
                            function: getSelectedText
                        }).then(results => {
                            if (results && results[0] && results[0].result) {
                                selectedText = results[0].result;
                                if (selectedText) {
                                    sendAnalysisRequest(result.geminiApiKey, selectedText, result.customPrompt || promptEditor.value);
                                } else {
                                    resultBox.textContent = "Vui lòng chọn văn bản thơ trước khi bình luận.";
                                }
                            } else {
                                resultBox.textContent = "Không thể lấy văn bản đã chọn. Vui lòng thử lại.";
                            }
                        }).catch(err => {
                            resultBox.textContent = "Lỗi: " + err.message;
                        });
                    }
                });
            } else {
                sendAnalysisRequest(result.geminiApiKey, selectedText, result.customPrompt || promptEditor.value);
            }
        });
    });

    function sendAnalysisRequest(apiKey, text, prompt) {
        analyzeBtn.textContent = 'Đang xử lý...';
        analyzeBtn.disabled = true;
        
        // Đảm bảo kết nối được thiết lập trước khi gửi tin nhắn
        const activePort = ensureConnected();
        if (activePort) {
            // Gửi tin nhắn qua kết nối
            activePort.postMessage({
                type: "ANALYZE_REQUEST",
                apiKey: apiKey,
                content: text,
                prompt: prompt
            });
        } else {
            // Nếu không thể kết nối, sử dụng chrome.runtime.sendMessage thay thế
            chrome.runtime.sendMessage({
                type: "ANALYZE_REQUEST",
                apiKey: apiKey,
                content: text,
                prompt: prompt
            });
        }
    }

    // Hàm để lấy văn bản đã chọn từ trang web
    function getSelectedText() {
        return window.getSelection().toString();
    }

    // Sự kiện nhấn nút Sao chép
    copyBtn.addEventListener('click', function() {
        const textToCopy = resultBox.textContent;
        if (!textToCopy || textToCopy.startsWith("Trạng thái:") || textToCopy.startsWith("Lỗi")) {
            return;
        }
        
        try {
            const textArea = document.createElement('textarea');
            textArea.value = textToCopy;
            textArea.style.position = 'fixed';
            textArea.style.left = '-999999px';
            textArea.style.top = '-999999px';
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            copyBtn.textContent = '✓ Đã sao chép';
            setTimeout(() => { copyBtn.textContent = 'Sao chép kết quả'; }, 2000);
        } catch (err) {
            console.error('Lỗi khi sao chép:', err);
            resultBox.textContent = "Lỗi khi sao chép: " + err.message;
        }
    });

    // Sự kiện nhấn nút Đọc/Tạm dừng
    playPauseBtn.addEventListener('click', function() {
        const textToRead = resultBox.textContent;
        if (!textToRead || textToRead.startsWith("Trạng thái:") || textToRead.startsWith("Lỗi")) {
            return;
        }
        
        stopReading(); // Dừng mọi thứ trước khi bắt đầu

        if (ttsEngineSelect.value === 'browser') {
            if (speechSynthesis.paused) {
                speechSynthesis.resume();
                playPauseBtn.textContent = '⏸️ Tạm dừng';
            } else if (speechSynthesis.speaking) {
                speechSynthesis.pause();
                playPauseBtn.textContent = '▶️ Tiếp tục';
            } else {
                startBrowserReading(textToRead);
            }
        } else { // Google TTS
            chrome.storage.sync.get('googleTtsConfig', function(result) {
                if (!result.googleTtsConfig || !result.googleTtsConfig.apiKey) {
                    resultBox.textContent = "Vui lòng nhập và lưu Google Cloud API Key.";
                    return;
                }
                playPauseBtn.disabled = true;
                playPauseBtn.textContent = 'Đang tải...';
                
                // Đảm bảo port kết nối trước khi gửi tin nhắn
                const activePort = ensureConnected();
                if (activePort) {
                    activePort.postMessage({
                        type: "TTS_REQUEST",
                        config: result.googleTtsConfig,
                        text: textToRead
                    });
                } else {
                    // Nếu không thể kết nối, sử dụng chrome.runtime.sendMessage thay thế
                    chrome.runtime.sendMessage({
                        type: "TTS_REQUEST",
                        config: result.googleTtsConfig,
                        text: textToRead
                    });
                }
            });
        }
    });

    // Sự kiện nhấn nút Dừng
    stopBtn.addEventListener('click', function() {
        stopReading();
    });

    // --- CÁC HÀM ĐIỀU KHIỂN ĐỌC ---

    function startBrowserReading(text) {
        utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'vi-VN';
        utterance.onend = function() {
            resetPlayButton();
        };
        utterance.onerror = function(event) {
            resultBox.textContent = "Lỗi giọng đọc trình duyệt: " + event.error;
            resetPlayButton();
        }
        speechSynthesis.speak(utterance);
        playPauseBtn.textContent = '⏸️ Tạm dừng';
    }

    function stopBrowserReading() {
        if (speechSynthesis.speaking || speechSynthesis.paused) {
            speechSynthesis.cancel();
        }
    }
    
    function playAudioFromBase64(base64String) {
        try {
            if (audioSource) {
                audioSource.stop();
            }
            if (audioContext) {
                audioContext.close();
            }
            
            // Tạo AudioContext mới chỉ khi cần thiết
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            // Sử dụng Uint8Array trực tiếp từ base64
            const binaryString = atob(base64String);
            const len = binaryString.length;
            const bytes = new Uint8Array(len);
            
            // Tối ưu vòng lặp
            for (let i = 0; i < len; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            
            // Sử dụng Promise để xử lý decodeAudioData
            audioContext.decodeAudioData(bytes.buffer)
                .then(buffer => {
                    audioSource = audioContext.createBufferSource();
                    audioSource.buffer = buffer;
                    audioSource.connect(audioContext.destination);
                    audioSource.start(0);
                    playPauseBtn.textContent = '⏹️ Dừng';
                    playPauseBtn.disabled = false;
                    audioSource.onended = resetPlayButton;
                })
                .catch(err => {
                    console.error('Lỗi giải mã audio:', err);
                    resultBox.textContent = 'Lỗi giải mã audio.';
                    resetPlayButton();
                });
        } catch (error) {
            console.error('Lỗi khi phát audio:', error);
            resultBox.textContent = 'Lỗi phát audio.';
            resetPlayButton();
        }
    }

    function stopAudioPlayback() {
        if (audioSource) {
            audioSource.stop();
            audioSource = null;
        }
        if (audioContext) {
            audioContext.close();
            audioContext = null;
        }
    }

    function stopReading() {
        stopBrowserReading();
        stopAudioPlayback();
        resetPlayButton();
    }
    
    function resetPlayButton() {
        playPauseBtn.textContent = '▶️ Đọc';
        playPauseBtn.disabled = false;
    }

    // Kiểm tra xem có kết quả bình luận từ context menu không
    chrome.storage.local.get(['contextMenuAnalysis'], function(result) {
        if (result.contextMenuAnalysis) {
            // Hiển thị kết quả bình luận
            resultBox.textContent = result.contextMenuAnalysis;
            // Tự động sao chép kết quả vào clipboard
            try {
                const textArea = document.createElement('textarea');
                textArea.value = result.contextMenuAnalysis;
                textArea.style.position = 'fixed';
                textArea.style.left = '-999999px';
                textArea.style.top = '-999999px';
                document.body.appendChild(textArea);
                textArea.focus();
                textArea.select();
                document.execCommand('copy');
                document.body.removeChild(textArea);
                copyBtn.textContent = '✓ Đã sao chép';
                setTimeout(() => { copyBtn.textContent = 'Sao chép kết quả'; }, 2000);
            } catch (err) {
                console.error('Lỗi khi sao chép:', err);
            }
            // Xóa kết quả từ storage
            chrome.storage.local.remove(['contextMenuAnalysis']);
        }
    });
});