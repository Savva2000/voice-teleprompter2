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
    // Берем последний результат (массив слов)
    const lastResultIndex = event.results.length - 1;
    const transcript = event.results[lastResultIndex][0].transcript;
    
    // Превращаем то, что услышали, в массив слов
    const spokenWords = transcript.toLowerCase().trim().split(/\s+/);
    
    // Берем последнее сказанное слово (оно самое актуальное)
    const lastSpokenWord = spokenWords[spokenWords.length - 1];

    console.log("Услышал:", lastSpokenWord); // Для отладки в консоли

    // --- АЛГОРИТМ ПОИСКА ---
    // Мы не просто сравниваем с текущим словом. Мы смотрим на 3 слова вперед.
    // Это нужно, если браузер пропустил слово или ошибся в окончании.
    
    const searchRange = 5; // Смотрим на 5 слов вперед от текущей позиции
    
    for (let i = 0; i < searchRange; i++) {
        const checkIndex = currentWordIndex + i;
        
        // Проверка, не вышли ли за границы текста
        if (checkIndex >= scriptWords.length) break;

        const scriptWordObj = scriptWords[checkIndex];
        
        // Сравнение (можно добавить нечеткий поиск тут, но пока точное совпадение начала)
        // Используем startsWith, чтобы "привет" совпало с "приветик" (простая эвристика)
        if (isMatch(lastSpokenWord, scriptWordObj.clean)) {
            
            // Если нашли совпадение:
            // 1. Помечаем все слова до этого как прочитанные (серенькие) или просто снимаем выделение
            highlightWord(checkIndex);
            
            // 2. Обновляем текущий индекс
            currentWordIndex = checkIndex + 1; // Ожидаем следующее слово
            
            // 3. СКРОЛЛИМ
            performScroll(checkIndex);
            
            break; // Выходим из цикла, раз нашли слово
        }
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
