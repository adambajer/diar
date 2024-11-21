// ========================
// Firebase Configuration
// ========================

const firebaseConfig = {
    apiKey: "YOUR_API_KEY_HERE",
    authDomain: "YOUR_AUTH_DOMAIN_HERE",
    databaseURL: "https://voice-noter-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "YOUR_PROJECT_ID_HERE",
    storageBucket: "YOUR_STORAGE_BUCKET_HERE",
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID_HERE",
    appId: "YOUR_APP_ID_HERE"
};

// Inicializace Firebase
firebase.initializeApp(firebaseConfig);

// Získání reference na databázi
const database = firebase.database();

// ========================
// Globální Proměnné
// ========================

let baseDate = new Date(); // Sleduje aktuálně vybraný datum
let currentStartOfWeek = null;
let activeCell = null; // Aktuálně aktivní buňka pro navigaci klávesnicí
let currentTranscribingCell = null; // Sleduje buňku, do které se přepisuje
let recognition = null; // Instance SpeechRecognition

// ========================
// Inicializace Plánovače při Načtení DOM
// ========================
document.addEventListener("DOMContentLoaded", () => {
    console.log("DOM načteno. Inicializuji plánovač...");
    
    // Načtení posledního vybraného data z local storage
    const savedDateStr = localStorage.getItem("selectedDate");
    if (savedDateStr) {
        const savedDate = new Date(savedDateStr);
        if (!isNaN(savedDate)) {
            baseDate = savedDate;
            console.log(`Načteno uložené datum: ${baseDate}`);
        } else {
            console.warn("Uložené datum je neplatné. Používám aktuální datum.");
        }
    } else {
        console.log("Žádné uložené datum nenalezeno. Používám aktuální datum.");
    }

    updateTodayDate();
    updateYearAndMonthDisplay();

    renderPlanner();
    renderMiniCalendar();
    renderYearCalendarModal();

    addMonthNavigationListeners();
    addWeekNavigationListeners(); // Přidání listenerů pro týdenní navigaci
    setupYearCalendarButton();
    setupWebSpeechAPI(); // Inicializace Web Speech API pro přepis hlasu
    setupClock(); // Inicializace reálného času
});

// ========================
// Vykreslení Týdenního Plánovače
// ========================

async function renderPlanner() {
    console.log("Vykresluji plánovač...");
    currentStartOfWeek = getStartOfWeek(baseDate);
    renderHeaders(currentStartOfWeek);
    renderTimeSlots(currentStartOfWeek);

    const weekStartDate = format(currentStartOfWeek, 'yyyy-MM-dd');
    console.log(`Načítám poznámky pro týden začínající: ${weekStartDate}`);

    const weekNotes = await fetchNotesForWeekFromFirebase(weekStartDate);

    if (weekNotes) {
        console.log("Poznámky nalezeny. Vkládám do plánovače.");
        populatePlannerWithNotes(weekNotes);
    } else {
        console.log("Nebyl nalezen žádný zápis pro aktuální týden.");
    }

    // Zvýraznění vybraného týdne v kalendářích
    highlightSelectedWeek(currentStartOfWeek);

    // Aktualizace zobrazení čísla vybraného týdne
    updateSelectedWeekNumber(currentStartOfWeek);
}

// Render Day Headers (Day Names and Real Dates)
function renderHeaders(startOfWeek) {
    const dayHeaders = document.getElementById("day-headers");
    dayHeaders.innerHTML = ""; // Vyčištění existujících hlaviček

    console.log("Vykresluji hlavičky dnů...");

    for (let i = 0; i < 7; i++) {
        const dayDate = addDays(startOfWeek, i);
        const th = document.createElement("th");
        th.className = "day-header";
        th.innerHTML = `
            <span class="day-name">${dayDate.toLocaleString('cs-CZ', { weekday: 'long' })}</span>
            <span class="day-date" title="${dayDate.toLocaleDateString('cs-CZ', { year: 'numeric', month: 'short', day: 'numeric' })}">${dayDate.getDate()}</span>
            
        `;
        dayHeaders.appendChild(th);
    }
}

