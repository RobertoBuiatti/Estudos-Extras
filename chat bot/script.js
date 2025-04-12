// Cache configuration
const CACHE_KEY = 'chatbot_cache';
const MAX_CACHE_SIZE = 50;

// Theme handling
function setTheme(isDark) {
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    const themeToggle = document.querySelector("#theme-toggle");
    themeToggle.textContent = isDark ? 'light_mode' : 'dark_mode';
}

// Initialize theme
const savedTheme = localStorage.getItem('theme') || 'light';
setTheme(savedTheme === 'dark');

// DOM Elements
const elements = {
    chatBody: document.querySelector(".chat-body"),
    messageInput: document.querySelector(".message-input"),
    sendMessageButton: document.querySelector("#send-message"),
    fileInput: document.querySelector("#file-input"),
    fileUploadWrapper: document.querySelector(".file-upload-wrapper"),
    fileCancelButton: document.querySelector("#file-cancel"),
    chatbotToggler: document.querySelector("#chatbot-toggler"),
    closeChatbot: document.querySelector("#close-chatbot"),
    themeToggle: document.querySelector("#theme-toggle"),
    // Elementos de áudio
    audioRecord: document.querySelector("#audio-record"),
    audioControls: document.querySelector(".recording-controls"),
    audioSend: document.querySelector("#audio-send"),
    audioCancel: document.querySelector("#audio-cancel"),
    recordTime: document.querySelector(".record-time")
};

// Theme toggle handler
elements.themeToggle.addEventListener("click", () => {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    setTheme(!isDark);
});

// Configuração da gravação de áudio
const audioConfig = {
    mediaRecorder: null,
    audioChunks: [],
    isRecording: false,
    startTime: 0,
    timerInterval: null
};

// API Configuration
const API_CONFIG = {
    url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
    key: ''
};

// Cache management
function loadChatHistory() {
    try {
        const cached = localStorage.getItem(CACHE_KEY);
        return cached ? JSON.parse(cached) : [];
    } catch (error) {
        console.error('Error loading chat history:', error);
        return [];
    }
}

// State management
const state = {
    isLoadingHistory: true,
    userData: {
        message: null,
        file: {
            data: null,
            mime_type: null
        }
    },
    chatHistory: [],
    initialInputHeight: elements.messageInput.clientHeight
};

// Initialize chat history
state.chatHistory = loadChatHistory();

// Load chat history visually
(async function initializeChatHistory() {
    try {
        elements.chatBody.classList.add('loading-history');
        const history = state.chatHistory;
        
        if (history.length > 0) {
            history.forEach(entry => {
                const isUser = entry.role === 'user';
                const messageContent = isUser ? getMessageContent() : getBotMessageTemplate();
                const messageDiv = createMessageElement(
                    messageContent,
                    isUser ? 'user-message' : 'bot-message',
                    'received'
                );
                
                const textElement = messageDiv.querySelector('.message-text');
                textElement.textContent = entry.parts[0].text;
                
                if (isUser) {
                    const statusDiv = document.createElement('div');
                    statusDiv.className = 'message-status';
                    statusDiv.textContent = ''; // Texto vazio pois usaremos ícones
                    messageDiv.appendChild(statusDiv);
                }
                
                elements.chatBody.appendChild(messageDiv);
            });
        }
    } catch (error) {
        console.error('Error initializing chat history:', error);
    } finally {
        elements.chatBody.classList.remove('loading-history');
        state.isLoadingHistory = false;
    }
})();


function saveChatHistory() {
    try {
        const historyToSave = state.chatHistory.slice(-MAX_CACHE_SIZE);
        localStorage.setItem(CACHE_KEY, JSON.stringify(historyToSave));
    } catch (error) {
        console.error('Error saving chat history:', error);
    }
}

// Cria o elemento de mensagem com classes dinâmicas
const createMessageElement = (content, ...classes) => {
	const div = document.createElement("div");
	div.classList.add("message", ...classes);
	div.innerHTML = content;
	return div;
};

