// --- Глобальные переменные ---
let recognition; // Объект распознавания речи
let isListening = false; // Флаг: включен ли микрофон
let scriptWords = []; // Массив объектов слов (текст, очищенный текст, HTML-элемент)
let currentWordIndex = 0; // На каком слове мы сейчас находимся
let lastProcessedTranscript = ''; // Защита от повторной обработки одинакового interim-текста

// --- Получаем элементы со страницы ---
const setupScreen = document.getElementById('setup-screen');
const prompterScreen = document.getElementById('prompter-screen');
const contentDisplay = document.getElementById('content-display');

const sourceTextInput = document.getElementById('source-text');
const btnStart = document.getElementById('btn-start');
const btnBack = document.getElementById('btn-back');
const btnMic = document.getElementById('btn-mic');
const statusText = document.getElementById('status-indicator');

// Настройки
const inputFontSize = document.getElementById('font-size');
const inputFontFamily = document.getElementById('font-family');
const inputTextColor = document.getElementById('text-color');
const inputBgColor = document.getElementById('bg-color');
const inputScrollOffset = document.getElementById('scroll-offset'); // Насколько заранее скроллить
const limitSearchToggle = document.getElementById('limit-search-toggle');
const maxVisibleWordsSelect = document.getElementById('max-visible-words');

if (limitSearchToggle && maxVisibleWordsSelect) {
    limitSearchToggle.addEventListener('change', () => {
        maxVisibleWordsSelect.disabled = !limitSearchToggle.checked;
    });
}

// --- 1. Инициализация Web Speech API ---
// Проверяем, поддерживает ли браузер распознавание
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

if (!SpeechRecognition) {
    alert("Ваш браузер не поддерживает распознавание речи. Пожалуйста, используйте Google Chrome (на Android или ПК) или Safari.");
    btnStart.disabled = true;
    btnStart.textContent = "Браузер не поддерживается :(";
} else {
    recognition = new SpeechRecognition();
    recognition.lang = 'ru-RU'; // Язык - Русский
    recognition.continuous = true; // Не останавливаться после одной фразы
    recognition.interimResults = true; // Покзывать промежуточные результаты (быстро)
    
    // Привязываем события распознавания
    recognition.onresult = handleSpeechResult;
    recognition.onend = () => {
        // Если распознавание само отключилось (бывает в тишине), но мы не жали стоп - перезапускаем
        if (isListening) {
            try { recognition.start(); } catch(e) {}
        } else {
            updateMicVisuals(false);
        }
    };
    recognition.onerror = (event) => {
        console.error("Ошибка речи:", event.error);
        statusText.textContent = "Ошибка: " + event.error;
    };
}

// --- 2. Обработка Кнопок ---

// Кнопка "ЗАПУСТИТЬ" (Переход к суфлеру)
btnStart.addEventListener('click', () => {
    const text = sourceTextInput.value.trim();
    if (!text) {
        alert("Пожалуйста, введите текст сценария!");
        return;
    }

    // Применяем настройки стиля
    applySettings();

    // Готовим текст (разбиваем на слова и создаем HTML)
    processText(text);

    // Переключаем экраны
    setupScreen.classList.add('hidden');
    prompterScreen.classList.remove('hidden');
});

// Кнопка "Настройки" (Назад)
btnBack.addEventListener('click', () => {
    stopListening();
    prompterScreen.classList.add('hidden');
    setupScreen.classList.remove('hidden');
});

// Кнопка "Микрофон" (Старт/Стоп записи)
btnMic.addEventListener('click', () => {
    if (isListening) {
        stopListening();
    } else {
        startListening();
    }
});

// --- 3. Логика Подготовки Текста ---

function applySettings() {
    prompterScreen.style.backgroundColor = inputBgColor.value;
    contentDisplay.style.color = inputTextColor.value;
    contentDisplay.style.fontSize = inputFontSize.value + 'px';
    contentDisplay.style.fontFamily = inputFontFamily.value;
}

