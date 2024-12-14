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

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Get a reference to the database
const database = firebase.database();

// ========================
// Global Variables
// ========================
let isAnimating = false;
let baseDate = new Date(); // Tracks the currently selected date
let currentStartOfWeek = null;
let currentTranscribingCell = null; // Tracks the cell being transcribed into
let recognition = null; // SpeechRecognition instance
let isRecognizing = false; // Tracks if transcription is active
let topMicIcon = null;
// Swipe Variables
let touchStartX = null;
let touchEndX = null;
let isSwiping = false;

// ========================
// Calendar Data
// ========================

/**
 * Data kalendáře obsahující svátky a jmeniny.
 * Klíče jsou formátovány jako "den.měsíc.", např. "1.1." pro 1. ledna.
 */

// ========================
// Utility and Helper Functions
// ========================

// Debounce Function to Limit Frequency of Function Calls
function debounce(func, wait) {
    let timeout;
    return function (...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), wait);
    };
}

// Add Days to a Date
function addDays(date, days) {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
}

function format(date, formatStr) {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');

    if (formatStr === 'yyyy-MM-dd') {
        return `${year}-${month}-${day}`;
    } else if (formatStr === 'dd.MM.yyyy') {
        return `${day}.${month}.${year}`;
    }
    // Add more formats as needed
    return date.toString();
}

function updateWeekIntervalDisplay() {
    const weekIntervalElement = document.getElementById("current-week-interval");
    if (!weekIntervalElement) {
        console.error("Element with ID 'current-week-interval' not found.");
        return;
    }
    const startOfWeek = getStartOfWeek(baseDate);
    const endOfWeek = getEndOfWeek(startOfWeek);
    const formattedStart = format(startOfWeek, 'dd.MM.yyyy');
    const formattedEnd = format(endOfWeek, 'dd.MM.yyyy');
    weekIntervalElement.innerText = `${formattedStart}\n ${formattedEnd}`;
}

// Get Week Number for a Date (ISO 8601)
function getWeekNumberISO(date) {
    const target = new Date(date.valueOf());
    const dayNr = (date.getDay() + 6) % 7; // Monday=0, Sunday=6
    target.setDate(target.getDate() - dayNr + 3);
    const firstThursday = target.valueOf();
    target.setMonth(0, 1);
    if (target.getDay() !== 4) {
        target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7);
    }
    const weekNumber = 1 + Math.ceil((firstThursday - target) / 604800000);
    return weekNumber;
}

// Get Month Name in Czech
function getMonthName(date) {
    const monthNamesCzech = [
        "Leden", "Únor", "Březen", "Duben", "Květen", "Červen",
        "Červenec", "Srpen", "Září", "Říjen", "Listopad", "Prosinec"
    ];
    return monthNamesCzech[date.getMonth()];
}

function getStartOfWeek(date) {
    const result = new Date(date);
    const day = result.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    const diff = day === 0 ? -6 : 1 - day; // Adjust so that Monday is the start of the week
    result.setDate(result.getDate() + diff);
    result.setHours(0, 0, 0, 0); // Reset time
    return result;
}

function getEndOfWeek(startOfWeek) {
    const result = new Date(startOfWeek);
    result.setDate(result.getDate() + 6); // Add 6 days to get Sunday
    result.setHours(23, 59, 59, 999); // Set time to the end of the day
    return result;
}

// Get Day Index from Date relative to the Start of the Week
function getDayFromDate(date) {
    const startOfWeek = getStartOfWeek(baseDate);
    const dayDiff = Math.floor((new Date(date) - startOfWeek) / (24 * 60 * 60 * 1000));
    return dayDiff;
}

// Get Hour from Time String
function getHourFromTime(timeString) {
    return parseInt(timeString.split(':')[0], 10);
}

// Sanitize Input to Prevent XSS
function sanitizeInput(str) {
    if (!str) return '';
    const temp = document.createElement('div');
    temp.textContent = str;
    return temp.innerHTML;
}

// Format Hour
function formatHour(hour) {
    return hour.toString().padStart(2, '0') + ':00';
}

function formatHourShort(hour) {
    return hour.toString().padStart(2, '0') + ':00';
}

// ========================
// New Function: isDateInCurrentSelectedWeek
// ========================

/**
 * Kontroluje, zda je dané datum v aktuálně vybraném týdnu.
 * @param {Date} date - Datum k ověření.
 * @returns {boolean} - Vrací true, pokud je datum v aktuálním týdnu, jinak false.
 */
function isDateInCurrentSelectedWeek(date) {
    const startOfWeek = getStartOfWeek(baseDate);
    const endOfWeek = getEndOfWeek(startOfWeek);
    return date >= startOfWeek && date <= endOfWeek;
}

// ========================
// Firebase Operations
// ========================

// Save Note to Firebase
async function saveNoteToFirebase(date, time, text) {
    const dateObj = new Date(date);
    const weekStart = getStartOfWeek(dateObj);
    const weekNumber = getWeekNumberISO(weekStart);
    const monthName = getMonthName(weekStart);

    const dayIndex = getDayFromDate(dateObj);
    const hourIndex = getHourFromTime(time);

    const noteRef = database.ref(`planner/${monthName}/week_${weekNumber}/day${dayIndex}/hour${hourIndex}`);

    return noteRef.set(text)
        .then(() => {
            console.log(`Note successfully saved for ${date} at ${time}.`);
            showToast("Poznámka úspěšně uložena.", 'success');
        })
        .catch(error => {
            console.error(`Error saving note for ${date} at ${time}:`, error);
            showToast("Chyba ukládání poznámky.", 'error');
        });
}

// Delete Note from Firebase
async function deleteNoteFromFirebase(date, time) {
    const dateObj = new Date(date);
    const weekStart = getStartOfWeek(dateObj);
    const weekNumber = getWeekNumberISO(weekStart);
    const monthName = getMonthName(weekStart);

    const dayIndex = getDayFromDate(dateObj);
    const hourIndex = getHourFromTime(time);

    const noteRef = database.ref(`planner/${monthName}/week_${weekNumber}/day${dayIndex}/hour${hourIndex}`);

    return noteRef.remove()
        .then(() => {
            console.log(`Note successfully deleted for ${date} at ${time}.`);
            showToast("Poznámka úspěšně smazána.", 'success');
        })
        .catch(error => {
            console.error(`Error deleting note for ${date} at ${time}:`, error);
            showToast("Nepodařilo se smazat poznámku.", 'error');
        });
}

// Fetch Specific Note from Firebase
function fetchNoteFromFirebase(date, time) {
    const dateObj = new Date(date);
    const weekStart = getStartOfWeek(dateObj);
    const weekNumber = getWeekNumberISO(weekStart);
    const monthName = getMonthName(weekStart);
    const dayIndex = getDayFromDate(dateObj);
    const hourIndex = getHourFromTime(time);

    const noteRef = database.ref(`planner/${monthName}/week_${weekNumber}/day${dayIndex}/hour${hourIndex}`);

    return noteRef.once('value')
        .then(snapshot => snapshot.val())
        .catch(error => {
            console.error(`Error fetching note for ${date} at ${time}:`, error);
            showToast("Nepodařilo se načíst poznámku.", 'error');
            return null;
        });
}

// Fetch All Notes for a Specific Week from Firebase
function fetchNotesForWeekFromFirebase(weekStartDate) {
    const startOfWeek = getStartOfWeek(new Date(weekStartDate));
    const weekNumber = getWeekNumberISO(startOfWeek);
    const monthName = getMonthName(startOfWeek);
    const weekRef = database.ref(`planner/${monthName}/week_${weekNumber}`);

    return weekRef.once('value')
        .then(snapshot => snapshot.val())
        .catch(error => {
            console.error("Error fetching notes from Firebase:", error);
            showToast("Nepodařilo se načíst poznámky z Firebase.", 'error');
            return null;
        });
}