// Render Time Slots for Each Day
function renderTimeSlots(startOfWeek) {
    const tbody = document.getElementById("time-slots");
    tbody.innerHTML = ""; // Vyčištění existujících časových slotů

    const startHour = 7;
    const endHour = 20;

    console.log("Vykresluji časové sloty...");

    for (let hour = startHour; hour <= endHour; hour++) {
        const row = document.createElement("tr");

        for (let day = 0; day < 7; day++) {
            const cell = document.createElement("td");
            cell.className = "time-slot";
            cell.setAttribute('data-day', day);
            cell.setAttribute('data-hour', hour);

            // Spinner Element
            const spinner = document.createElement("div");
            spinner.className = "spinner-border spinner-border-sm text-success";
            spinner.style.display = "none"; // Skrytí spinneru inicialně
            cell.appendChild(spinner);

            // Vytvoření kontejneru pro text poznámky a mic ikonu
            const noteContainer = document.createElement("div");
            noteContainer.className = "note-text-container";

            // Vytvoření časové značky
            const timeLabel = document.createElement("div");
            timeLabel.className = "time-label";
            timeLabel.innerText = formatHour(hour);
            noteContainer.appendChild(timeLabel);

            // Vytvoření editovatelného textového prvku poznámky
            const noteTextElement = document.createElement("div");
            noteTextElement.className = "note-text";
            noteTextElement.contentEditable = true;
            noteTextElement.setAttribute('data-day', day);
            noteTextElement.setAttribute('data-hour', hour);
            noteTextElement.setAttribute('tabindex', 0); // Zpřístupnění pro fokus

            // Přidání event listenerů pro ukládání poznámek
            noteTextElement.addEventListener('input', (event) => handleNoteInput(event, day, hour));
            noteTextElement.addEventListener('blur', (event) => saveNoteDirectly(event, day, hour));

            // Přidání keydown event listeneru pro navigaci klávesnicí
            noteTextElement.addEventListener('keydown', (event) => handleKeyDown(event, day, hour));

            // Vytvoření mikrofonové ikony
            const micIcon = document.createElement("i");
            micIcon.className = "bi bi-mic-fill cell-mic";
            micIcon.title = "Přepis hlasu";
            micIcon.setAttribute('aria-label', 'Přepis hlasu');
            micIcon.setAttribute('role', 'button');

            // Implementace Přepisu Hlasu při Hoveru na Celou Buňku
            let hoverTimer = null;

            micIcon.addEventListener('mouseenter', () => {
                console.log(`Najeď na buňku pro den ${day}, hodina ${hour}. Spouštím 2 sekundový timer.`);
                hoverTimer = setTimeout(() => {
                    console.log(`Timer uplynul. Spouštím přepis pro den ${day}, hodina ${hour}.`);
                    startTranscription(noteTextElement);
                }, 2000); // 2 sekundy
            });

            micIcon.addEventListener('mouseleave', () => {
                if (hoverTimer) {
                    clearTimeout(hoverTimer);
                    console.log(`Timer pro den ${day}, hodina ${hour} byl zrušen.`);
                    hoverTimer = null;
                }
            });

            // Přidání mikrofonové ikony do kontejneru
            noteContainer.appendChild(noteTextElement);
            noteContainer.appendChild(micIcon);

            // Přidání kontejneru do buňky
            cell.appendChild(noteContainer);

            row.appendChild(cell);

            // Načtení a zobrazení existujících poznámek
            fetchNoteForCell(noteTextElement, day, hour, startOfWeek, spinner);
        }

        tbody.appendChild(row);
    }
}

// Vykreslení Poznámek do Plánovače
function populatePlannerWithNotes(notes) {
    console.log("Vkládám načtené poznámky do plánovače...");
    for (const [dayKey, hours] of Object.entries(notes)) {
        const dayIndex = parseInt(dayKey.replace("day", ""), 10);
        for (const [hourKey, noteText] of Object.entries(hours)) {
            const hourIndex = parseInt(hourKey.replace("hour", ""), 10);
            const cell = document.querySelector(`td[data-day="${dayIndex}"][data-hour="${hourIndex}"] .note-text`);
            if (cell) {
                cell.innerText = sanitizeInput(noteText);
                console.log(`Poznámka pro den ${dayIndex}, hodina ${hourIndex} nastavena na: "${noteText}"`);
            }
        }
    }
}

// ========================
// Mini Kalendář
// ========================
function renderMiniCalendar() {
    const container = document.getElementById("mini-calendar-container");
    container.innerHTML = ""; // Vyčištění existujícího kalendáře

    const currentYear = baseDate.getFullYear();
    const currentMonth = baseDate.getMonth();
    const firstDay = new Date(currentYear, currentMonth, 1);
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

    const table = document.createElement("table");
    table.className = "table table-sm table-bordered text-center";
 

    const tbody = document.createElement("tbody");
    let row = document.createElement("tr");

    // Prázdné buňky pro dny před prvním dnem měsíce
    for (let i = 0; i < (firstDay.getDay() || 7) - 1; i++) {
        row.appendChild(document.createElement("td"));
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(currentYear, currentMonth, day);

        const cell = document.createElement("td");
        cell.innerText = day;

        // Zvýraznění nedělí
        if (date.getDay() === 0) {
            cell.style.color = "red";
        }

        // Přidání click eventu
        cell.addEventListener("click", () => {
            console.log(`Kliknuto na mini kalendář: den ${day}`);
            baseDate = date;
            renderPlanner();
            renderMiniCalendar();
            renderYearCalendarModal();
            updateYearAndMonthDisplay();
            saveSelectedDateToLocalStorage(date); // Uložení do local storage
        });

        // Zvýraznění, pokud je týden vybraný
        if (isDateInCurrentSelectedWeek(date)) {
            cell.classList.add("selected-week");
            console.log(`Buňka mini kalendáře pro den ${day} je ve vybraném týdnu.`);
        }

        row.appendChild(cell);

        if (date.getDay() === 0 || day === daysInMonth) {
            tbody.appendChild(row);
            row = document.createElement("tr");
        }
    }

    table.appendChild(tbody);
    container.appendChild(table);
}