function processText(rawText) {
    contentDisplay.innerHTML = ''; // Очистить старое
    scriptWords = [];
    currentWordIndex = 0;
    lastProcessedTranscript = '';

    // Разбиваем текст на слова по пробелам и переносам строк
    const words = rawText.split(/\s+/);

    words.forEach((word, index) => {
        // Создаем span для каждого слова
        const span = document.createElement('span');
        span.textContent = word + ' '; // Добавляем пробел визуально
        span.id = `word-${index}`;
        
        // Очищаем слово от знаков препинания для сравнения (Привет, -> привет)
        const cleanWord = word.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g,"");
        
        // Сохраняем в массив данных
        scriptWords.push({
            element: span,
            clean: cleanWord,
            raw: word
        });

        contentDisplay.appendChild(span);
    });
}

// --- 4. Логика Распознавания (САМОЕ ВАЖНОЕ) ---

function startListening() {
    if (!recognition) return;
    try {
        lastProcessedTranscript = '';
        recognition.start();
        isListening = true;
        updateMicVisuals(true);
    } catch (e) {
        console.log("Уже запущено");
    }
}

function stopListening() {
    if (!recognition) return;
    recognition.stop();
    isListening = false;
    updateMicVisuals(false);
}

function updateMicVisuals(active) {
    if (active) {
        btnMic.classList.add('listening');
        statusText.textContent = "Слушаю...";
    } else {
        btnMic.classList.remove('listening');
        statusText.textContent = "Остановлено";
    }
}

// Эта функция вызывается каждый раз, когда браузер слышит голос
function handleSpeechResult(event) {
    // Берем последний результат
    const lastResultIndex = event.results.length - 1;
    const result = event.results[lastResultIndex];
    const transcript = result[0].transcript;

    const transcriptKey = transcript.toLowerCase().trim();
    if (!transcriptKey) return;

    // Не обрабатываем один и тот же промежуточный текст повторно
    if (!result.isFinal && transcriptKey === lastProcessedTranscript) {
        return;
    }
    lastProcessedTranscript = transcriptKey;

    // Нормализуем услышанные слова
    const spokenWords = transcriptKey
        .split(/\s+/)
        .map((word) => word.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, ""))
        .filter(Boolean);

    // Режимы:
    // 1) До 5 слов пропуска: нужно 4 подряд (мягкое сравнение)
    // 2) Пропуск больше 5 слов: только 5 подряд (строгое сравнение)
    const nearSkipLimit = 5;
    const nearRequiredSequence = 4;
    const farRequiredSequence = 5;
    const localFollowRange = 3;

    const isLimitedSearchEnabled = limitSearchToggle?.checked;
    const maxVisibleWords = Math.max(1, parseInt(maxVisibleWordsSelect?.value, 10) || 10);
    const visibleEndIndex = isLimitedSearchEnabled
        ? Math.min(scriptWords.length - 1, currentWordIndex + maxVisibleWords)
        : scriptWords.length - 1;

    if (visibleEndIndex <= currentWordIndex) {
        return;
    }

    // --- Быстрый локальный трекинг (для мгновенной подсветки) ---
    // Ищем последнее сказанное слово рядом с текущей позицией и двигаем на 1 слово.
    // Это возвращает «живую» реакцию как раньше.
    const lastSpokenWord = spokenWords[spokenWords.length - 1];
    if (lastSpokenWord) {
        const localEnd = Math.min(currentWordIndex + localFollowRange, visibleEndIndex);

        for (let checkIndex = currentWordIndex; checkIndex <= localEnd; checkIndex++) {
            if (!isMatch(lastSpokenWord, scriptWords[checkIndex].clean)) continue;

            currentWordIndex = checkIndex + 1;
            highlightWord(checkIndex);
            performScroll(checkIndex);
            return;
        }
    }

    const nearStart = currentWordIndex;
    const nearEnd = Math.min(
        currentWordIndex + nearSkipLimit,
        visibleEndIndex - nearRequiredSequence + 1
    );

    // Сначала проверяем ближнюю зону (до 5 слов вперед)
    for (let checkIndex = nearStart; checkIndex <= nearEnd; checkIndex++) {
        const matched = hasSequenceMatch(
            spokenWords,
            checkIndex,
            nearRequiredSequence,
            isMatch
        );

        if (!matched) continue;

        const lastMatchedIndex = checkIndex + nearRequiredSequence - 1;
        currentWordIndex = checkIndex + nearRequiredSequence;
        highlightWord(lastMatchedIndex);
        performScroll(lastMatchedIndex);
        return;
    }

    // Если пропуск больше 5 слов, разрешаем переход ТОЛЬКО при 5 строгих совпадениях подряд
    const farStart = currentWordIndex + nearSkipLimit + 1;
    const farEnd = visibleEndIndex - farRequiredSequence + 1;

    for (let checkIndex = farStart; checkIndex <= farEnd; checkIndex++) {
        const matched = hasSequenceMatch(
            spokenWords,
            checkIndex,
            farRequiredSequence,
            isStrictMatch
        );

        if (!matched) continue;

        const lastMatchedIndex = checkIndex + farRequiredSequence - 1;
        currentWordIndex = checkIndex + farRequiredSequence;
        highlightWord(lastMatchedIndex);
        performScroll(lastMatchedIndex);
        return;
    }
}