// ========================
// Render Weekly Planner
// ========================
async function renderPlanner() {
    console.log("Rendering planner...");

    // Calculate start and end of the week
    currentStartOfWeek = getStartOfWeek(baseDate);
    const currentEndOfWeek = getEndOfWeek(currentStartOfWeek);

    // Render headers and time slots for the correct week
    renderHeaders(currentStartOfWeek);
    renderTimeSlots(currentStartOfWeek);

    // Highlight the selected week and update the week number display
    highlightSelectedWeek(currentStartOfWeek);

    // Fetch and display notes for the week
    const weekStartDate = format(currentStartOfWeek, 'yyyy-MM-dd');
    console.log(`Fetching notes for the week starting: ${weekStartDate}`);
    const weekNotes = await fetchNotesForWeekFromFirebase(weekStartDate);
    if (weekNotes) {
        console.log("Notes found. Populating planner.");
        populatePlannerWithNotes(weekNotes);
    } else {
        console.log("No notes found for the current week.");
    }

    // Update the week interval display
    updateWeekIntervalDisplay();
}

// ========================
// Populate Planner with Notes
// ========================
function populatePlannerWithNotes(notes) {
    console.log("Populating planner with loaded notes...");
    for (const [dayKey, hours] of Object.entries(notes)) {
        const dayIndex = parseInt(dayKey.replace("day", ""), 10);
        for (const [hourKey, noteText] of Object.entries(hours)) {
            const hourIndex = parseInt(hourKey.replace("hour", ""), 10);
            const cell = document.querySelector(`td[data-day="${dayIndex}"][data-hour="${hourIndex}"] .note-text`);
            if (cell) {
                cell.innerText = sanitizeInput(noteText);
                console.log(`Note for day ${dayIndex}, hour ${hourIndex} set to: "${noteText}"`);
            }
        }
    }
}
// ========================
// Calendar Rendering Functions
// ========================

function renderHeaders(startOfWeek) {
    const dayHeaders = document.getElementById("day-headers");
    if (!dayHeaders) {
        console.error("Element with ID 'day-headers' not found.");
        return;
    }
    dayHeaders.innerHTML = ""; // Clear existing headers

    for (let i = 0; i < 7; i++) {
        const dayDate = addDays(startOfWeek, i);
        const formattedDate = `${dayDate.getDate()}.${(dayDate.getMonth() + 1)}.`; // Day.Month.
        const day2 = dayDate.getDate() < 10 ? `0${dayDate.getDate()}` : dayDate.getDate();
        const month2 = (dayDate.getMonth() + 1) < 10 ? `0${dayDate.getMonth() + 1}` : (dayDate.getMonth() + 1);
        const formattedDate2 = `${day2}.${month2}.`;
        const th = document.createElement("th");
        th.classList.add("mdc-data-table__header-cell", "day-header");

        const weekdayName = capitalizeFirstLetter(dayDate.toLocaleString("cs-CZ", { weekday: "long" }));

        const rotatedDateDiv = document.createElement("div");
        rotatedDateDiv.classList.add("rotated-date");
        rotatedDateDiv.innerText = formattedDate2;

        const headerContentDiv = document.createElement("div");
        headerContentDiv.classList.add("day-header-content");

        headerContentDiv.innerHTML = `
            <div class="mdc-typography--body2 day-info">
                <div class="holiday-name">${calendarData[formattedDate]?.holiday || ""}</div>
                <div class="name-day">${calendarData[formattedDate]?.nameDay || ""}</div>
                <div class="day-name">
                    <strong>${weekdayName}</strong>
                </div>
            </div>
        `;

        th.appendChild(rotatedDateDiv);
        th.appendChild(headerContentDiv);
        dayHeaders.appendChild(th);
    }
}


function renderTimeSlots(startOfWeek) {
    const tbody = document.getElementById("time-slots");
    if (!tbody) {
        console.error("Element with ID 'time-slots' not found.");
        return;
    }
    tbody.innerHTML = ""; // Clear existing slots

    const startHour = 7; // Start hour for time slots
    const endHour = 20; // End hour for time slots

    for (let hour = startHour; hour <= endHour; hour++) {
        const row = document.createElement("tr");
        row.className = "mdc-data-table__row";

        for (let day = 0; day < 7; day++) {
            const cell = createTimeSlotCell(day, hour, startOfWeek);
            row.appendChild(cell);
        }

        tbody.appendChild(row);
    }
}
function createTimeSlotCell(day, hour, startOfWeek) {
    const cell = document.createElement("td");
    cell.className = "time-slot mdc-data-table__cell";
    cell.dataset.day = day;
    cell.dataset.hour = hour;
    cell.tabIndex = 0; // Enable focus for keyboard navigation

    const noteContainer = createNoteContainer(day, hour, startOfWeek);
    cell.appendChild(noteContainer);

    return cell;
}
function createNoteContainer(day, hour, startOfWeek) {
    const container = document.createElement("div");
    container.className = "note-text-container";

    const timeLabel = document.createElement("div");
    timeLabel.className = "time-label mdc-typography--caption";
    timeLabel.innerText = formatHourShort(hour);

    const noteText = createNoteTextElement(day, hour);

    container.appendChild(timeLabel);
    container.appendChild(noteText);

    return container;
}

function createNoteTextElement(day, hour) {
    const noteText = document.createElement("div");
    noteText.className = "note-text mdc-typography--body1";
    noteText.contentEditable = true;
    noteText.dataset.day = day;
    noteText.dataset.hour = hour;

    noteText.addEventListener("input", debounce((event) => handleNoteInput(event, day, hour), 500));
    noteText.addEventListener("blur", (event) => saveNoteDirectly(event, day, hour));

    return noteText;
}

// ========================
// Handle Note Input and Save
// ========================

const handleNoteInput = debounce((event, day, hour) => {
    const noteText = event.target.innerText.trim();
    const dateObj = addDays(currentStartOfWeek, day);
    const date = format(dateObj, 'yyyy-MM-dd');
    const time = formatHour(hour);

    if (!noteText) return; // Skip saving if note is empty

    saveNoteToFirebase(date, time, noteText);
}, 500);

// Save Note Directly on Blur Event
async function saveNoteDirectly(event, day, hour) {
    const noteText = event.target.innerText.trim();
    console.log(`Saving note on blur for day ${day}, hour ${hour}: "${noteText}"`);

    const dateObj = addDays(currentStartOfWeek, day);
    const date = format(dateObj, 'yyyy-MM-dd');
    const time = formatHour(hour);

    if (!noteText) {
        console.log(`Note for day ${day}, hour ${hour} is empty. Not performing any action.`);
        saveSelectedDateToLocalStorage(dateObj); // Save to local storage
        return;
    }

    console.log(`Saving note for ${date} at ${time}: "${noteText}"`);
    await saveNoteToFirebase(date, time, noteText);
    saveSelectedDateToLocalStorage(dateObj); // Save to local storage
}

// ========================
// Fetch Note for Specific Cell
// ========================
async function fetchNoteForCell(noteTextElement, day, hour, startOfWeek, spinnerElement) {
    const dateObj = addDays(startOfWeek, day);
    const date = format(dateObj, 'yyyy-MM-dd');
    const time = formatHour(hour);

    // Show spinner
    spinnerElement.style.display = "block";

    // Initialize MDC Circular Progress
    const spinner = new mdc.circularProgress.MDCCircularProgress(spinnerElement);
    spinner.determinate = true;
    spinner.progress = 0;

    try {
        const noteText = await fetchNoteFromFirebase(date, time);
        noteTextElement.innerText = sanitizeInput(noteText || '');
    } catch (error) {
        console.error(`Error loading note for ${date} at ${time}:`, error);
    }

    // Hide spinner after loading
    spinnerElement.style.display = "none";

    // Destroy spinner instance
    spinner.destroy();

    console.log(`Loaded note for ${date} at ${time}: "${noteTextElement.innerText}"`);
}