// ========================
// Roční Kalendář Modal
// ========================
function renderYearCalendarModal() {
    const container = document.querySelector(".year-calendar-modal");
    container.innerHTML = ""; // Vyčištění existujícího ročního kalendáře

    const currentYear = baseDate.getFullYear();
    document.getElementById("selected-year").innerText = currentYear;

    for (let month = 0; month < 12; month++) {
        const firstDay = new Date(currentYear, month, 1);
        const daysInMonth = new Date(currentYear, month + 1, 0).getDate();
        const monthName = firstDay.toLocaleString('cs-CZ', { month: 'long' });

        const monthContainer = document.createElement("div");
        monthContainer.className = "month-container-modal";

        const monthLabel = document.createElement("h5");
        monthLabel.innerText = monthName.toUpperCase();
        monthLabel.className = "text-center";

        const table = document.createElement("table");
        table.className = "table table-bordered table-sm text-center";

        const tbody = document.createElement("tbody");
        let row = document.createElement("tr");

        // Prázdné buňky pro dny před prvním dnem měsíce
        for (let i = 0; i < (firstDay.getDay() || 7) - 1; i++) {
            row.appendChild(document.createElement("td"));
        }

        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(currentYear, month, day);
            const dateStr = format(date, 'yyyy-MM-dd');

            const cell = document.createElement("td");
            cell.innerText = day;

            // Zvýraznění nedělí
            if (date.getDay() === 0) {
                cell.style.color = "red";
            }

            // Zvýraznění, pokud je týden vybraný
            if (isDateInCurrentSelectedWeek(date)) {
                cell.classList.add("selected-week");
                console.log(`Buňka ročního kalendáře pro den ${day}, měsíc ${month + 1} je ve vybraném týdnu.`);
            }

            // Přidání click eventu
            cell.addEventListener("click", () => {
                console.log(`Kliknuto na roční kalendář: den ${day}, měsíc ${month + 1}`);
                baseDate = date;
                renderPlanner();
                renderMiniCalendar();
                renderYearCalendarModal();
                updateYearAndMonthDisplay();
                saveSelectedDateToLocalStorage(date); // Uložení do local storage
                // Zavření modalu po výběru data
                const modal = bootstrap.Modal.getInstance(document.getElementById("yearCalendarModal"));
                modal.hide();
            });

            row.appendChild(cell);

            if (date.getDay() === 0 || day === daysInMonth) {
                tbody.appendChild(row);
                row = document.createElement("tr");
            }
        }

        table.appendChild(tbody);
        monthContainer.appendChild(monthLabel);
        monthContainer.appendChild(table);
        container.appendChild(monthContainer);
    }
}

// ========================
// Firebase Operace
// ========================

// Uložení Poznámky do Firebase
async function saveNoteToFirebase(date, time, text) {
    const dateObj = new Date(date);
    const weekStart = getStartOfWeek(dateObj);
    const weekNumber = getWeekNumber(weekStart);
    const monthName = getMonthName(weekStart);

    const noteRef = database.ref(`planner/${monthName}/week_${weekNumber}/day${getDayFromDate(date)}/hour${getHourFromTime(time)}`);

    return noteRef.set(text)
        .then(() => {
            console.log(`Poznámka úspěšně uložena pro ${date} v ${time}.`);
            showToast("Poznámka úspěšně uložena.", 'success');
        })
        .catch(error => {
            console.error(`Chyba při ukládání poznámky pro ${date} v ${time}:`, error);
            showToast("Nepodařilo se uložit poznámku. Prosím, zkuste to znovu.", 'error');
        });
}

// Smazání Poznámky z Firebase
async function deleteNoteFromFirebase(date, time) {
    const dateObj = new Date(date);
    const weekStart = getStartOfWeek(dateObj);
    const weekNumber = getWeekNumber(weekStart);
    const monthName = getMonthName(weekStart);

    const noteRef = database.ref(`planner/${monthName}/week_${weekNumber}/day${getDayFromDate(date)}/hour${getHourFromTime(time)}`);

    return noteRef.remove()
        .then(() => {
            console.log(`Poznámka úspěšně smazána pro ${date} v ${time}.`);
            showToast("Poznámka úspěšně smazána.", 'success');
        })
        .catch(error => {
            console.error(`Chyba při mazání poznámky pro ${date} v ${time}:`, error);
            showToast("Nepodařilo se smazat poznámku.", 'error');
        });
}

