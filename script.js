// --- Глобальные переменные ---
let recognition; // Объект распознавания речи
let isListening = false; // Флаг: включен ли микрофон
let scriptWords = []; // Массив объектов слов (текст, очищенный текст, HTML-элемент)
let currentWordIndex = 0; // На каком слове мы сейчас находимся

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
    const transcript = event.results[lastResultIndex][0].transcript;

    // Нормализуем услышанные слова
    const spokenWords = transcript
        .toLowerCase()
        .trim()
        .split(/\s+/)
        .map((word) => word.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, ""))
        .filter(Boolean);

    // Новое правило: двигаемся только если совпали минимум 4 слова подряд
    const requiredSequence = 4;
    const lookAheadRange = 6; // Небольшое окно вперед для устойчивости

    if (spokenWords.length < requiredSequence) {
        return; // Сказано меньше 4 слов — ничего не двигаем
    }

    const maxScriptStart = Math.min(
        currentWordIndex + lookAheadRange,
        scriptWords.length - requiredSequence
    );

    for (let checkIndex = currentWordIndex; checkIndex <= maxScriptStart; checkIndex++) {
        let hasSequenceMatch = false;

        // Внутри услышанной фразы ищем окно из 4 слов,
        // которое совпадает с 4 словами сценария подряд
        for (let spokenStart = 0; spokenStart <= spokenWords.length - requiredSequence; spokenStart++) {
            hasSequenceMatch = true;

            for (let offset = 0; offset < requiredSequence; offset++) {
                const spokenWord = spokenWords[spokenStart + offset];
                const scriptWord = scriptWords[checkIndex + offset].clean;

                if (!isMatch(spokenWord, scriptWord)) {
                    hasSequenceMatch = false;
                    break;
                }
            }

            if (hasSequenceMatch) {
                break;
            }
        }

        if (!hasSequenceMatch) {
            continue;
        }

        // Совпало 4 подряд: двигаем ровно на 4 слова вперед
        const lastMatchedIndex = checkIndex + requiredSequence - 1;
        currentWordIndex = checkIndex + requiredSequence;

        highlightWord(lastMatchedIndex);
        performScroll(lastMatchedIndex);
        break;
    }
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