// ========================
// Render Year Calendar Modal
// ========================
function renderYearCalendarModal() {
    const modalBody = document.querySelector(".year-calendar-modal .modal-body");
    if (!modalBody) {
        console.error("Element '.year-calendar-modal .modal-body' not found.");
        return;
    }

    let currentYear = baseDate.getFullYear();
    let selectedMonth = baseDate.getMonth(); // 0-indexed (0 = January)
    let daysInMonth = new Date(currentYear, selectedMonth + 1, 0).getDate();
    let firstDay = new Date(currentYear, selectedMonth, 1);

    // Get and display the interval for the current week
    let weekStartDate = getStartOfWeek(baseDate);
    let weekEndDate = getEndOfWeek(weekStartDate);
    let monthHeader = document.querySelector(".year-calendar-modal .mdc-dialog__title");

    // Update dialog title with week number and year
    let weekNumber = getWeekNumberISO(weekStartDate);
    monthHeader.innerText = `Týden ${weekNumber}, ${currentYear}`;

    // Clear previous content in modal body
    modalBody.innerHTML = "";

    // Create table for calendar
    const table = document.createElement("table");
    table.className = "mdc-data-table__table table-bordered text-center";

    // Create table header
    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    headerRow.className = "mdc-data-table__header-row";
    const thWeek = document.createElement("th");
    thWeek.innerText = "Týden";
    thWeek.className = "mdc-data-table__header-cell";
    headerRow.appendChild(thWeek);
    ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"].forEach((day) => {
        const th = document.createElement("th");
        th.innerText = day;
        th.className = "mdc-data-table__header-cell";
        headerRow.appendChild(th);
    });

    thead.appendChild(headerRow);
    table.appendChild(thead);

    // Create table body
    const tbody = document.createElement("tbody");
    tbody.className = "mdc-data-table__content";
    let weekRow = document.createElement("tr");
    weekRow.className = "mdc-data-table__row";

    // Initialize week number
    let weekNumberRow = getWeekNumberISO(firstDay);

    // Add week number cell
    const weekCell = document.createElement("td");
    weekCell.innerText = `${weekNumberRow}`;
    weekCell.className = 'weekname mdc-data-table__cell';
    weekRow.appendChild(weekCell);

    // Calculate number of empty cells before the first day
    const emptyCells = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;

    // Append empty cells for days before the first day of the month
    for (let i = 0; i < emptyCells; i++) {
        const emptyCell = document.createElement("td");
        emptyCell.className = "mdc-data-table__cell";
        weekRow.appendChild(emptyCell);
    }

    // Fill in the days
    for (let day = 1; day <= daysInMonth; day++) {
        const dayDate = new Date(currentYear, selectedMonth, day);
        const dayCell = document.createElement("td");
        dayCell.innerText = day;
        dayCell.className = "mdc-data-table__cell";

        // Highlight the selected week
        if (isDateInCurrentSelectedWeek(dayDate)) {
            dayCell.classList.add("table-success", "selected-cell");
        }

        // Add click event to select the day
        dayCell.addEventListener("click", () => {
            baseDate = dayDate; // Update the global selected date
            renderPlanner(); // Update the planner
            renderYearCalendarModal(); // Re-render modal content
            highlightSelectedWeek(baseDate); // Update the selected week highlight
        });

        weekRow.appendChild(dayCell);

        // If the current day is Sunday or the last day of the month, start a new week row
        if (dayDate.getDay() === 0 || day === daysInMonth) {
            // Fill the remaining cells of the last week if the month doesn't end on Sunday
            if (day === daysInMonth && dayDate.getDay() !== 0) {
                const remainingCells = 7 - (dayDate.getDay() === 0 ? 7 : dayDate.getDay());
                for (let i = 0; i < remainingCells; i++) {
                    const emptyCell = document.createElement("td");
                    emptyCell.className = "mdc-data-table__cell";
                    weekRow.appendChild(emptyCell);
                }
            }

            tbody.appendChild(weekRow);
            weekRow = document.createElement("tr");
            weekRow.className = "mdc-data-table__row";

            // Increment week number
            weekNumberRow++;
            const newWeekCell = document.createElement("td");
            newWeekCell.innerText = `${weekNumberRow}`;
            newWeekCell.className = 'weekname mdc-data-table__cell';
            weekRow.appendChild(newWeekCell);
        }
    }

    table.appendChild(tbody);
    modalBody.appendChild(table);

    // Initialize MDC Data Table
    mdc.dataTable.MDCDataTable.attachTo(table);

    // Highlight the selected week after rendering
    highlightSelectedWeek(baseDate);
}

// ========================
// Navigation and Event Listeners
// ========================
function highlightSelectedWeek(selectedDate) {
    console.log("Highlighting selected week in calendars.");

    // Get the start and end of the selected week
    const startOfWeek = getStartOfWeek(selectedDate);
    const endOfWeek = getEndOfWeek(startOfWeek);

    // Highlight in Year Calendar Modal
    const yearCalendarCells = document.querySelectorAll(".year-calendar-modal td");
    yearCalendarCells.forEach((cell) => {
        const day = parseInt(cell.innerText, 10);
        if (isNaN(day)) return;

        const month = baseDate.getMonth(); // Ensure the current month context
        const cellDate = new Date(baseDate.getFullYear(), month, day);

        if (isDateInCurrentSelectedWeek(cellDate)) {
            cell.classList.add("table-success");
        } else {
            cell.classList.remove("table-success");
        }
    });
}

function setupSwipeListeners() {
    const plannerContainer = document.querySelector(".planner-table-container");

    if (!plannerContainer) {
        console.error("Planner table container not found for swipe listeners.");
        return;
    }

    // Remove existing listeners to prevent duplicate handlers
    plannerContainer.removeEventListener('touchstart', handleTouchStart);
    plannerContainer.removeEventListener('touchmove', handleTouchMove);
    plannerContainer.removeEventListener('touchend', handleTouchEnd);

    // Check if touch events are supported
    if ('ontouchstart' in window || navigator.maxTouchPoints) {
        // Attach new listeners
        plannerContainer.addEventListener('touchstart', handleTouchStart, false);
        plannerContainer.addEventListener('touchmove', handleTouchMove, false);
        plannerContainer.addEventListener('touchend', handleTouchEnd, false);
    }
}

function handleTouchStart(event) {
    touchStartX = event.changedTouches[0].clientX;
    isSwiping = true;
}

function handleTouchMove(event) {
    if (!isSwiping) return;
    touchEndX = event.changedTouches[0].clientX;
}

function handleTouchEnd(event) {
    if (!isSwiping) return;
    handleSwipeGesture();
    isSwiping = false;
}

function handleSwipeGesture() {
    if (touchStartX === null || touchEndX === null) return;
    const deltaX = touchEndX - touchStartX;
    const threshold = 50; // Adjust as necessary
    if (deltaX > threshold) {
        moveToPreviousWeek();
    } else if (deltaX < -threshold) {
        moveToNextWeek();
    }
    touchStartX = null;
    touchEndX = null;
}

function setupKeyboardNavigation() {
    // Initialize currentCell to null. Selection starts only when a cell is clicked or a key is pressed.
    let currentCell = null;

    // Function to select a cell
    function selectCell(cell) {
        if (currentCell) {
            currentCell.classList.remove("selected-cell");
        }
        currentCell = cell;
        if (currentCell) {
            currentCell.classList.add("selected-cell");
            // Update currentTranscribingCell to the .note-text element within the selected cell
            currentTranscribingCell = currentCell.querySelector('.note-text');
            console.log("Selected cell:", currentCell);
            console.log("Current Transcribing Cell:", currentTranscribingCell);
            focusEditableContent(currentCell);
        }
    }

    // Function to focus on editable content within the cell
    function focusEditableContent(cell) {
        const editable = cell.querySelector('.note-text');
        if (editable) {
            editable.focus();
        }
    }

    // Function to start transcription
    function startTranscription(cell) {
        // Trigger click on the mic icon to start transcription
        topMicIcon.click();
    }

    // Add click event listeners to all time-slot cells to allow mouse selection
    const timeSlots = document.querySelectorAll(".time-slot");
    timeSlots.forEach(cell => {
        cell.addEventListener('click', () => {
            selectCell(cell);
        });
    });

    document.addEventListener("keydown", function (event) {
        const KEY_ARROW_RIGHT = "ArrowRight";
        const KEY_ARROW_LEFT = "ArrowLeft";
        const KEY_ARROW_DOWN = "ArrowDown";
        const KEY_ARROW_UP = "ArrowUp";
        const KEY_CTRL = "Control";

        // Handle Ctrl + Key combinations first
        if (event.ctrlKey) {
            if (event.key === 'c' || event.key === 'C') { // Example: Ctrl+C to start transcription
                event.preventDefault(); // Prevent default behavior
                if (currentTranscribingCell) {
                    startTranscription(currentTranscribingCell);
                } else {
                    showToast("Prosím, vyberte buňku, do které chcete přepsat hlas.", 'info');
                }
                return; // Exit after handling Ctrl+Key
            }

            // Add more Ctrl+Key handlers here if needed
        }

        // If no cell is selected, select the first cell on any arrow key press
        if (!currentCell && [KEY_ARROW_RIGHT, KEY_ARROW_LEFT, KEY_ARROW_DOWN, KEY_ARROW_UP].includes(event.key)) {
            currentCell = document.querySelector(".time-slot");
            if (currentCell) {
                selectCell(currentCell);
                event.preventDefault();
            }
            return;
        }

        if (!currentCell) return; // If still no cell is selected, do nothing

        let nextCell = null;
        const day = parseInt(currentCell.dataset.day, 10);
        const hour = parseInt(currentCell.dataset.hour, 10);

        switch (event.key) {
            case KEY_ARROW_RIGHT:
                nextCell = document.querySelector(`td[data-day="${(day + 1) % 7}"][data-hour="${hour}"]`);
                break;
            case KEY_ARROW_LEFT:
                nextCell = document.querySelector(`td[data-day="${(day - 1 + 7) % 7}"][data-hour="${hour}"]`);
                break;
            case KEY_ARROW_DOWN:
                nextCell = document.querySelector(`td[data-day="${day}"][data-hour="${hour + 1 <= 20 ? hour + 1 : 7}"]`);
                break;
            case KEY_ARROW_UP:
                nextCell = document.querySelector(`td[data-day="${day}"][data-hour="${hour - 1 >= 7 ? hour - 1 : 20}"]`);
                break;
            default:
                return; // Ignore other keys
        }

        // If a valid next cell exists, move focus
        if (nextCell) {
            event.preventDefault(); // Prevent default scrolling behavior
            selectCell(nextCell);
        }
    });
}