// Načtení konkrétní Poznámky z Firebase
function fetchNoteFromFirebase(date, time) {
    const dateObj = new Date(date);
    const weekStart = getStartOfWeek(dateObj);
    const weekNumber = getWeekNumber(weekStart);
    const monthName = getMonthName(weekStart);
    const dayIndex = getDayFromDate(date);
    const hourIndex = getHourFromTime(time);

    const noteRef = database.ref(`planner/${monthName}/week_${weekNumber}/day${dayIndex}/hour${hourIndex}`);

    return noteRef.once('value')
        .then(snapshot => snapshot.val())
        .catch(error => {
            console.error(`Chyba při načítání poznámky pro ${date} v ${time}:`, error);
            showToast("Nepodařilo se načíst poznámku.", 'error');
            return null;
        });
}

// Načtení všech Poznámek pro konkrétní týden z Firebase
function fetchNotesForWeekFromFirebase(weekStartDate) {
    const startOfWeek = getStartOfWeek(new Date(weekStartDate));
    const weekNumber = getWeekNumber(startOfWeek);
    const monthName = getMonthName(startOfWeek);
    const weekRef = database.ref(`planner/${monthName}/week_${weekNumber}`);

    return weekRef.once('value')
        .then(snapshot => snapshot.val())
        .catch(error => {
            console.error("Chyba při načítání poznámek z Firebase:", error);
            showToast("Nepodařilo se načíst poznámky z Firebase.", 'error');
            return null;
        });
}

// ========================
// Nástroje a Pomocné Funkce
// ========================

// Získání Začátku Týdne (Pondělí)
function getStartOfWeek(date) {
    const result = new Date(date);
    const day = result.getDay(); // 0 = Neděle, 1 = Pondělí, ..., 6 = Sobota
    const diff = (day === 0 ? -6 : 1) - day; // Úprava, aby pondělí bylo začátkem týdne
    result.setDate(result.getDate() + diff);
    result.setHours(0, 0, 0, 0); // Resetování času
    return result;
}

// Přidání Dnů k Datu
function addDays(date, days) {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
}

// Formátování Datumu podle Specifikovaného Formátu
function format(date, formatStr) {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');

    if (formatStr === 'yyyy-MM-dd') {
        return `${year}-${month}-${day}`;
    }
    // Přidejte další formáty podle potřeby
    return date.toString();
}

// Získání Čísla Týdne pro Datum
function getWeekNumber(date) {
    const startOfWeek = getStartOfWeek(new Date(date));
    const startOfYear = new Date(startOfWeek.getFullYear(), 0, 1);
    const diffInTime = startOfWeek - startOfYear;
    const diffInDays = Math.floor(diffInTime / (24 * 60 * 60 * 1000));
    const weekNumber = Math.ceil((diffInDays + startOfYear.getDay() + 1) / 7);
    return weekNumber;
}

// Získání Názvu Měsíce v Češtině
function getMonthName(date) {
    const monthNamesCzech = [
        "Leden", "Únor", "Březen", "Duben", "Květen", "Červen",
        "Červenec", "Srpen", "Září", "Říjen", "Listopad", "Prosinec"
    ];
    return monthNamesCzech[date.getMonth()];
}

// Získání Indexu Dne z Objektu Datumu relativně k Začátku Týdne
function getDayFromDate(date) {
    const startOfWeek = getStartOfWeek(baseDate);
    const dayDiff = Math.floor((new Date(date) - startOfWeek) / (24 * 60 * 60 * 1000));
    return dayDiff;
}

// Získání Hodiny z Řetězce Času
function getHourFromTime(timeString) {
    return parseInt(timeString.split(':')[0], 10);
}

// Kontrola, zda Datum je v Aktuálně Vybraném Týdnu
function isDateInCurrentSelectedWeek(date) {
    const startOfWeek = getStartOfWeek(baseDate);
    const endOfWeek = addDays(startOfWeek, 7);
    return date >= startOfWeek && date < endOfWeek;
}

// Sanitize Input pro Prevence XSS
function sanitizeInput(str) {
    if (!str) return '';
    const temp = document.createElement('div');
    temp.textContent = str;
    return temp.innerHTML;
}

// Formátování Hodiny
function formatHour(hour) {
    return hour.toString().padStart(1, '0') + '';
}

// ========================
// Navigace a Event Listenery
// ========================