function hasSequenceMatch(spokenWords, scriptStartIndex, sequenceLength, comparator) {
    if (spokenWords.length < sequenceLength) return false;

    for (let spokenStart = 0; spokenStart <= spokenWords.length - sequenceLength; spokenStart++) {
        let ok = true;

        for (let offset = 0; offset < sequenceLength; offset++) {
            const spokenWord = spokenWords[spokenStart + offset];
            const scriptWord = scriptWords[scriptStartIndex + offset].clean;

            if (!comparator(spokenWord, scriptWord)) {
                ok = false;
                break;
            }
        }

        if (ok) return true;
    }

    return false;
}

// Простая функция сравнения
function isMatch(spoken, script) {
    if (!spoken || !script) return false;
    // Убираем лишнее еще раз на всякий случай
    spoken = spoken.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g,"");
    
    // 1. Точное совпадение
    if (spoken === script) return true;
    
    // 2. Если слово длинное (>4 букв), разрешаем расхождение в окончаниях
    // (Если в сценарии "делаешь", а сказал "делать")
    if (script.length > 4 && spoken.length > 4) {
        if (script.startsWith(spoken.substring(0, script.length - 2))) return true;
    }
    
    return false;
}

// Строгое сравнение: только полное совпадение
function isStrictMatch(spoken, script) {
    if (!spoken || !script) return false;
    return spoken === script;
}

// --- 5. Логика Визуала и Скролла ---

function highlightWord(index) {
    // Удаляем подсветку со всех предыдущих (на всякий случай)
    scriptWords.forEach(w => w.element.classList.remove('active-word'));
    
    // Подсвечиваем текущее
    if (scriptWords[index]) {
        scriptWords[index].element.classList.add('active-word');
    }
}

function performScroll(index) {
    const wordObj = scriptWords[index];
    if (!wordObj) return;

    const offsetSetting = parseInt(inputScrollOffset.value) || 2;
    
    // Логика скролла: Мы хотим, чтобы текущее слово было по центру экрана.
    // scrollIntoView({ block: 'center' }) делает это идеально.
    // Но пользователь просил скроллить заранее.
    
    // Мы можем схитрить: скроллить к элементу, который находится на N слов ВПЕРЕДИ.
    let targetIndex = index + offsetSetting; 
    if (targetIndex >= scriptWords.length) targetIndex = scriptWords.length - 1;
    
    const targetElement = scriptWords[targetIndex].element;

    targetElement.scrollIntoView({
        behavior: 'smooth',
        block: 'center', // Стараться держать слово по центру
    });
}