// ========================
// Function to Request Microphone Permission
// ========================
function requestMicrophonePermission() {
    return new Promise((resolve, reject) => {
        try {
            recognition.start();
            recognition.onstart = () => {
                recognition.stop();
                recognition.onstart = null;
                microphonePermissionGranted = true;
                console.log("Microphone permission granted.");
                resolve();
            };
        } catch (error) {
            console.error("Error requesting microphone permission:", error);
            reject(error);
        }
    });
}

// ========================
// Week Navigation Functions
// ========================
function moveToNextWeek() {
    if (isAnimating) return; // Prevent overlapping animations
    isAnimating = true;

    // Update baseDate to next week
    baseDate = addDays(baseDate, 7);
    renderPlanner();
    renderYearCalendarModal();
    // After rendering is done, re-attach swipe listeners
    setTimeout(() => {
        setupSwipeListeners();
        isAnimating = false;
    }, 500); // Match with CSS transition duration (adjust if needed)
}

function moveToPreviousWeek() {
    if (isAnimating) return; // Prevent overlapping animations
    isAnimating = true;

    // Update baseDate to previous week
    baseDate = addDays(baseDate, -7);
    renderPlanner();
    renderYearCalendarModal();

    // After rendering is done, re-attach swipe listeners
    setTimeout(() => {
        setupSwipeListeners();
        isAnimating = false;
    }, 500); // Match with CSS transition duration (adjust if needed)
}

// ========================
// Function to determine if a year is a leap year
// ========================
function isLeapYear(year) {
    return ((year % 4 === 0) && (year % 100 !== 0)) || (year % 400 === 0);
}

// Function to get a date from day of the year
function getDateFromDay(year, day) {
    const date = new Date(year, 0, 1); // January 1st
    return new Date(date.setDate(day));
}

function capitalizeFirstLetter(string) {
    if (!string) return '';
    return string.charAt(0).toUpperCase() + string.slice(1);
}

function getWeeksInYear(year) {
    const d = new Date(year, 11, 31);
    const week = getWeekNumberISO(d);
    // If the last day of the year is in week 1, then the total weeks is the week number of the last Thursday of the year
    if (week === 1) {
        const lastThursday = new Date(year, 11, 31);
        lastThursday.setDate(lastThursday.getDate() - ((lastThursday.getDay() + 6) % 7) - 3);
        return getWeekNumberISO(lastThursday);
    }
    return week;
}

function selectWeek(weekNumber, year) {
    const firstThursday = new Date(year, 0, 4);
    const firstWeekStart = new Date(firstThursday.getTime() - ((firstThursday.getDay() + 6) % 7) * 86400000);
    const selectedDate = new Date(firstWeekStart.getTime() + (weekNumber - 1) * 7 * 86400000);
    baseDate = selectedDate;
    renderPlanner();
    renderYearCalendarModal();
    saveSelectedDateToLocalStorage(baseDate);
}

function displayCountdown(value) {
    const countdownOverlay = document.getElementById("mic-countdown");
    if (countdownOverlay) {
        countdownOverlay.innerText = value.toFixed(1);
        countdownOverlay.style.display = "block";
    }
}

// Hide Countdown
function hideCountdown() {
    const countdownOverlay = document.getElementById("mic-countdown");
    if (countdownOverlay) {
        countdownOverlay.style.display = "none";
    }
}

// ========================
// Function to save selected date to local storage
// ========================
function saveSelectedDateToLocalStorage(date) {
    const dateStr = date.toISOString();
    localStorage.setItem("selectedDate", dateStr);
    console.log(`Selected date saved to local storage: ${dateStr}`);
}

// ========================
// Initialize Planner on DOM Load
// ========================
document.addEventListener("DOMContentLoaded", () => {
    console.log("DOM loaded. Initializing planner...");

    topMicIcon = document.querySelector("#top-mic-icon");

    // Prevent focus on microphone icon
    if (topMicIcon) {
        topMicIcon.setAttribute("tabindex", "-1");
        topMicIcon.addEventListener("mousedown", (event) => {
            event.preventDefault(); // Prevent focus
        });
    }

    // Load the last selected date from local storage
    const savedDateStr = localStorage.getItem("selectedDate");
    if (savedDateStr) {
        const savedDate = new Date(savedDateStr);
        if (!isNaN(savedDate)) {
            baseDate = savedDate;
            console.log(`Loaded saved date: ${baseDate}`);
        } else {
            console.warn("Saved date is invalid. Using current date.");
        }
    } else {
        console.log("No saved date found. Using current date.");
    }
    setupAnalogClock();

    renderPlanner();
    setupSwipeListeners(); // Attach swipe listeners to the initial planner
    setupWebSpeechAPI(); // Initialize Web Speech API for voice transcription
    setupKeyboardNavigation();

    renderYearCalendarModal();

    // Initialize MDC Snackbar
    const snackbarElement = document.querySelector('.mdc-snackbar');
    const snackbar = new mdc.snackbar.MDCSnackbar(snackbarElement);

    window.showToast = function (message, type = 'success', actionText = null, actionHandler = null) {
        const snackbarLabel = snackbarElement.querySelector('.mdc-snackbar__label');
        const snackbarSurface = snackbarElement.querySelector('.mdc-snackbar__surface');
        const snackbarAction = snackbarElement.querySelector('.mdc-snackbar__action');

        // Set the message
        snackbarLabel.textContent = message;

        // Remove existing type classes
        snackbarElement.classList.remove('snackbar-success', 'snackbar-error', 'snackbar-warning');

        // Add the new type class based on 'type' parameter
        switch (type.toLowerCase()) {
            case 'success':
                snackbarElement.classList.add('snackbar-success');
                break;
            case 'error':
                snackbarElement.classList.add('snackbar-error');
                break;
            case 'warning':
                snackbarElement.classList.add('snackbar-warning');
                break;
            default:
                console.warn(`Unknown toast type: '${type}'. Defaulting to 'success'.`);
                snackbarElement.classList.add('snackbar-success');
        }

        // Configure action button if provided
        if (actionText && actionHandler) {
            snackbarAction.textContent = actionText;
            snackbarAction.style.display = 'inline-block'; // Ensure it's visible
            snackbarAction.onclick = actionHandler;
        } else {
            snackbarAction.style.display = 'none'; // Hide if no action
        }

        // Open the snackbar
        snackbar.open();
    };

    document.getElementById("go-to-today").addEventListener("click", () => {
        // Set the baseDate to the current date
        baseDate = new Date();

        // Re-render the planner, mini-calendar, and year calendar modal
        renderPlanner();
        renderYearCalendarModal();

        // Save the current date to local storage
        saveSelectedDateToLocalStorage(baseDate);

        console.log("Switched to today's date:", baseDate);
    });

    // Initialize MDC Dialog
    const dialogElement = document.querySelector('.mdc-dialog');
    const dialog = new mdc.dialog.MDCDialog(dialogElement);

    // Otevření dialogu při kliknutí na tlačítko
    document.getElementById("openCalendar").addEventListener("click", () => {
        dialog.open();
    });

    // Zavření dialogu při kliknutí na zavřít tlačítko
    const closeButton = dialogElement.querySelector('[data-mdc-dialog-action="close"]');
    closeButton.addEventListener("click", () => {
        dialog.close();
    });

    // Zavření Snackbar při kliknutí na tlačítko zavření
    const snackbarCloseButton = document.getElementById('snackbar-close');
    if (snackbarCloseButton) {
        snackbarCloseButton.addEventListener('click', () => {
            snackbar.close();
        });
    }

    // Add event listener to the top microphone icon
    if (topMicIcon) {
        topMicIcon.addEventListener("click", (event) => {
            event.preventDefault(); // Prevent default click behavior
            event.stopPropagation(); // Stop the event from bubbling up

            console.log("Microphone icon clicked.");
            console.log("Current Transcribing Cell:", currentTranscribingCell);

            if (currentTranscribingCell) {
                startTranscription(currentTranscribingCell);
            } else {
                showToast("Napřed vyberte buňku, potom lze zapisovat hlasem!", 'warning');
                topMicIcon.classList.add("shake");
                topMicIcon.classList.add("feedback-orange");

                // Remove the shake and orange classes after the animation completes (e.g., 1s)
                setTimeout(() => {
                    topMicIcon.classList.remove("shake");
                    topMicIcon.classList.remove("feedback-orange");
                }, 1000); // Duration should match the CSS animation duration
            }
        });
    } else {
        console.error("Top microphone icon not found!");
    }

    // Přidání posluchačů pro tlačítka 'Předchozí týden' a 'Další týden'
    const prevWeekButton = document.getElementById("prevWeek");
    const nextWeekButton = document.getElementById("nextWeek");

    if (prevWeekButton) {
        prevWeekButton.addEventListener("click", () => {
            moveToPreviousWeek();
        });
    } else {
        console.error("Button with ID 'prevWeek' not found!");
    }

    if (nextWeekButton) {
        nextWeekButton.addEventListener("click", () => {
            moveToNextWeek();
        });
    } else {
        console.error("Button with ID 'nextWeek' not found!");
    }

});