// Přidání Event Listenerů pro Navigaci Měsíců
function addMonthNavigationListeners() {
    document.getElementById("prev-month").addEventListener("click", () => {
        console.log("Kliknuto na předchozí měsíc.");
        baseDate.setMonth(baseDate.getMonth() - 1);
        renderPlanner();
        renderMiniCalendar();
        renderYearCalendarModal();
        updateYearAndMonthDisplay();
        saveSelectedDateToLocalStorage(baseDate); // Uložení do local storage
    });

    document.getElementById("next-month").addEventListener("click", () => {
        console.log("Kliknuto na následující měsíc.");
        baseDate.setMonth(baseDate.getMonth() + 1);
        renderPlanner();
        renderMiniCalendar();
        renderYearCalendarModal();
        updateYearAndMonthDisplay();
        saveSelectedDateToLocalStorage(baseDate); // Uložení do local storage
    });
}

// Přidání Event Listenerů pro Navigaci Týdnů
function addWeekNavigationListeners() {
    document.getElementById("prev-week").addEventListener("click", () => {
        console.log("Kliknuto na předchozí týden.");
        baseDate.setDate(baseDate.getDate() - 7);
        renderPlanner();
        renderMiniCalendar();
        renderYearCalendarModal();
        updateYearAndMonthDisplay();
        saveSelectedDateToLocalStorage(baseDate); // Uložení do local storage
    });

    document.getElementById("next-week").addEventListener("click", () => {
        console.log("Kliknuto na následující týden.");
        baseDate.setDate(baseDate.getDate() + 7);
        renderPlanner();
        renderMiniCalendar();
        renderYearCalendarModal();
        updateYearAndMonthDisplay();
        saveSelectedDateToLocalStorage(baseDate); // Uložení do local storage
    });
}

// Nastavení Buttonu pro Otevření Ročního Kalendáře
function setupYearCalendarButton() {
    document.getElementById("open-year-calendar").addEventListener("click", () => {
        console.log("Kliknuto na tlačítko pro otevření ročního kalendáře.");
        renderYearCalendarModal();
        new bootstrap.Modal(document.getElementById("yearCalendarModal")).show();
    });
}

// Obsluha Klávesové Navigace v Plánovači
function handleKeyDown(event, day, hour) {
    const key = event.key;

    let targetDay = day;
    let targetHour = hour;

    switch (key) {
        case 'ArrowUp':
            targetHour = hour > 7 ? hour - 1 : hour;
            event.preventDefault();
            console.log(`Navigace nahoru na den ${targetDay}, hodina ${targetHour}.`);
            break;
        case 'ArrowDown':
            targetHour = hour < 20 ? hour + 1 : hour;
            event.preventDefault();
            console.log(`Navigace dolů na den ${targetDay}, hodina ${targetHour}.`);
            break;
        case 'ArrowLeft':
            targetDay = day > 0 ? day - 1 : day;
            event.preventDefault();
            console.log(`Navigace doleva na den ${targetDay}, hodina ${targetHour}.`);
            break;
        case 'ArrowRight':
            targetDay = day < 6 ? day + 1 : day;
            event.preventDefault();
            console.log(`Navigace doprava na den ${targetDay}, hodina ${targetHour}.`);
            break;
        case 'Enter':
            targetHour = hour < 20 ? hour + 1 : hour;
            event.preventDefault();
            console.log(`Navigace Enter na den ${targetDay}, hodina ${targetHour}.`);
            break;
        default:
            return; // Nepodniká nic pro jiné klávesy
    }

    // Zabránění přechodu focusu mimo mřížku
    if (targetDay < 0 || targetDay > 6 || targetHour < 7 || targetHour > 20) {
        console.warn(`Pokus o navigaci mimo mřížku: den ${targetDay}, hodina ${targetHour}.`);
        return;
    }

    // Najdi cílovou buňku a fokusuj její noteTextElement
    const targetCell = document.querySelector(`td[data-day="${targetDay}"][data-hour="${targetHour}"] .note-text`);
    if (targetCell) {
        // Odstranění aktivní třídy ze všech buněk
        document.querySelectorAll('.note-text.active').forEach(el => el.classList.remove("active"));

        // Přidání aktivní třídy do cílové buňky
        targetCell.classList.add("active");

        targetCell.focus();
        console.log(`Fokus přesunut na den ${targetDay}, hodina ${targetHour}.`);
    }
}

// ========================
// Funkce pro Zpracování Poznámek
// ========================

// Debounce Funkce pro Omezení Frekvence Volání Funkce
function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

