// --- ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ---
let recognition;
let isListening = false;
let scriptWords = [];
let currentWordIndex = 0;

// Переменные для видео
let mediaRecorder;
let recordedChunks = [];
let isRecording = false;
let cameraStream = null;
let selectedMimeType = '';

// --- ЭЛЕМЕНТЫ DOM ---
const setupScreen = document.getElementById('setup-screen');
const prompterScreen = document.getElementById('prompter-screen');
const contentDisplay = document.getElementById('content-display');
const cameraPreview = document.getElementById('camera-preview');
const sourceTextInput = document.getElementById('source-text');
const btnStart = document.getElementById('btn-start');
const btnBack = document.getElementById('btn-back');
const btnMic = document.getElementById('btn-mic');
const btnRecord = document.getElementById('btn-record');
const statusText = document.getElementById('status-indicator');
const inputFontSize = document.getElementById('font-size');
const inputScrollOffset = document.getElementById('scroll-offset');
const checkboxCamera = document.getElementById('camera-toggle');

// --- 1. НАСТРОЙКА ГОЛОСОВОГО ДВИЖКА ---
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.lang = 'ru-RU';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = handleSpeechResult;
    
    // Автоперезапуск, если браузер решил остановить слух
    recognition.onend = () => { 
        if (isListening) try { recognition.start(); } catch(e){} 
        else updateMicVisuals(false); 
    };
    recognition.onerror = (e) => { console.error("Speech API Error:", e); };
} else {
    alert("Ваш браузер не поддерживает Speech API. Используйте Chrome или Safari.");
}

// --- 2. ОБРАБОТЧИКИ КНОПОК ---
btnStart.addEventListener('click', async () => {
    const text = sourceTextInput.value.trim();
    if (!text) return alert("Введите текст!");
    
    // Применяем настройки
    contentDisplay.style.fontSize = inputFontSize.value + 'px';
    processText(text);

    // Логика камеры
    if (checkboxCamera.checked) {
        if (!await startCamera()) return;
        btnRecord.classList.remove('hidden');
        cameraPreview.style.display = 'block';
        contentDisplay.style.color = 'rgba(255,255,255,0.95)';
    } else {
        btnRecord.classList.add('hidden');
        cameraPreview.style.display = 'none';
        contentDisplay.style.color = '#fff';
    }
    
    setupScreen.classList.add('hidden');
    prompterScreen.classList.remove('hidden');
});

btnBack.addEventListener('click', () => {
    stopListening(); stopCamera(); stopRecording();
    prompterScreen.classList.add('hidden');
    setupScreen.classList.remove('hidden');
});

btnMic.addEventListener('click', () => { isListening ? stopListening() : startListening(); });
btnRecord.addEventListener('click', () => { isRecording ? stopRecording() : startRecording(); });

// --- 3. ПОДГОТОВКА ТЕКСТА ---
function processText(rawText) {
    contentDisplay.innerHTML = '';
    scriptWords = [];
    currentWordIndex = 0;
    
    // Удаляем лишнее
    if (rawText.includes("t.me/SPEKTR_SP")) {
       rawText = rawText.replace(/Создано независимым разработчиком[\s\S]*некоммерческих целях/, "");
    }

    const words = rawText.split(/\s+/);
    words.forEach((word, index) => {
        const span = document.createElement('span');
        span.textContent = word + ' ';
        span.id = `word-${index}`;
        // Чистим слово для сравнения
        const clean = word.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g,"");
        scriptWords.push({ element: span, clean: clean });
        contentDisplay.appendChild(span);
    });
}

// --- 4. ЯДРО: УМНЫЙ ПОИСК С ДИНАМИЧЕСКИМ ПОРОГОМ (FIXED) ---

function handleSpeechResult(event) {
    // Получаем полный транскрипт текущей сессии
    const transcript = event.results[event.results.length - 1][0].transcript;
    // Разбиваем на массив слов
    const spokenWords = transcript.toLowerCase().trim().split(/\s+/);
    
    if (spokenWords.length === 0) return;

    // --- НАСТРОЙКИ АЛГОРИТМА ---
    const searchBack = 30;     // Смотрим назад на 30 слов
    const searchForward = 800; // Смотрим вперед на 800 слов

    let startIndex = Math.max(0, currentWordIndex - searchBack);
    let endIndex = Math.min(scriptWords.length, currentWordIndex + searchForward);

    let bestCandidate = null;

    // Ищем ВСЕ возможные совпадения в диапазоне
    for (let i = startIndex; i < endIndex; i++) {
        const scriptWord = scriptWords[i].clean;
        const lastSpoken = spokenWords[spokenWords.length - 1];

        // 1. Проверяем совпадение последнего сказанного слова
        if (isMatch(lastSpoken, scriptWord)) {
            
            // 2. Считаем длину совпавшей цепочки (сколько слов совпало подряд назад)
            const sequenceLength = calculateSequenceMatch(i, spokenWords);

            // 3. Вычисляем "Цену прыжка" (Dynamic Threshold)
            const distance = i - currentWordIndex;
            const requiredLength = getRequiredThreshold(distance);

            // 4. Если совпадений достаточно для прыжка
            if (sequenceLength >= requiredLength) {
                
                // 5. Выбираем ЛУЧШЕГО кандидата (Принцип Ближайшего Соседа)
                // Если кандидата еще нет ИЛИ новый кандидат ближе к текущей позиции по модулю
                if (!bestCandidate || Math.abs(distance) < Math.abs(bestCandidate.distance)) {
                    bestCandidate = { index: i, distance: distance };
                }
            }
        }
    }

    // Если достойный кандидат найден — прыгаем
    if (bestCandidate) {
        jumpTo(bestCandidate.index);
    }
}