// ========================
// Function to Request Microphone Permission
// ========================
function requestMicrophonePermission() {
    return new Promise((resolve, reject) => {
        try {
            recognition.start();
            recognition.onstart = () => {
                recognition.stop();
                recognition.onstart = null;
                microphonePermissionGranted = true;
                console.log("Microphone permission granted.");
                resolve();
            };
        } catch (error) {
            console.error("Error requesting microphone permission:", error);
            reject(error);
        }
    });
}

// ========================
// Initialize Web Speech API
// ========================
function setupWebSpeechAPI() {
    console.log("Initializing Web Speech API for voice transcription.");

    // Check browser support
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        showToast("Web Speech API není podporováno ve vašem prohlížeči. Prosím, použijte Google Chrome nebo Mozilla Firefox.", 'error');
        console.error("Web Speech API is not supported in your browser.");
        return;
    }

    recognition = new SpeechRecognition();
    recognition.lang = 'cs-CZ'; // Set language to Czech
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    // Handle voice transcription results
    recognition.addEventListener('result', (event) => {
        console.log("Voice transcription completed. Processing results.");
        const transcript = event.results[0][0].transcript.trim();
        console.log(`Transcript: "${transcript}"`);
        if (currentTranscribingCell) {
            currentTranscribingCell.innerText = transcript;
            const day = parseInt(currentTranscribingCell.closest('td').dataset.day, 10);
            const hour = parseInt(currentTranscribingCell.closest('td').dataset.hour, 10);
            const dateObj = addDays(currentStartOfWeek, day);
            const date = format(dateObj, 'yyyy-MM-dd');
            const time = formatHour(hour);
            console.log(`Saving transcription for day ${day}, hour ${hour}: "${transcript}"`);
            saveNoteToFirebase(date, time, transcript)
                .then(() => {
                    showToast(`Poznámka uložena: "${transcript}"`, 'success');
                })
                .catch((error) => {
                    showToast("Chyba při ukládání poznámky.", 'error');
                });
            saveSelectedDateToLocalStorage(dateObj);
            stopTranscription(); // Clear current transcription cell
        } else {
            console.warn("Active cell for transcription not found.");
        }
    });

    recognition.addEventListener('speechend', () => {
        console.log("Speech ended. Stopping transcription.");
        if (isRecognizing) {
            recognition.stop();
        }
    });

    recognition.addEventListener('end', () => {
        console.log("Speech recognition service disconnected.");
        if (isRecognizing) {
            stopTranscription();
        }
    });

    recognition.addEventListener('error', (event) => {
        console.error(`Voice transcription error (${event.error}):`, event);
        showToast(`Chyba zapisování poznámky z hlasu: ${event.error}.`, 'error');
        if (isRecognizing) {
            stopTranscription();
        }
    });
}

// Start Transcription
function startTranscription(noteTextElement) {
    if (isRecognizing) {
        showToast("Zapisování pomocí hlasu je již spuštěno.", 'info');
        return;
    }

    currentTranscribingCell = noteTextElement;

    const cell = currentTranscribingCell.closest('td');
    cell.classList.add('recording');

    if (topMicIcon) {
        topMicIcon.classList.add('active');
    }

    try {
        recognition.start();
        isRecognizing = true;
        showToast("Poslouchám, diktujte poznámku.", 'success');
    } catch (error) {
        console.error("Error starting voice transcription:", error);
        showToast("Zápis hlasu se nezdařil!", 'error');
        stopTranscription();
    }
}

function stopTranscription() {
    if (recognition && isRecognizing) {
        recognition.stop();

        const cell = currentTranscribingCell.closest('td');
        cell.classList.remove('recording');

        if (topMicIcon) {
            topMicIcon.classList.remove('active');
        }

        currentTranscribingCell = null;
        isRecognizing = false;
    }
}

// ========================
// Function for Snackbar Notifications
// ========================

// (Already replaced showToast during initialization)

function setupAnalogClock() {
    const dateElement = document.getElementById("real-time-date");
    const yearElement = document.getElementById("real-time-year");

    const numbersDiv = document.querySelector('.numbers');
    for (let i = 1; i <= 12; i++) {
        const number = document.createElement('div');
        number.className = 'number';
        number.style.transform = `rotate(${i * 30}deg)`;

        const text = document.createElement('div');
        text.style.transform = `rotate(-${i * 30}deg)`;
        text.textContent = i;
        text.style.position = 'absolute';
        text.style.width = '12px';
        text.style.top = '2px';
        text.style.left = '50%';
        text.style.marginLeft = '-6px';

        number.appendChild(text);
        numbersDiv.appendChild(number);
    }

    function updateAnalogClock() {
      
       let  baseDate2 = new Date();
        const month = (baseDate2.getMonth() + 1).toString().padStart(2, '0');
        const day = baseDate2.getDate().toString().padStart(2, '0');
        
        dateElement.innerText = day+ '.'+month+ '.';
        yearElement.innerText = baseDate2.getFullYear().toString().padStart(2, '0');
         const seconds = baseDate2.getSeconds();
        const minutes = baseDate2.getMinutes();
        const hours = baseDate2.getHours() % 12;

        // Each second = 6 degrees (360/60)
        // Each minute = 6 degrees + a bit extra for the passing seconds (0.1 degrees per second)
        // Each hour = 30 degrees per hour + 0.5 degrees per minute for a smooth movement
        const secondAngle = (seconds * 6);
        const minuteAngle = (minutes * 6 + seconds);
        const hourAngle = (hours * 30 + minutes);

        document.querySelector('.second-hand').style.transform =
            `translateX(-50%) rotate(${secondAngle}deg)`;
        document.querySelector('.minute-hand').style.transform =
            `translateX(-50%) rotate(${minuteAngle}deg)`;
        document.querySelector('.hour-hand').style.transform =
            `translateX(-50%) rotate(${hourAngle}deg)`;

    }

    updateAnalogClock();
    setInterval(updateAnalogClock, 1000);
}