// Zpracování Vstupu Poznámky s Debounce
const handleNoteInput = debounce((event, day, hour) => {
    const noteText = event.target.innerText.trim();
    console.log(`Zpracovávám vstup pro den ${day}, hodina ${hour}: "${noteText}"`);

    const dateObj = addDays(currentStartOfWeek, day);
    const date = format(dateObj, 'yyyy-MM-dd');
    const time = formatHour(hour);

    if (noteText === '') {
        // Pokud nechcete mazat prázdné poznámky, jednoduše přerušte funkci
        console.log(`Poznámka pro den ${day}, hodina ${hour} je prázdná. Neprovádím žádnou akci.`);
        return;
    }

    console.log(`Ukládám poznámku pro ${date} v ${time}: "${noteText}"`);
    saveNoteToFirebase(date, time, noteText);
    saveSelectedDateToLocalStorage(dateObj); // Uložení do local storage
}, 500);

// Uložení Poznámky Přímo při Blur Eventu
async function saveNoteDirectly(event, day, hour) {
    const noteText = event.target.innerText.trim();
    console.log(`Ukládám poznámku při opuštění pole pro den ${day}, hodina ${hour}: "${noteText}"`);

    const dateObj = addDays(currentStartOfWeek, day);
    const date = format(dateObj, 'yyyy-MM-dd');
    const time = formatHour(hour);

    if (!noteText) {
        // Pokud nechcete mazat prázdné poznámky, jednoduše přerušte funkci
        console.log(`Poznámka pro den ${day}, hodina ${hour} je prázdná. Neprovádím žádnou akci.`);
        saveSelectedDateToLocalStorage(dateObj); // Uložení do local storage
        return;
    }

    console.log(`Ukládám poznámku pro ${date} v ${time}: "${noteText}"`);
    await saveNoteToFirebase(date, time, noteText);
    saveSelectedDateToLocalStorage(dateObj); // Uložení do local storage
}

// Načtení a Zobrazení Poznámky pro Konkrétní Buňku
async function fetchNoteForCell(noteTextElement, day, hour, startOfWeek, spinner) {
    const dateObj = addDays(startOfWeek, day);
    const date = format(dateObj, 'yyyy-MM-dd');
    const time = formatHour(hour);

    console.log(`Načítám poznámku pro den ${day}, hodina ${hour} (${date} ${time})`);

    // Zobrazení spinneru
    spinner.style.display = "block";

    const noteText = await fetchNoteFromFirebase(date, time);
    noteTextElement.innerText = sanitizeInput(noteText || '');

    // Skrytí spinneru po načtení
    spinner.style.display = "none";

    console.log(`Načtena poznámka pro ${date} v ${time}: "${noteText}"`);
}

// ========================
// Zvýraznění Vybraného Týdne v Kalendářích
// ========================
function highlightSelectedWeek(startOfWeek) {
    console.log("Zvýrazňuji vybraný týden v kalendářích.");

    // Zvýraznění v Mini Kalendáři
    const miniCalendarCells = document.querySelectorAll("#mini-calendar-container td");
    miniCalendarCells.forEach(cell => {
        const day = parseInt(cell.innerText, 10);
        if (isNaN(day)) return;

        const cellDate = new Date(baseDate.getFullYear(), baseDate.getMonth(), day);
        if (isDateInCurrentSelectedWeek(cellDate)) {
            cell.classList.add("selected-week");
            console.log(`Buňka mini kalendáře pro den ${day} je ve vybraném týdnu.`);
        } else {
            cell.classList.remove("selected-week");
        }
    });

    // Zvýraznění v Ročním Kalendáři Modal
    const yearCalendarCells = document.querySelectorAll(".year-calendar-modal td");
    yearCalendarCells.forEach(cell => {
        const day = parseInt(cell.innerText, 10);
        if (isNaN(day)) return;

        const monthHeader = cell.closest(".month-container-modal").querySelector("h5");
        if (!monthHeader) return;

        const monthName = monthHeader.textContent.trim();
        const monthIndex = new Date(`${monthName} 1, ${baseDate.getFullYear()}`).getMonth();
        const cellDate = new Date(baseDate.getFullYear(), monthIndex, day);

        if (isDateInCurrentSelectedWeek(cellDate)) {
            cell.classList.add("selected-week");
            console.log(`Buňka ročního kalendáře pro den ${day}, měsíc ${monthIndex + 1} je ve vybraném týdnu.`);
        } else {
            cell.classList.remove("selected-week");
        }
    });
}

// ========================
// Reálný Čas
// ========================
function setupClock() {
    const clockElement = document.getElementById("real-time-clock");
    if (!clockElement) {
        console.error("Element s ID 'real-time-clock' nebyl nalezen.");
        return;
    }

    console.log("Inicializuji reálný čas.");

    function updateClock() {
        const now = new Date();
        const hours = now.getHours().toString().padStart(2, '0');
        const minutes = now.getMinutes().toString().padStart(2, '0');
        const seconds = now.getSeconds().toString().padStart(2, '0');
        clockElement.innerText = `${hours}:${minutes}:${seconds}`;
    }

    updateClock(); // Počáteční volání
    setInterval(updateClock, 1000); // Aktualizace každou sekundu
}