// Функция определения "Цены" прыжка
function getRequiredThreshold(distance) {
    // А. Если слово совсем рядом (0-10 слов вперед) -> Цена: 1 слово
    if (distance >= 0 && distance < 10) return 1;

    // Б. Если слово чуть дальше (10-40 слов вперед) -> Цена: 2 слова
    if (distance >= 10 && distance < 40) return 2;

    // В. Если прыжок далеко (40+ слов) -> Цена: 3 слова (Ключ)
    if (distance >= 40) return 3;

    // Г. Если прыжок НАЗАД -> Цена: 4 слова (Защита от случайных возвратов)
    if (distance < 0) return 4;
    
    return 3; // Дефолт
}

// Функция подсчета реальных совпадений назад
function calculateSequenceMatch(scriptIndex, spokenWords) {
    let matches = 0;
    // Сравниваем слова назад от текущей позиции
    // k = смещение назад (0 = последнее слово, 1 = предпоследнее...)
    for (let k = 0; k < 5; k++) { // Проверяем максимум 5 последних слов
        const sIndex = scriptIndex - k;
        const wIndex = spokenWords.length - 1 - k;

        if (sIndex < 0 || wIndex < 0) break; // Вышли за границы

        const scriptW = scriptWords[sIndex].clean;
        // Очищаем сказанное слово от мусора
        const spokenW = spokenWords[wIndex].replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g,"");

        if (isMatch(spokenW, scriptW)) {
            matches++;
        } else {
            break; // Цепочка прервалась
        }
    }
    return matches;
}

function isMatch(spoken, script) {
    if (!spoken || !script) return false;
    if (spoken === script) return true;
    
    // Нечеткое сравнение (для окончаний)
    if (script.length > 4 && spoken.length > 4) {
        if (script.startsWith(spoken.substring(0, script.length - 2))) return true;
    }
    return false;
}

function jumpTo(index) {
    highlightWord(index);
    currentWordIndex = index + 1;
    performScroll(index);
}

function highlightWord(index) {
    document.querySelectorAll('.active-word').forEach(el => el.classList.remove('active-word'));
    if (scriptWords[index]) {
        scriptWords[index].element.classList.add('active-word');
    }
}

function performScroll(index) {
    const offset = parseInt(inputScrollOffset.value) || 2;
    let target = index + offset;
    if (target >= scriptWords.length) target = scriptWords.length - 1;
    
    if (scriptWords[target]) {
        scriptWords[target].element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

// --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ (МИКРОФОН, КАМЕРА) ---

function startListening() { try { recognition.start(); isListening = true; updateMicVisuals(true); } catch(e){} }
function stopListening() { if(recognition) recognition.stop(); isListening = false; updateMicVisuals(false); }

function updateMicVisuals(active) {
    if (active) { btnMic.classList.add('listening'); statusText.textContent = "Слушаю..."; }
    else { btnMic.classList.remove('listening'); statusText.textContent = "Стоп"; }
}

async function startCamera() {
    try {
        cameraStream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: "user", width: { ideal: 1920 }, height: { ideal: 1080 } }, 
            audio: true 
        });
        cameraPreview.srcObject = cameraStream;
        cameraPreview.play();
        return true;
    } catch (err) { alert("Ошибка доступа к камере."); return false; }
}

function stopCamera() {
    if (cameraStream) { cameraStream.getTracks().forEach(track => track.stop()); cameraStream = null; }
}

function startRecording() {
    if (!cameraStream) return;
    recordedChunks = [];
    const types = ["video/mp4", "video/webm;codecs=h264", "video/webm;codecs=vp9", "video/webm"];
    selectedMimeType = types.find(type => MediaRecorder.isTypeSupported(type)) || "";
    if (!selectedMimeType) return alert("Запись видео не поддерживается.");

    try { mediaRecorder = new MediaRecorder(cameraStream, { mimeType: selectedMimeType, videoBitsPerSecond: 2500000 }); } 
    catch (e) { mediaRecorder = new MediaRecorder(cameraStream); selectedMimeType = ""; }

    mediaRecorder.ondataavailable = e => { if (e.data.size > 0) recordedChunks.push(e.data); };
    mediaRecorder.onstop = saveVideo;
    mediaRecorder.start();
    isRecording = true;
    btnRecord.classList.add('recording');
    if (!isListening) startListening();
}

function stopRecording() {
    if (!mediaRecorder) return;
    mediaRecorder.stop();
    isRecording = false;
    btnRecord.classList.remove('recording');
    stopListening();
}

function saveVideo() {
    const blob = new Blob(recordedChunks, { type: selectedMimeType || 'video/webm' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    let ext = selectedMimeType.includes("mp4") ? "mp4" : "webm";
    const d = new Date();
    a.download = `video_${d.getHours()}-${d.getMinutes()}.${ext}`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); window.URL.revokeObjectURL(url); }, 100);
}