const calendarData = {
    "1.1.": { nameDay: "Nový rok", holiday: "Nový rok" },
    "2.1.": { nameDay: "Karina", holiday: "" },
    "3.1.": { nameDay: "Radmila", holiday: "" },
    "4.1.": { nameDay: "Diana", holiday: "" },
    "5.1.": { nameDay: "Dalimil", holiday: "" },
    "6.1.": { nameDay: "Tři králové", holiday: "" },
    "7.1.": { nameDay: "Vilma", holiday: "" },
    "8.1.": { nameDay: "Čestmír", holiday: "" },
    "9.1.": { nameDay: "Adéla", holiday: "" },
    "10.1.": { nameDay: "Bohuslava", holiday: "" },
    "11.1.": { nameDay: "Bohuslav", holiday: "" },
    "12.1.": { nameDay: "Erika", holiday: "" },
    "13.1.": { nameDay: "Alena", holiday: "" },
    "14.1.": { nameDay: "Radovan", holiday: "" },
    "15.1.": { nameDay: "Alice", holiday: "" },
    "16.1.": { nameDay: "Cyril", holiday: "" },
    "17.1.": { nameDay: "Drahomíra", holiday: "" },
    "18.1.": { nameDay: "Viktor", holiday: "" },
    "19.1.": { nameDay: "Doubravka", holiday: "" },
    "20.1.": { nameDay: "Ilona", holiday: "" },
    "21.1.": { nameDay: "Běla", holiday: "" },
    "22.1.": { nameDay: "Zdeněk", holiday: "" },
    "23.1.": { nameDay: "Zlata", holiday: "" },
    "24.1.": { nameDay: "Milena", holiday: "" },
    "25.1.": { nameDay: "Tomáš", holiday: "" },
    "26.1.": { nameDay: "Petr", holiday: "" },
    "27.1.": { nameDay: "Ingrid", holiday: "" },
    "28.1.": { nameDay: "Otto", holiday: "" },
    "29.1.": { nameDay: "Ladislav", holiday: "" },
    "30.1.": { nameDay: "Robin", holiday: "" },
    "31.1.": { nameDay: "Hanka", holiday: "" },
    "1.2.": { nameDay: "Hynek", holiday: "" },
    "2.2.": { nameDay: "Nela", holiday: "" },
    "3.2.": { nameDay: "Blahoslav", holiday: "" },
    "4.2.": { nameDay: "Veronika", holiday: "" },
    "5.2.": { nameDay: "Agnesa", holiday: "" },
    "6.2.": { nameDay: "Vanda", holiday: "" },
    "7.2.": { nameDay: "Richard", holiday: "" },
    "8.2.": { nameDay: "Kamil", holiday: "" },
    "9.2.": { nameDay: "Apollonie", holiday: "" },
    "10.2.": { nameDay: "Blažena", holiday: "" },
    "11.2.": { nameDay: "Tereza", holiday: "" },
    "12.2.": { nameDay: "Slavomír", holiday: "" },
    "13.2.": { nameDay: "Apollónie", holiday: "" },
    "14.2.": { nameDay: "Valentýn", holiday: "Den svatého Valentýna" },
    "15.2.": { nameDay: "Květa", holiday: "" },
    "16.2.": { nameDay: "Milan", holiday: "" },
    "17.2.": { nameDay: "Vojtěch", holiday: "" },
    "18.2.": { nameDay: "Gorazd", holiday: "" },
    "19.2.": { nameDay: "Patrik", holiday: "" },
    "20.2.": { nameDay: "Oldřich", holiday: "" },
    "21.2.": { nameDay: "Lenka", holiday: "" },
    "22.2.": { nameDay: "Marta", holiday: "" },
    "23.2.": { nameDay: "Svatopluk", holiday: "" },
    "24.2.": { nameDay: "Matěj", holiday: "" },
    "25.2.": { nameDay: "Liliana", holiday: "" },
    "26.2.": { nameDay: "Dorota", holiday: "" },
    "27.2.": { nameDay: "Alexandra", holiday: "" },
    "28.2.": { nameDay: "Lidmila", holiday: "" },
    "29.2.": { nameDay: "", holiday: "" },
    "1.3.": { nameDay: "Bedřich", holiday: "" },
    "2.3.": { nameDay: "Angela", holiday: "" },
    "3.3.": { nameDay: "Kamil", holiday: "" },
    "4.3.": { nameDay: "Kazimír", holiday: "" },
    "5.3.": { nameDay: "Ebenezer", holiday: "" },
    "6.3.": { nameDay: "Rudolf", holiday: "" },
    "7.3.": { nameDay: "Tomáš", holiday: "" },
    "8.3.": { nameDay: "Gabriela", holiday: "Mezinárodní den žen" },
    "9.3.": { nameDay: "Františka", holiday: "" },
    "10.3.": { nameDay: "Viktor", holiday: "" },
    "11.3.": { nameDay: "Anděla", holiday: "" },
    "12.3.": { nameDay: "Řehoř", holiday: "" },
    "13.3.": { nameDay: "Alena", holiday: "" },
    "14.3.": { nameDay: "Vojtěch", holiday: "" },
    "15.3.": { nameDay: "Ludmila", holiday: "" },
    "16.3.": { nameDay: "Herbert", holiday: "" },
    "17.3.": { nameDay: "Patrik", holiday: "" },
    "18.3.": { nameDay: "Eduard", holiday: "" },
    "19.3.": { nameDay: "Josef", holiday: "Den svatého Josefa" },
    "20.3.": { nameDay: "Svět", holiday: "" },
    "21.3.": { nameDay: "Radek", holiday: "" },
    "22.3.": { nameDay: "Leoš", holiday: "" },
    "23.3.": { nameDay: "Ferdinand", holiday: "" },
    "24.3.": { nameDay: "Gabriela", holiday: "" },
    "25.3.": { nameDay: "Marie", holiday: "" },
    "26.3.": { nameDay: "Ester", holiday: "" },
    "27.3.": { nameDay: "Dita", holiday: "" },
    "28.3.": { nameDay: "Tereza", holiday: "" },
    "29.3.": { nameDay: "Svatoján", holiday: "" },
    "30.3.": { nameDay: "Rudolf", holiday: "" },
    "31.3.": { nameDay: "Bohuslava", holiday: "" },
    "1.4.": { nameDay: "Hugo", holiday: "" },
    "2.4.": { nameDay: "Erik", holiday: "" },
    "3.4.": { nameDay: "Richard", holiday: "" },
    "4.4.": { nameDay: "Irena", holiday: "" },
    "5.4.": { nameDay: "Adolf", holiday: "" },
    "6.4.": { nameDay: "Hermína", holiday: "" },
    "7.4.": { nameDay: "Jarmila", holiday: "" },
    "8.4.": { nameDay: "Ema", holiday: "" },
    "9.4.": { nameDay: "Dušan", holiday: "" },
    "10.4.": { nameDay: "Benedikt", holiday: "" },
    "11.4.": { nameDay: "Igor", holiday: "" },
    "12.4.": { nameDay: "Julius", holiday: "" },
    "13.4.": { nameDay: "Tomas", holiday: "" },
    "14.4.": { nameDay: "Vojtěch", holiday: "" },
    "15.4.": { nameDay: "Kamil", holiday: "" },
    "16.4.": { nameDay: "Bohuslava", holiday: "" },
    "17.4.": { nameDay: "Jan", holiday: "" },
    "18.4.": { nameDay: "Valérie", holiday: "" },
    "19.4.": { nameDay: "Hana", holiday: "" },
    "20.4.": { nameDay: "Anastázie", holiday: "" },
    "21.4.": { nameDay: "Radek", holiday: "" },
    "22.4.": { nameDay: "Marek", holiday: "" },
    "23.4.": { nameDay: "Vojtěch", holiday: "" },
    "24.4.": { nameDay: "Jiří", holiday: "" },
    "25.4.": { nameDay: "Marek", holiday: "" },
    "26.4.": { nameDay: "Miloslav", holiday: "" },
    "27.4.": { nameDay: "Jaroslav", holiday: "" },
    "28.4.": { nameDay: "Václav", holiday: "" },
    "29.4.": { nameDay: "Kateřina", holiday: "" },
    "30.4.": { nameDay: "Petr", holiday: "" },
    "1.5.": { nameDay: "Filip", holiday: "Svátek práce" },
    "2.5.": { nameDay: "Zbyšek", holiday: "" },
    "3.5.": { nameDay: "Miroslava", holiday: "" },
    "4.5.": { nameDay: "Květoslav", holiday: "" },
    "5.5.": { nameDay: "Marek", holiday: "" },
    "6.5.": { nameDay: "Radoslav", holiday: "" },
    "7.5.": { nameDay: "Stanislav", holiday: "" },
    "8.5.": { nameDay: "Den vítězství", holiday: "Den vítězství" },
    "9.5.": { nameDay: "Petr", holiday: "" },
    "10.5.": { nameDay: "Dita", holiday: "" },
    "11.5.": { nameDay: "Igor", holiday: "" },
    "12.5.": { nameDay: "Pankrác", holiday: "" },
    "13.5.": { nameDay: "Servác", holiday: "" },
    "14.5.": { nameDay: "Bonifác", holiday: "" },
    "15.5.": { nameDay: "Žofie", holiday: "" },
    "16.5.": { nameDay: "Petr", holiday: "" },
    "17.5.": { nameDay: "Aneta", holiday: "" },
    "18.5.": { nameDay: "Nina", holiday: "" },
    "19.5.": { nameDay: "Irena", holiday: "" },
    "20.5.": { nameDay: "Zbyšek", holiday: "" },
    "21.5.": { nameDay: "Monika", holiday: "" },
    "22.5.": { nameDay: "Emil", holiday: "" },
    "23.5.": { nameDay: "Jana", holiday: "" },
    "24.5.": { nameDay: "Dirk", holiday: "" },
    "25.5.": { nameDay: "Urban", holiday: "" },
    "26.5.": { nameDay: "Vilém", holiday: "" },
    "27.5.": { nameDay: "Valdemar", holiday: "" },
    "28.5.": { nameDay: "Vilma", holiday: "" },
    "29.5.": { nameDay: "Maxmilián", holiday: "" },
    "30.5.": { nameDay: "Ferdinand", holiday: "" },
    "31.5.": { nameDay: "Petra", holiday: "" },
    "1.6.": { nameDay: "Laura", holiday: "" },
    "2.6.": { nameDay: "Jarmila", holiday: "" },
    "3.6.": { nameDay: "Tomáš", holiday: "" },
    "4.6.": { nameDay: "Dalimil", holiday: "" },
    "5.6.": { nameDay: "Dobroslava", holiday: "" },
    "6.6.": { nameDay: "Norbert", holiday: "" },
    "7.6.": { nameDay: "Rafael", holiday: "" },
    "8.6.": { nameDay: "Medard", holiday: "" },
    "9.6.": { nameDay: "Antonín", holiday: "" },
    "10.6.": { nameDay: "Gita", holiday: "" },
    "11.6.": { nameDay: "Brigita", holiday: "" },
    "12.6.": { nameDay: "Alan", holiday: "" },
    "13.6.": { nameDay: "Antonín", holiday: "" },
    "14.6.": { nameDay: "Roland", holiday: "" },
    "15.6.": { nameDay: "Vít", holiday: "" },
    "16.6.": { nameDay: "Adolf", holiday: "" },
    "17.6.": { nameDay: "Jaroslav", holiday: "" },
    "18.6.": { nameDay: "Michaela", holiday: "" },
    "19.6.": { nameDay: "Leo", holiday: "" },
    "20.6.": { nameDay: "Květa", holiday: "" },
    "21.6.": { nameDay: "Alois", holiday: "" },
    "22.6.": { nameDay: "Paulína", holiday: "" },
    "23.6.": { nameDay: "Zdeněk", holiday: "" },
    "24.6.": { nameDay: "Jan", holiday: "Narozeniny sv. Jana Křtitele" },
    "25.6.": { nameDay: "Václav", holiday: "" },
    "26.6.": { nameDay: "Adéla", holiday: "" },
    "27.6.": { nameDay: "Ladislav", holiday: "" },
    "28.6.": { nameDay: "Lubomír", holiday: "" },
    "29.6.": { nameDay: "Petr", holiday: "" },
    "30.6.": { nameDay: "Štěpán", holiday: "" },
    "1.7.": { nameDay: "Jaroslava", holiday: "" },
    "2.7.": { nameDay: "Patrik", holiday: "" },
    "3.7.": { nameDay: "Kamil", holiday: "" },
    "4.7.": { nameDay: "Prokop", holiday: "" },
    "5.7.": { nameDay: "Cyril a Metoděj", holiday: "Den slovanských věrozvěstů" },
    "6.7.": { nameDay: "Jan Hus", holiday: "Den upálení mistra Jana Husa" },
    "7.7.": { nameDay: "Libor", holiday: "" },
    "8.7.": { nameDay: "Bohuslav", holiday: "" },
    "9.7.": { nameDay: "Dušan", holiday: "" },
    "10.7.": { nameDay: "Roland", holiday: "" },
    "11.7.": { nameDay: "Olga", holiday: "" },
    "12.7.": { nameDay: "Nataša", holiday: "" },
    "13.7.": { nameDay: "Markéta", holiday: "" },
    "14.7.": { nameDay: "Kamil", holiday: "" },
    "15.7.": { nameDay: "Jáchym", holiday: "" },
    "16.7.": { nameDay: "Lubomír", holiday: "" },
    "17.7.": { nameDay: "Martina", holiday: "" },
    "18.7.": { nameDay: "František", holiday: "" },
    "19.7.": { nameDay: "Čeněk", holiday: "" },
    "20.7.": { nameDay: "Ilona", holiday: "" },
    "21.7.": { nameDay: "Vítězslav", holiday: "" },
    "22.7.": { nameDay: "Magdaléna", holiday: "" },
    "23.7.": { nameDay: "Libuše", holiday: "" },
    "24.7.": { nameDay: "Kristýna", holiday: "" },
    "25.7.": { nameDay: "Jakub", holiday: "" },
    "26.7.": { nameDay: "Anna", holiday: "" },
    "27.7.": { nameDay: "Viktor", holiday: "" },
    "28.7.": { nameDay: "Karel", holiday: "" },
    "29.7.": { nameDay: "Marta", holiday: "" },
    "30.7.": { nameDay: "Ignác", holiday: "" },
    "31.7.": { nameDay: "Luba", holiday: "" },
    "1.8.": { nameDay: "Oskar", holiday: "" },
    "2.8.": { nameDay: "Gustav", holiday: "" },
    "3.8.": { nameDay: "Miriam", holiday: "" },
    "4.8.": { nameDay: "Dominik", holiday: "" },
    "5.8.": { nameDay: "Kryštof", holiday: "" },
    "6.8.": { nameDay: "Jáchym", holiday: "" },
    "7.8.": { nameDay: "Karel", holiday: "" },
    "8.8.": { nameDay: "Alois", holiday: "" },
    "9.8.": { nameDay: "Roman", holiday: "" },
    "10.8.": { nameDay: "Vavřinec", holiday: "" },
    "11.8.": { nameDay: "Zuzana", holiday: "" },
    "12.8.": { nameDay: "Clara", holiday: "" },
    "13.8.": { nameDay: "Alena", holiday: "" },
    "14.8.": { nameDay: "Helena", holiday: "" },
    "15.8.": { nameDay: "Marie", holiday: "Nanebevzetí Panny Marie" },
    "16.8.": { nameDay: "Radoslav", holiday: "" },
    "17.8.": { nameDay: "Kryštof", holiday: "" },
    "18.8.": { nameDay: "Helena", holiday: "" },
    "19.8.": { nameDay: "Ludmila", holiday: "" },
    "20.8.": { nameDay: "Bernard", holiday: "" },
    "21.8.": { nameDay: "Johana", holiday: "" },
    "22.8.": { nameDay: "Bohuslav", holiday: "" },
    "23.8.": { nameDay: "Ludmila", holiday: "" },
    "24.8.": { nameDay: "Bartoloměj", holiday: "" },
    "25.8.": { nameDay: "Radmila", holiday: "" },
    "26.8.": { nameDay: "Lýdie", holiday: "" },
    "27.8.": { nameDay: "Monika", holiday: "" },
    "28.8.": { nameDay: "Augustýn", holiday: "" },
    "29.8.": { nameDay: "Ludvík", holiday: "" },
    "30.8.": { nameDay: "Felix", holiday: "" },
    "31.8.": { nameDay: "Cyril", holiday: "" },
    "1.9.": { nameDay: "Linda", holiday: "" },
    "2.9.": { nameDay: "Adéla", holiday: "" },
    "3.9.": { nameDay: "Radka", holiday: "" },
    "4.9.": { nameDay: "Jindřich", holiday: "" },
    "5.9.": { nameDay: "Karel", holiday: "" },
    "6.9.": { nameDay: "Zuzana", holiday: "" },
    "7.9.": { nameDay: "Regína", holiday: "" },
    "8.9.": { nameDay: "Mária", holiday: "" },
    "9.9.": { nameDay: "Adolf", holiday: "" },
    "10.9.": { nameDay: "Irma", holiday: "" },
    "11.9.": { nameDay: "Denis", holiday: "" },
    "12.9.": { nameDay: "Marie", holiday: "" },
    "13.9.": { nameDay: "Lucie", holiday: "" },
    "14.9.": { nameDay: "Jozef", holiday: "" },
    "15.9.": { nameDay: "Ludmila", holiday: "" },
    "16.9.": { nameDay: "Ludmila", holiday: "" },
    "17.9.": { nameDay: "Robert", holiday: "" },
    "18.9.": { nameDay: "Kryštof", holiday: "" },
    "19.9.": { nameDay: "Eliška", holiday: "" },
    "20.9.": { nameDay: "Oleg", holiday: "" },
    "21.9.": { nameDay: "Matouš", holiday: "" },
    "22.9.": { nameDay: "Michela", holiday: "" },
    "23.9.": { nameDay: "Berta", holiday: "" },
    "24.9.": { nameDay: "Jaromír", holiday: "" },
    "25.9.": { nameDay: "Zlata", holiday: "" },
    "26.9.": { nameDay: "Andrea", holiday: "" },
    "27.9.": { nameDay: "Jonáš", holiday: "" },
    "28.9.": { nameDay: "Václav", holiday: "Den české státnosti" },
    "29.9.": { nameDay: "Michal", holiday: "" },
    "30.9.": { nameDay: "Jeroným", holiday: "" },
    "1.10.": { nameDay: "Igor", holiday: "" },
    "2.10.": { nameDay: "Olga", holiday: "" },
    "3.10.": { nameDay: "Hedvika", holiday: "" },
    "4.10.": { nameDay: "František", holiday: "" },
    "5.10.": { nameDay: "Eliška", holiday: "" },
    "6.10.": { nameDay: "Brigita", holiday: "" },
    "7.10.": { nameDay: "Markéta", holiday: "" },
    "8.10.": { nameDay: "Sváťa", holiday: "" },
    "9.10.": { nameDay: "Štěpán", holiday: "" },
    "10.10.": { nameDay: "Denis", holiday: "" },
    "11.10.": { nameDay: "Michaela", holiday: "" },
    "12.10.": { nameDay: "Boris", holiday: "" },
    "13.10.": { nameDay: "Renata", holiday: "" },
    "14.10.": { nameDay: "Tereza", holiday: "" },
    "15.10.": { nameDay: "Hedvika", holiday: "" },
    "16.10.": { nameDay: "Lukáš", holiday: "" },
    "17.10.": { nameDay: "Hedvika", holiday: "" },
    "18.10.": { nameDay: "Ladislav", holiday: "" },
    "19.10.": { nameDay: "Michaela", holiday: "" },
    "20.10.": { nameDay: "Bohuslav", holiday: "" },
    "21.10.": { nameDay: "Hana", holiday: "" },
    "22.10.": { nameDay: "Šimon", holiday: "" },
    "23.10.": { nameDay: "Teodor", holiday: "" },
    "24.10.": { nameDay: "Nina", holiday: "" },
    "25.10.": { nameDay: "Beáta", holiday: "" },
    "26.10.": { nameDay: "Dimitrij", holiday: "" },
    "27.10.": { nameDay: "Štěpán", holiday: "" },
    "28.10.": { nameDay: "Dlouhý den", holiday: "Den vzniku samostatného československého státu" },
    "29.10.": { nameDay: "Silvia", holiday: "" },
    "30.10.": { nameDay: "Tadeáš", holiday: "" },
    "31.10.": { nameDay: "Štěpán", holiday: "" },
    "1.11.": { nameDay: "Anděla", holiday: "Svátek všech svatých" },
    "2.11.": { nameDay: "Alois", holiday: "Dušičky" },
    "3.11.": { nameDay: "Hubert", holiday: "" },
    "4.11.": { nameDay: "Karel", holiday: "" },
    "5.11.": { nameDay: "Václav", holiday: "" },
    "6.11.": { nameDay: "Leonard", holiday: "" },
    "7.11.": { nameDay: "Erik", holiday: "" },
    "8.11.": { nameDay: "Bohumil", holiday: "" },
    "9.11.": { nameDay: "Benedikt", holiday: "" },
    "10.11.": { nameDay: "Teodor", holiday: "" },
    "11.11.": { nameDay: "Martin", holiday: "Den boje za svobodu a demokracii" },
    "12.11.": { nameDay: "Benedikt", holiday: "" },
    "13.11.": { nameDay: "Margaréta", holiday: "" },
    "14.11.": { nameDay: "Ladislav", holiday: "" },
    "15.11.": { nameDay: "Leopold", holiday: "" },
    "16.11.": { nameDay: "Mikuláš", holiday: "" },
    "17.11.": { nameDay: "Martin", holiday: "Den boje za svobodu a demokracii" },
    "18.11.": { nameDay: "Romana", holiday: "" },
    "19.11.": { nameDay: "Alena", holiday: "" },
    "20.11.": { nameDay: "Edmund", holiday: "" },
    "21.11.": { nameDay: "Albert", holiday: "" },
    "22.11.": { nameDay: "Cecílie", holiday: "" },
    "23.11.": { nameDay: "Klement", holiday: "" },
    "24.11.": { nameDay: "Emílie", holiday: "" },
    "25.11.": { nameDay: "Kateřina", holiday: "" },
    "26.11.": { nameDay: "Diana", holiday: "" },
    "27.11.": { nameDay: "Xenie", holiday: "" },
    "28.11.": { nameDay: "René", holiday: "" },
    "29.11.": { nameDay: "Jakub", holiday: "" },
    "30.11.": { nameDay: "Ondřej", holiday: "" },
    "1.12.": { nameDay: "Iva", holiday: "" },
    "2.12.": { nameDay: "Blanka", holiday: "" },
    "3.12.": { nameDay: "Svatoslav", holiday: "" },
    "4.12.": { nameDay: "Barbora", holiday: "" },
    "5.12.": { nameDay: "Jitka", holiday: "" },
    "6.12.": { nameDay: "Mikuláš", holiday: "" },
    "7.12.": { nameDay: "Ambrož", holiday: "" },
    "8.12.": { nameDay: "Marika", holiday: "" },
    "9.12.": { nameDay: "Vratislav", holiday: "" },
    "10.12.": { nameDay: "Julie", holiday: "" },
    "11.12.": { nameDay: "Dana", holiday: "" },
    "12.12.": { nameDay: "Simona", holiday: "" },
    "13.12.": { nameDay: "Lucie", holiday: "" },
    "14.12.": { nameDay: "Lýdie", holiday: "" },
    "15.12.": { nameDay: "Radana", holiday: "" },
    "16.12.": { nameDay: "Albín", holiday: "" },
    "17.12.": { nameDay: "Daniel", holiday: "" },
    "18.12.": { nameDay: "Miriam", holiday: "" },
    "19.12.": { nameDay: "Ester", holiday: "" },
    "20.12.": { nameDay: "Štěpán", holiday: "" },
    "21.12.": { nameDay: "Natálie", holiday: "" },
    "22.12.": { nameDay: "Estera", holiday: "" },
    "23.12.": { nameDay: "Vlasta", holiday: "" },
    "24.12.": { nameDay: "Adam a Eva", holiday: "Štědrý den" },
    "25.12.": { nameDay: "Boží hod", holiday: "1. svátek vánoční" },
    "26.12.": { nameDay: "Štěpán", holiday: "2. svátek vánoční" },
    "27.12.": { nameDay: "David", holiday: "" },
    "28.12.": { nameDay: "Miloš", holiday: "" },
    "29.12.": { nameDay: "Judita", holiday: "" },
    "30.12.": { nameDay: "David", holiday: "" },
    "31.12.": { nameDay: "Silvestr", holiday: "" }
}; // Get today's date in YYYY-MM-DD format
const today = new Date().toISOString().split('T')[0];

// Select all table headers inside #planner-container
const headers = document.querySelectorAll('#planner-container th');

// Loop through each header and check if it matches today's date
headers.forEach(th => {
  if (th.dataset.date === today) {
    th.classList.add('today'); // Add a class to highlight today's column
  }
});