// ========================
// Funkce pro Aktualizaci Zobrazení
// ========================

// Aktualizace Zobrazení Roku a Měsíce
function updateYearAndMonthDisplay() {
    const currentYearElement = document.getElementById("current-year");
    const currentMonthNameElement = document.getElementById("current-month-name");
    const selectedMonthElement = document.getElementById("selected-month");

    console.log("Aktualizuji zobrazení roku a měsíce...");
    console.log("currentYearElement:", currentYearElement);
    console.log("currentMonthNameElement:", currentMonthNameElement);
    console.log("selectedMonthElement:", selectedMonthElement);

    if (currentYearElement) {
        const currentYear = baseDate.getFullYear();
        currentYearElement.innerText = currentYear;
        console.log(`Nastaven aktuální rok na ${currentYear}`);
    } else {
        console.error("Element s ID 'current-year' nebyl nalezen.");
    }

    if (currentMonthNameElement) {
        const currentMonthName = baseDate.toLocaleString('cs-CZ', { month: 'long' });
        currentMonthNameElement.innerText = currentMonthName.toUpperCase();
        console.log(`Nastaven aktuální měsíc na ${currentMonthName.toUpperCase()}`);
    } else {
        console.error("Element s ID 'current-month-name' nebyl nalezen.");
    }

    if (selectedMonthElement) {
        const currentMonthName = baseDate.toLocaleString('cs-CZ', { month: 'long' });
        selectedMonthElement.innerText = `Vybraný měsíc: ${currentMonthName.toUpperCase()}`;
        console.log(`Nastaven vybraný měsíc na ${currentMonthName.toUpperCase()}`);
    } else {
        console.error("Element s ID 'selected-month' nebyl nalezen.");
    }
}

// Aktualizace Zobrazení Dnešního Data
function updateTodayDate() {
    const todayDateElement = document.getElementById("today-date");
    if (!todayDateElement) {
        console.error("Element s ID 'today-date' nebyl nalezen.");
        return;
    }
    const today = new Date();
    const day = today.getDate().toString().padStart(2, '0');
    const month = (today.getMonth() + 1).toString().padStart(2, '0');
    const year = today.getFullYear();
    todayDateElement.innerText = `${day}.${month}.${year}`;
}

// Aktualizace Zobrazení Čísla Vybraného Týdne
function updateSelectedWeekNumber(startOfWeek) {
    const selectedWeekNumberElement = document.getElementById("selected-week-number");
    if (!selectedWeekNumberElement) {
        console.error("Element s ID 'selected-week-number' nebyl nalezen.");
        return;
    }
    const weekNumber = getWeekNumber(startOfWeek);
    selectedWeekNumberElement.innerText = `${weekNumber}. TÝDEN`;
}

// ========================
// Další Navigační Funkce
// ========================

// Navigace na Konkrétní Datum
function goToSpecificDate(dateStr) {
    console.log(`Navigace na konkrétní datum: ${dateStr}`);
    baseDate = new Date(dateStr);
    currentStartOfWeek = getStartOfWeek(baseDate); // Aktualizace týdne na základě vybraného data
    renderPlanner(); // Přerenderování plánovače s aktualizovanými daty
    renderMiniCalendar();
    renderYearCalendarModal();
    updateYearAndMonthDisplay();
    saveSelectedDateToLocalStorage(baseDate); // Uložení do local storage
}

// ========================
// Funkce pro Local Storage
// ========================

// Uložení Vybraného Data do Local Storage
function saveSelectedDateToLocalStorage(date) {
    const dateStr = date.toISOString();
    localStorage.setItem("selectedDate", dateStr);
    console.log(`Vybraný datum uložen do local storage: ${dateStr}`);
}