// Optimized bot response generation with caching and debouncing
const generateBotResponse = async (incomingMessageDiv) => {
    const messageElement = incomingMessageDiv.querySelector(".message-text");
    const userMessage = state.userData.message;

    // Check cache for similar questions
    const cachedResponse = findCachedResponse(userMessage);
    if (cachedResponse) {
        updateUIWithResponse(messageElement, cachedResponse);
        return;
    }

    // Add user message to history
    const userEntry = {
        role: "user",
        parts: state.userData.file.data
            ? [
                { text: userMessage },
                {
                    inline_data: {
                        mime_type: state.userData.file.mime_type,
                        data: state.userData.file.data
                    }
                }
            ]
            : [{ text: userMessage }]
    };
    state.chatHistory.push(userEntry);

    messageElement.textContent = "Processing...";

    try {
        const response = await fetchBotResponse(userEntry);
        const apiResponse = response.candidates[0].content.parts[0].text
            .replace(/\*\*(.*?)\*\*/g, "$1")
            .trim();

        // Add bot response to history
        const botEntry = {
            role: "model",
            parts: [{ text: apiResponse }]
        };
        state.chatHistory.push(botEntry);

        // Update UI and cache
        updateUIWithResponse(messageElement, apiResponse);
        saveChatHistory();

    } catch (error) {
        console.error('Error generating response:', error);
        handleError(messageElement, error);
    } finally {
        cleanupAfterResponse(incomingMessageDiv);
    }
};

// Helper functions
function findCachedResponse(message) {
    const similarMessage = state.chatHistory.find(entry =>
        entry.role === "user" &&
        entry.parts[0].text.toLowerCase() === message.toLowerCase()
    );
    
    if (similarMessage) {
        const index = state.chatHistory.indexOf(similarMessage);
        if (index < state.chatHistory.length - 1) {
            return state.chatHistory[index + 1].parts[0].text;
        }
    }
    return null;
}

