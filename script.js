// --- Глобальные переменные ---
let recognition; // Объект распознавания речи
let isListening = false; // Флаг: включен ли микрофон
let scriptWords = []; // Массив объектов слов (текст, очищенный текст, HTML-элемент)
let currentWordIndex = 0; // На каком слове мы сейчас находимся
let lastProcessedTranscript = ''; // Защита от повторной обработки одинакового interim-текста
let windowStartIndex = 0; // Начало "видимого" окна слов
let lastVoiceCommandKey = ''; // Защита от многократного срабатывания одной и той же команды
let statusResetTimer = null; // Таймер для временных диагностических сообщений

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
const voiceJumpToggle = document.getElementById('voice-jump-toggle');

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
    windowStartIndex = 0;
    lastVoiceCommandKey = '';

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
        windowStartIndex = 0;
        lastVoiceCommandKey = '';
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

function flashStatus(message, delay = 1400) {
    statusText.textContent = message;
    if (statusResetTimer) clearTimeout(statusResetTimer);

    statusResetTimer = setTimeout(() => {
        statusText.textContent = isListening ? "Слушаю..." : "Остановлено";
    }, delay);
}

// Эта функция вызывается каждый раз, когда браузер слышит голос
function handleSpeechResult(event) {
    // Берем последний результат
    const lastResultIndex = event.results.length - 1;
    const result = event.results[lastResultIndex];
    const transcript = result[0].transcript;

    const transcriptKey = transcript.toLowerCase().trim();
    const normalizedTranscript = transcriptKey.replace(/\s+/g, ' ');
    if (!transcriptKey) return;

    const spokenWords = transcriptKey
        .split(/\s+/)
        .map((word) => word.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, ""))
        .filter(Boolean);

    // Голосовые команды переноса вверх (включаются чекбоксом в настройках)
    if (voiceJumpToggle?.checked) {
        const cleanCommandText = normalizedTranscript.replace(/[^a-zа-яё0-9\s]/gi, ' ').replace(/\s+/g, ' ').trim();
        const commandMatch = cleanCommandText.match(/\bперенос\b(?:\s+на)?\s*(пять|5|десять|10)\b/i);

        if (commandMatch) {
            const commandValue = commandMatch[1].toLowerCase();
            const jumpAmount = (commandValue === 'пять' || commandValue === '5') ? 5 : 10;
            const commandKey = `${jumpAmount}:${cleanCommandText}`;

            if (commandKey !== lastVoiceCommandKey) {
                jumpUpByWords(jumpAmount);
                lastVoiceCommandKey = commandKey;
                flashStatus(`Команда: перенос ${jumpAmount}`);
            }
            return;
        }
    }

    // Если сейчас не команда — разрешаем следующую команду
    lastVoiceCommandKey = '';

    // Не обрабатываем один и тот же промежуточный текст повторно
    if (!result.isFinal && transcriptKey === lastProcessedTranscript) {
        return;
    }
    lastProcessedTranscript = transcriptKey;

    // Сначала проверяем возврат в уже пройденный текст (4 подряд слова)
    // Важно: этот блок должен стоять РАНЬШЕ обычного следования вперед,
    // иначе локальный forward-match перехватывает управление и backward не срабатывает.
    const backwardSequenceLength = 4;
    const backwardMatchStart = findBackwardSequenceMatch(spokenWords, backwardSequenceLength);

    if (backwardMatchStart !== -1) {
        const lastMatchedIndex = backwardMatchStart + backwardSequenceLength - 1;
        currentWordIndex = backwardMatchStart + backwardSequenceLength;
        highlightWord(lastMatchedIndex);
        performScroll(lastMatchedIndex);
        flashStatus(`Автопрыжок назад: ${backwardSequenceLength} слова`);
        return;
    }

    const isLimitedSearchEnabled = limitSearchToggle?.checked;
    const maxVisibleWords = Math.max(1, parseInt(maxVisibleWordsSelect?.value, 10) || 10);
    const shiftThreshold = Math.max(1, Math.floor(maxVisibleWords / 2));

    let visibleStartIndex = 0;
    let visibleEndIndex = scriptWords.length - 1;

    if (isLimitedSearchEnabled) {
        if (currentWordIndex < windowStartIndex) {
            windowStartIndex = Math.max(0, currentWordIndex - shiftThreshold);
        }

        // Скользящее окно: например видим 20 слов, после прохождения 10 слов окно сдвигается
        while (currentWordIndex - windowStartIndex >= shiftThreshold) {
            windowStartIndex += shiftThreshold;
        }

        visibleStartIndex = windowStartIndex;
        visibleEndIndex = Math.min(scriptWords.length - 1, visibleStartIndex + maxVisibleWords - 1);
    } else {
        windowStartIndex = 0;
    }

    if (visibleEndIndex <= currentWordIndex) {
        return;
    }

    const searchStart = Math.max(currentWordIndex, visibleStartIndex);

    // Проверяем последние 3 услышанных слова — это дает быстрый отклик даже при промежуточных фразах
    const spokenCandidates = spokenWords.slice(-3).reverse();

    for (const spokenWord of spokenCandidates) {
        for (let checkIndex = searchStart; checkIndex <= visibleEndIndex; checkIndex++) {
            if (!isMatch(spokenWord, scriptWords[checkIndex].clean)) continue;

            currentWordIndex = checkIndex + 1;
            highlightWord(checkIndex);
            performScroll(checkIndex);
            return;
        }
    }

    // Диагностика: если ничего не поймали (временно, чтобы проверить баг)
    // flashStatus("Совпадений нет", 800);

}

function jumpUpByWords(wordsToJump) {
    if (!scriptWords.length) return;

    const targetIndex = Math.max(0, currentWordIndex - wordsToJump);
    currentWordIndex = targetIndex;

    if (windowStartIndex > currentWordIndex) {
        windowStartIndex = currentWordIndex;
    }

    if (currentWordIndex > 0) {
        highlightWord(currentWordIndex - 1);
        performScroll(currentWordIndex - 1);
    } else {
        highlightWord(0);
        performScroll(0);
    }
}

function findBackwardSequenceMatch(spokenWords, sequenceLength) {
    if (spokenWords.length < sequenceLength) return -1;
    if (currentWordIndex < sequenceLength) return -1;

    for (let scriptStart = currentWordIndex - sequenceLength; scriptStart >= 0; scriptStart--) {
        for (let spokenStart = 0; spokenStart <= spokenWords.length - sequenceLength; spokenStart++) {
            let ok = true;

            for (let offset = 0; offset < sequenceLength; offset++) {
                const spokenWord = spokenWords[spokenStart + offset];
                const scriptWord = scriptWords[scriptStart + offset].clean;

                if (!isMatch(spokenWord, scriptWord)) {
                    ok = false;
                    break;
                }
            }

            if (ok) return scriptStart;
        }
    }

    return -1;
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