// ========================
// Integrace Web Speech API pro Přepis
// ========================
function setupWebSpeechAPI() {
    console.log("Inicializuji Web Speech API pro přepis hlasu.");

    // Kontrola podpory prohlížečem
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        showToast("Web Speech API není podporováno ve vašem prohlížeči. Prosím, použijte Google Chrome nebo Mozilla Firefox.", 'error');
        console.error("Web Speech API není podporováno ve vašem prohlížeči.");
        return;
    }

    recognition = new SpeechRecognition();
    recognition.lang = 'cs-CZ'; // Nastavení jazyka na češtinu
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    // Obsluha výsledků přepisu hlasu
    recognition.addEventListener('result', (event) => {
        console.log("Přepis hlasu dokončen. Zpracovávám výsledky.");
        const transcript = event.results[0][0].transcript.trim();
        console.log(`Transkript: "${transcript}"`);
        if (currentTranscribingCell) {
            currentTranscribingCell.innerText = transcript;
            const day = parseInt(currentTranscribingCell.getAttribute('data-day'), 10);
            const hour = parseInt(currentTranscribingCell.getAttribute('data-hour'), 10);
            const dateObj = addDays(currentStartOfWeek, day);
            const date = format(dateObj, 'yyyy-MM-dd');
            const time = formatHour(hour);
            console.log(`Ukládám přepis pro den ${day}, hodina ${hour}: "${transcript}"`);
            saveNoteToFirebase(date, time, transcript)
                .then(() => {
                    showToast(`Poznámka přidána: "${transcript}"`, 'success');
                })
                .catch((error) => {
                    showToast("Chyba při ukládání poznámky.", 'error');
                });
            saveSelectedDateToLocalStorage(dateObj); // Uložení do local storage
            stopTranscription(); // Vyčištění aktuální transkripční buňky
        } else {
            console.warn("Aktivní buňka pro přepis nebyla nalezena.");
        }
    });

    // Obsluha události 'speechend' bez volání stopTranscription
    recognition.addEventListener('speechend', () => {
        console.log("Přepis hlasu skončil (speechend).");
        // Nepřesouvat 'stopTranscription' zde, aby 'result' mohl zpracovat transkript
    });

    recognition.addEventListener('error', (event) => {
        console.error(`Chyba přepisu hlasu (${event.error}):`, event);
        showToast(`Chyba přepisu hlasu: ${event.error}. Prosím, zkuste to znovu.`, 'error');
        if (currentTranscribingCell) {
            stopTranscription();
        }
    });
}

// ========================
// Správa Přepisu Hlasu
// ========================
function startTranscription(noteTextElement) {
    console.log("Spouštím přepis hlasu.");
    if (currentTranscribingCell) {
        showToast("Již probíhá přepis.", 'error');
        console.warn("Pokus o zahájení přepisu, zatímco již běží jiný přepis.");
        return;
    }

    currentTranscribingCell = noteTextElement;
    const micIcon = noteTextElement.parentElement.querySelector('.cell-mic');
    micIcon.classList.add('active');

    // Přidání třídy 'recording' k buňce
    const cell = noteTextElement.closest('td');
    cell.classList.add('recording');

    try {
        recognition.start();
        console.log("Přepis hlasu zahájen.");
        showToast("Začíná přepis hlasu. Prosím, mluvte nyní.", 'success');
    } catch (error) {
        console.error("Chyba při spuštění přepisu hlasu:", error);
        showToast("Nepodařilo se spustit přepis hlasu.", 'error');
    }
}

function stopTranscription() {
    console.log("Zastavuji přepis hlasu.");
    if (recognition && currentTranscribingCell) {
        recognition.stop();
        const micIcon = currentTranscribingCell.parentElement.querySelector('.cell-mic');
        micIcon.classList.remove('active');

        // Odebrání třídy 'recording' z buňky
        const cell = currentTranscribingCell.closest('td');
        cell.classList.remove('recording');

        console.log("Přepis hlasu zastaven.");
        currentTranscribingCell = null;
    } else {
        console.warn("Pokoušíte se zastavit přepis, ale žádný přepis neběží.");
    }
}

// ========================
// Funkce pro Smazání Poznámky
// ========================

function clearNote(noteTextElement, day, hour) {
    if (confirm("Opravdu chcete smazat tuto poznámku?")) {
        console.log(`Smažu poznámku pro den ${day}, hodina ${hour}.`);
        noteTextElement.innerText = '';
        const dateObj = addDays(currentStartOfWeek, day);
        const date = format(dateObj, 'yyyy-MM-dd');
        const time = formatHour(hour);
        deleteNoteFromFirebase(date, time)
            .then(() => {
                showToast("Poznámka byla úspěšně smazána.", 'success');
            })
            .catch((error) => {
                showToast("Chyba při mazání poznámky.", 'error');
            });
    }
}

// ========================
// Funkce pro Toast Notifikace
// ========================

function showToast(message, type = 'success') {
    const toastEl = document.getElementById('notification-toast');
    if (!toastEl) {
        console.error("Element s ID 'notification-toast' nebyl nalezen.");
        return;
    }
    const toastBody = toastEl.querySelector('#toast-body');
    const toastTitle = toastEl.querySelector('#toast-title');
    const toastHeader = toastEl.querySelector('.toast-header');

    toastBody.innerText = message;
 
 

    // Přidat třídy na základě typu
    if (type === 'success') {
        toastBody.innerHTML ='<i class="bi bi-info-square text-success me-2"></i>' +toastBody.innerHTML;
        } else if (type === 'error') {
            toastBody.innerHTML ='<i class="bi bi-exclamation-triangle text-danger me-2"></i>'+ toastBody.innerHTML;
        }

    const toast = new bootstrap.Toast(toastEl);
    toast.show();
}