async function fetchBotResponse(userEntry) {
    const response = await fetch(`${API_CONFIG.url}?key=${API_CONFIG.key}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [...state.chatHistory] })
    });
    
    const data = await response.json();
    if (!response.ok) throw new Error(data.error.message);
    return data;
}

function updateUIWithResponse(element, text, isError = false) {
    element.innerText = text;
    element.innerHTML = element.innerText;
    
    const messageDiv = element.closest('.message');
    messageDiv.classList.remove('thinking', 'sending');
    
    const statusDiv = document.createElement('div');
    statusDiv.className = 'message-status';
    statusDiv.textContent = '';  // Texto vazio pois usaremos ícones
    
    if (isError) {
        messageDiv.classList.add('error');
    } else {
        messageDiv.classList.remove('sent');
        messageDiv.classList.add('received');
    }
    
    messageDiv.appendChild(statusDiv);
    elements.chatBody.scrollTop = elements.chatBody.scrollHeight;
}

function handleError(element, error) {
    updateUIWithResponse(element, error.message, true);
}

function cleanupAfterResponse(messageDiv) {
    state.userData.file.data = null;
    state.userData.file.mime_type = null;
    messageDiv.classList.remove("thinking");
    elements.chatBody.scrollTop = elements.chatBody.scrollHeight;
}

// Performance optimization utilities
function debounce(func, wait = 300) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Message handling
const handleOutgoingMessage = debounce((e) => {
    if (e) e.preventDefault();
    
    state.userData.message = elements.messageInput.value.trim();
    elements.messageInput.value = "";
    elements.fileUploadWrapper.classList.remove("file-uploaded");
    elements.messageInput.dispatchEvent(new Event("input"));

    const messageContent = getMessageContent();
    const outgoingMessageDiv = createMessageElement(messageContent, "user-message", "sending");
    
    const textElement = outgoingMessageDiv.querySelector(".message-text");
    textElement.textContent = state.userData.message;
    
    const statusDiv = document.createElement('div');
    statusDiv.className = 'message-status';
    statusDiv.textContent = '';  // Texto vazio pois usaremos ícones
    outgoingMessageDiv.appendChild(statusDiv);
    
    elements.chatBody.appendChild(outgoingMessageDiv);
    elements.chatBody.scrollTop = elements.chatBody.scrollHeight;

    // Simula a progressão de status da mensagem
    setTimeout(() => {
        outgoingMessageDiv.classList.remove('sending');
        outgoingMessageDiv.classList.add('sent');
    }, 500);

    // Simulate bot response with requestAnimationFrame for better performance
    requestAnimationFrame(() => {
        const messageContent = getBotMessageTemplate();
        const incomingMessageDiv = createMessageElement(messageContent, "bot-message", "thinking");
        elements.chatBody.appendChild(incomingMessageDiv);
        generateBotResponse(incomingMessageDiv);
        elements.chatBody.scrollTop = elements.chatBody.scrollHeight;
    });
});

// Event Listeners
elements.sendMessageButton.addEventListener("click", (e) => {
    e.preventDefault();
    if (elements.messageInput.value.trim()) handleOutgoingMessage();
});

elements.messageInput.addEventListener("keydown", (e) => {
    if (
        e.key === "Enter" &&
        !e.shiftKey &&
        elements.messageInput.value.trim() &&
        window.innerWidth > 768
    ) {
        e.preventDefault();
        handleOutgoingMessage();
    }
});

elements.messageInput.addEventListener("input", () => {
    const input = elements.messageInput;
    input.style.height = `${state.initialInputHeight}px`;
    input.style.height = `${input.scrollHeight}px`;
    document.querySelector(".chat-form").style.borderRadius =
        input.scrollHeight > state.initialInputHeight ? "15px" : "32px";
});

// Utility functions
function getMessageContent() {
    if (!state.userData.file.data) {
        return '<div class="message-text"></div>';
    }

    if (state.userData.file.mime_type.startsWith('audio/')) {
        return `
            <div class="message-text">🎤 Mensagem de áudio</div>
            <audio controls class="audio-player">
                <source src="data:${state.userData.file.mime_type};base64,${state.userData.file.data}" type="${state.userData.file.mime_type}">
            </audio>
        `;
    }

    return `
        <div class="message-text"></div>
        <img src="data:${state.userData.file.mime_type};base64,${state.userData.file.data}" alt="file" class="attachment">
    `;
}

function getBotMessageTemplate() {
    return `<svg class="bot-avatar" xmlns="http://www.w3.org/2000/svg" width="35" height="35" viewBox="0 0 1024 1024">
        <path d="M738.3 287.6H285.7c-59 0-106.8 47.8-106.8 106.8v303.1c0 59 47.8 106.8 106.8 106.8h81.5v111.1c0 .7.8 1.1 1.4.7l166.9-110.6 41.8-.8h117.4l43.6-.4c59 0 106.8-47.8 106.8-106.8V394.5c0-59-47.8-106.9-106.8-106.9zM351.7 448.2c0-29.5 23.9-53.5 53.5-53.5s53.5 23.9 53.5 53.5-23.9 53.5-53.5 53.5-53.5-23.9-53.5-53.5zm157.9 267.1c-67.8 0-123.8-47.5-132.3-109h264.6c-8.6 61.5-64.5 109-132.3 109zm110-213.7c-29.5 0-53.5-23.9-53.5-53.5s23.9-53.5 53.5-53.5 53.5 23.9 53.5 53.5-23.9 53.5-53.5 53.5zM867.2 644.5V453.1h26.5c19.4 0 35.1 15.7 35.1 35.1v121.1c0 19.4-15.7 35.1-35.1 35.1h-26.5zM95.2 609.4V488.2c0-19.4 15.7-35.1 35.1-35.1h26.5v191.3h-26.5c-19.4 0-35.1-15.7-35.1-35.1zM561.5 149.6c0 23.4-15.6 43.3-36.9 49.7v44.9h-30v-44.9c-21.4-6.5-36.9-26.3-36.9-49.7 0-28.6 23.3-51.9 51.9-51.9s51.9 23.3 51.9 51.9z"></path>
    </svg>
    <div class="message-text">
        <div class="thinking-indicator">
            <div class="dot"></div>
            <div class="dot"></div>
            <div class="dot"></div>
        </div>
    </div>`;
}

// File handling
elements.fileInput.addEventListener("change", async (e) => {
    const file = elements.fileInput.files[0];
    if (!file) return;
    
    if (!isValidFileType(file) || !isValidFileSize(file)) {
        handleError(document.createElement('div'), new Error('Arquivo inválido ou muito grande'));
        return;
    }

    try {
        const fileData = await readFileAsDataURL(file);
        updateFilePreview(fileData);
        elements.fileInput.value = "";
    } catch (error) {
        console.error('Error processing file:', error);
        handleError(document.createElement('div'), error);
    }
});

elements.fileCancelButton.addEventListener("click", () => {
    clearFileUpload();
});

// File utility functions
function isValidFileType(file) {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif'];
    return allowedTypes.includes(file.type);
}

function isValidFileSize(file) {
    const maxSize = 5 * 1024 * 1024; // 5MB
    return file.size <= maxSize;
}

function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const base64Data = e.target.result.split(",")[1];
            resolve({
                data: base64Data,
                mime_type: file.type
            });
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function updateFilePreview(fileData) {
    elements.fileUploadWrapper.querySelector("img").src = `data:${fileData.mime_type};base64,${fileData.data}`;
    elements.fileUploadWrapper.classList.add("file-uploaded");
    state.userData.file = fileData;
}

function clearFileUpload() {
    elements.fileUploadWrapper.classList.remove("file-uploaded");
    state.userData.file.data = null;
    state.userData.file.mime_type = null;
}

// Emoji picker configuration
const picker = new EmojiMart.Picker({
    theme: "light",
    skinTonePosition: "none",
    previewPosition: "none",
    onEmojiSelect: (emoji) => {
        const input = elements.messageInput;
        const { selectionStart: start, selectionEnd: end } = input;
        input.setRangeText(emoji.native, start, end, "end");
        input.focus();
    },
    onClickOutside: (e) => {
        if (e.target.id === "emoji-picker") {
            document.body.classList.toggle("show-emoji-picker");
        } else {
            document.body.classList.remove("show-emoji-picker");
        }
    }
});

document.querySelector(".chat-form").appendChild(picker);

// Funções de gravação de áudio
function startRecording() {
    navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => {
            try {
                audioConfig.mediaRecorder = new MediaRecorder(stream, {
                    mimeType: 'audio/webm;codecs=opus'
                });
            } catch (e) {
                console.warn('WebM not supported, falling back to default format', e);
                audioConfig.mediaRecorder = new MediaRecorder(stream);
            }
            audioConfig.audioChunks = [];
            
            audioConfig.mediaRecorder.ondataavailable = e => {
                audioConfig.audioChunks.push(e.data);
            };
            
            audioConfig.mediaRecorder.onstart = () => {
                audioConfig.isRecording = true;
                elements.audioRecord.classList.add('recording');
                elements.audioControls.hidden = false;
                startTimer();
            };
            
            audioConfig.mediaRecorder.onstop = async () => {
                audioConfig.isRecording = false;
                elements.audioRecord.classList.remove('recording');
                stopTimer();
                
                if (audioConfig.audioChunks.length > 0) {
                    try {
                        const audioBlob = new Blob(audioConfig.audioChunks, {
                            type: 'audio/webm;codecs=opus'
                        });
                        const base64Data = await blobToBase64(audioBlob);
                        state.userData.file = {
                            data: base64Data,
                            mime_type: 'audio/webm'
                        };
                        state.userData.message = "🎤 Mensagem de áudio";
                        handleOutgoingMessage();
                    } catch (error) {
                        console.error('Error processing audio:', error);
                        handleError(document.createElement('div'), new Error('Erro ao processar áudio'));
                    }
                }
            };
            
            audioConfig.mediaRecorder.start();
        })
        .catch(error => {
            console.error('Error accessing microphone:', error);
            handleError(document.createElement('div'), new Error('Erro ao acessar microfone'));
        });
}

function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const base64Data = reader.result.split(',')[1];
            resolve(base64Data);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

function stopRecording() {
    if (audioConfig.mediaRecorder && audioConfig.isRecording) {
        audioConfig.mediaRecorder.stop();
        audioConfig.mediaRecorder.stream.getTracks().forEach(track => track.stop());
    }
}

function cancelRecording() {
    stopRecording();
    elements.audioControls.hidden = true;
    audioConfig.audioChunks = [];
}

function startTimer() {
    audioConfig.startTime = Date.now();
    updateTimer();
    audioConfig.timerInterval = setInterval(updateTimer, 1000);
}

function stopTimer() {
    clearInterval(audioConfig.timerInterval);
}

function updateTimer() {
    const elapsed = Math.floor((Date.now() - audioConfig.startTime) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    elements.recordTime.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

// Event listeners para gravação de áudio
elements.audioRecord.addEventListener('click', () => {
    if (!audioConfig.isRecording) {
        startRecording();
    }
});

elements.audioCancel.addEventListener('click', cancelRecording);
elements.audioSend.addEventListener('click', stopRecording); // Parar gravação irá automaticamente enviar

// File upload button handler
document.querySelector("#file-upload").addEventListener("click", () => {
    elements.fileInput.click();
});

// Chatbot visibility toggles
elements.chatbotToggler.addEventListener("click", () => {
    toggleChatbotVisibility(true);
});

elements.closeChatbot.addEventListener("click", () => {
    toggleChatbotVisibility(false);
});
function toggleChatbotVisibility(show) {
    const chatbotPopup = document.querySelector(".chatbot-popup");
    const method = show ? 'toggle' : 'remove';
    chatbotPopup.classList[method]("show-chatbot");
    document.body.classList[method]("show-chatbot");
}
