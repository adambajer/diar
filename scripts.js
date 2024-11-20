// ========================
// Firebase Configuration
// ========================

// TODO: Replace the following with your app's Firebase project configuration.
// You can find this information in your Firebase project settings.
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

let baseDate = new Date(); // Tracks the currently selected date
let currentStartOfWeek = null;
let activeCell = null; // Currently active cell for keyboard navigation
let currentTranscribingCell = null; // Tracks the cell being transcribed into
let recognition = null; // SpeechRecognition instance

// ========================
// Initialize Planner on DOM Load
// ========================
document.addEventListener("DOMContentLoaded", () => {
    // Retrieve the last selected date from local storage
    const savedDateStr = localStorage.getItem("selectedDate");
    if (savedDateStr) {
        const savedDate = new Date(savedDateStr);
        if (!isNaN(savedDate)) {
            baseDate = savedDate;
        }
    }

    updateTodayDate();
    updateYearAndMonthDisplay();

    renderPlanner();
    renderMiniCalendar();
    renderYearCalendarModal();

    addMonthNavigationListeners();
    setupYearCalendarButton();
    setupWebSpeechAPI(); // Initialize Web Speech API for voice transcription
    setupClock(); // Initialize real-time clock
});

// ========================
// Render Weekly Planner
// ========================

async function renderPlanner() {
    currentStartOfWeek = getStartOfWeek(baseDate);
    renderHeaders(currentStartOfWeek);
    renderTimeSlots(currentStartOfWeek);

    const weekStartDate = format(currentStartOfWeek, 'yyyy-MM-dd');

    const weekNotes = await fetchNotesForWeekFromFirebase(weekStartDate);

    if (weekNotes) {
        populatePlannerWithNotes(weekNotes);
    }

    // Highlight the selected week in calendars
    highlightSelectedWeek(currentStartOfWeek);

    // Update selected week number display
    updateSelectedWeekNumber(currentStartOfWeek);
}

// Render Day Headers (Day Names and Real Dates)
function renderHeaders(startOfWeek) {
    const dayHeaders = document.getElementById("day-headers");
    dayHeaders.innerHTML = ""; // Clear existing headers

    for (let i = 0; i < 7; i++) {
        const dayDate = addDays(startOfWeek, i);
        const th = document.createElement("th");
        th.className = "day-header";
        th.innerHTML = `
            <span class="day-name">${dayDate.toLocaleString('cs-CZ', { weekday: 'short' })}</span>
            <span class="day-date">${dayDate.getDate()}</span>
            <span class="real-date">(${dayDate.toLocaleDateString('cs-CZ', { year: 'numeric', month: 'short', day: 'numeric' })})</span>
        `;
        dayHeaders.appendChild(th);
    }
}

// Render Time Slots for Each Day
function renderTimeSlots(startOfWeek) {
    const tbody = document.getElementById("time-slots");
    tbody.innerHTML = ""; // Clear existing time slots

    const startHour = 7;
    const endHour = 20;

    for (let hour = startHour; hour <= endHour; hour++) {
        const row = document.createElement("tr");

        for (let day = 0; day < 7; day++) {
            const cell = document.createElement("td");
            cell.className = "time-slot";
            cell.setAttribute('data-day', day);
            cell.setAttribute('data-hour', hour);

            // Spinner Element
            const spinner = document.createElement("div");
            spinner.className = "spinner-border spinner-border-sm text-primary";
            spinner.style.display = "none"; // Hide spinner initially
            cell.appendChild(spinner);

            // Create container for note text and mic icon
            const noteContainer = document.createElement("div");
            noteContainer.className = "note-text-container";

            // Create editable note text element
            const noteTextElement = document.createElement("div");
            noteTextElement.className = "note-text";
            noteTextElement.contentEditable = true;
            noteTextElement.setAttribute('data-day', day);
            noteTextElement.setAttribute('data-hour', hour);
            noteTextElement.setAttribute('tabindex', 0); // Make it focusable

            // Add event listeners for saving notes
            noteTextElement.addEventListener('input', (event) => handleNoteInput(event, day, hour));
            noteTextElement.addEventListener('blur', (event) => saveNoteDirectly(event, day, hour));

            // Add keydown event listener for keyboard navigation
            noteTextElement.addEventListener('keydown', (event) => handleKeyDown(event, day, hour));

            // Create microphone icon
            const micIcon = document.createElement("i");
            micIcon.className = "bi bi-mic-fill cell-mic";
            micIcon.title = "Klikněte pro přepis hlasu";
            micIcon.setAttribute('aria-label', 'Přepis hlasu');
            micIcon.setAttribute('role', 'button');

            // Add click event to mic icon
            micIcon.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation(); // Prevent cell selection on mic click
                if (currentTranscribingCell === noteTextElement) {
                    // If already transcribing this cell, stop transcription
                    stopTranscription();
                } else {
                    // Start transcription for this cell
                    startTranscription(noteTextElement);
                }
            });

            // Append elements to container
            noteContainer.appendChild(noteTextElement);
            noteContainer.appendChild(micIcon);

            // Append container to cell
            cell.appendChild(noteContainer);

            row.appendChild(cell);

            // Fetch and Display Existing Notes
            fetchNoteForCell(noteTextElement, day, hour, startOfWeek, spinner);
        }

        tbody.appendChild(row);
    }
}

// Populate Planner with Notes
function populatePlannerWithNotes(notes) {
    for (const [dayKey, hours] of Object.entries(notes)) {
        const dayIndex = parseInt(dayKey.replace("day", ""), 10);
        for (const [hourKey, noteText] of Object.entries(hours)) {
            const hourIndex = parseInt(hourKey.replace("hour", ""), 10);
            const cell = document.querySelector(`td[data-day="${dayIndex}"][data-hour="${hourIndex}"] .note-text`);
            if (cell) cell.innerText = sanitizeInput(noteText);
        }
    }
}

// ========================
// Mini Calendar
// ========================
function renderMiniCalendar() {
    const container = document.getElementById("mini-calendar-container");
    container.innerHTML = ""; // Clear existing calendar

    const currentYear = baseDate.getFullYear();
    const currentMonth = baseDate.getMonth();
    const firstDay = new Date(currentYear, currentMonth, 1);
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

    const table = document.createElement("table");
    table.className = "table table-sm table-bordered text-center";

    const thead = document.createElement("thead");
    thead.innerHTML = `<tr><th colspan="7">${firstDay.toLocaleString('cs-CZ', { month: 'long', year: 'numeric' })}</th></tr>`;
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    let row = document.createElement("tr");

    // Empty cells for days before the first of the month
    for (let i = 0; i < (firstDay.getDay() || 7) - 1; i++) {
        row.appendChild(document.createElement("td"));
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(currentYear, currentMonth, day);

        const cell = document.createElement("td");
        cell.innerText = day;

        // Highlight Sundays
        if (date.getDay() === 0) {
            cell.style.color = "red";
        }

        // Add click event
        cell.addEventListener("click", () => {
            baseDate = date;
            renderPlanner();
            renderMiniCalendar();
            renderYearCalendarModal();
            updateYearAndMonthDisplay();
            saveSelectedDateToLocalStorage(date); // Save to local storage
        });

        // Highlight if the week is selected
        if (isDateInCurrentSelectedWeek(date)) {
            cell.classList.add("selected-week");
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
// Year Calendar Modal
// ========================
function renderYearCalendarModal() {
    const container = document.querySelector(".year-calendar-modal");
    container.innerHTML = ""; // Clear existing year calendar

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

        // Empty cells for days before the first of the month
        for (let i = 0; i < (firstDay.getDay() || 7) - 1; i++) {
            row.appendChild(document.createElement("td"));
        }

        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(currentYear, month, day);
            const dateStr = format(date, 'yyyy-MM-dd');

            const cell = document.createElement("td");
            cell.innerText = day;

            // Highlight Sundays
            if (date.getDay() === 0) {
                cell.style.color = "red";
            }

            // Highlight if the week is selected
            if (isDateInCurrentSelectedWeek(date)) {
                cell.classList.add("selected-week");
            }

            // Add click event
            cell.addEventListener("click", () => {
                baseDate = date;
                renderPlanner();
                renderMiniCalendar();
                renderYearCalendarModal();
                updateYearAndMonthDisplay();
                saveSelectedDateToLocalStorage(date); // Save to local storage
                // Close the modal after selecting a date
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
// Firebase Operations
// ========================

// Save Note to Firebase
async function saveNoteToFirebase(date, time, text) {
    const dateObj = new Date(date);
    const weekStart = getStartOfWeek(dateObj);
    const weekNumber = getWeekNumber(weekStart);
    const monthName = getMonthName(weekStart);

    const noteRef = database.ref(`planner/${monthName}/week_${weekNumber}/day${getDayFromDate(date)}/hour${getHourFromTime(time)}`);

    return noteRef.set(text)
        .then(() => {
            console.log(`Note saved successfully for ${date} at ${time}.`);
        })
        .catch(error => {
            console.error(`Error saving note for ${date} at ${time}:`, error);
            alert("Failed to save the note. Please try again.");
        });
}

// Delete Note from Firebase
async function deleteNoteFromFirebase(date, time) {
    const dateObj = new Date(date);
    const weekStart = getStartOfWeek(dateObj);
    const weekNumber = getWeekNumber(weekStart);
    const monthName = getMonthName(weekStart);

    const noteRef = database.ref(`planner/${monthName}/week_${weekNumber}/day${getDayFromDate(date)}/hour${getHourFromTime(time)}`);

    return noteRef.remove()
        .then(() => {
            console.log(`Note deleted successfully for ${date} at ${time}.`);
        })
        .catch(error => {
            console.error(`Error deleting note for ${date} at ${time}:`, error);
            alert("Failed to delete the note. Please try again.");
        });
}

// Fetch a specific note from Firebase
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
            console.error(`Error fetching note for ${date} at ${time}:`, error);
            return null;
        });
}

// Fetch all notes for a specific week from Firebase
function fetchNotesForWeekFromFirebase(weekStartDate) {
    const startOfWeek = getStartOfWeek(new Date(weekStartDate));
    const weekNumber = getWeekNumber(startOfWeek);
    const monthName = getMonthName(startOfWeek);
    const weekRef = database.ref(`planner/${monthName}/week_${weekNumber}`);

    return weekRef.once('value')
        .then(snapshot => snapshot.val())
        .catch(error => {
            console.error("Error fetching notes from Firebase:", error);
            return null;
        });
}

// ========================
// Utility Functions
// ========================

// Get Start of the Week (Monday)
function getStartOfWeek(date) {
    const result = new Date(date);
    const day = result.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    const diff = (day === 0 ? -6 : 1) - day; // Adjust so that Monday is the start of the week
    result.setDate(result.getDate() + diff);
    result.setHours(0, 0, 0, 0); // Reset time
    return result;
}

// Add Days to a Date
function addDays(date, days) {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
}

// Format Date according to specified format
function format(date, formatStr) {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');

    if (formatStr === 'yyyy-MM-dd') {
        return `${year}-${month}-${day}`;
    }
    // Add more formats as needed
    return date.toString();
}

// Get Week Number of a Date
function getWeekNumber(date) {
    const startOfWeek = getStartOfWeek(new Date(date));
    const startOfYear = new Date(startOfWeek.getFullYear(), 0, 1);
    const diffInTime = startOfWeek - startOfYear;
    const diffInDays = Math.floor(diffInTime / (24 * 60 * 60 * 1000));
    const weekNumber = Math.ceil((diffInDays + startOfYear.getDay() + 1) / 7);
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

// Get Day Index from Date Object relative to the start of the week
function getDayFromDate(date) {
    const startOfWeek = getStartOfWeek(baseDate);
    const dayDiff = Math.floor((new Date(date) - startOfWeek) / (24 * 60 * 60 * 1000));
    return dayDiff;
}

// Get Hour from Time String
function getHourFromTime(timeString) {
    return parseInt(timeString.split(':')[0], 10);
}

// Check if a date is within the currently selected week
function isDateInCurrentSelectedWeek(date) {
    const startOfWeek = getStartOfWeek(baseDate);
    const endOfWeek = addDays(startOfWeek, 7);
    return date >= startOfWeek && date < endOfWeek;
}

// Sanitize Input to Prevent XSS
function sanitizeInput(str) {
    const temp = document.createElement('div');
    temp.textContent = str;
    return temp.innerHTML;
}

// Format Hour function
function formatHour(hour) {
    return hour.toString().padStart(2, '0') + ':00';
}

// ========================
// Navigation and Event Listeners
// ========================

// Add Event Listeners for Month Navigation
function addMonthNavigationListeners() {
    document.getElementById("prev-month").addEventListener("click", () => {
        baseDate.setMonth(baseDate.getMonth() - 1);
        renderPlanner();
        renderMiniCalendar();
        renderYearCalendarModal();
        updateYearAndMonthDisplay();
        saveSelectedDateToLocalStorage(baseDate); // Save to local storage
    });

    document.getElementById("next-month").addEventListener("click", () => {
        baseDate.setMonth(baseDate.getMonth() + 1);
        renderPlanner();
        renderMiniCalendar();
        renderYearCalendarModal();
        updateYearAndMonthDisplay();
        saveSelectedDateToLocalStorage(baseDate); // Save to local storage
    });
}

// Setup Year Calendar Button to Open Modal
function setupYearCalendarButton() {
    document.getElementById("open-year-calendar").addEventListener("click", () => {
        renderYearCalendarModal();
        new bootstrap.Modal(document.getElementById("yearCalendarModal")).show();
    });
}

// Handle Keyboard Navigation within the Planner
function handleKeyDown(event, day, hour) {
    const key = event.key;

    let targetDay = day;
    let targetHour = hour;

    switch (key) {
        case 'ArrowUp':
            targetHour = hour > 7 ? hour - 1 : hour;
            event.preventDefault();
            break;
        case 'ArrowDown':
            targetHour = hour < 20 ? hour + 1 : hour;
            event.preventDefault();
            break;
        case 'ArrowLeft':
            targetDay = day > 0 ? day - 1 : day;
            event.preventDefault();
            break;
        case 'ArrowRight':
            targetDay = day < 6 ? day + 1 : day;
            event.preventDefault();
            break;
        case 'Enter':
            targetHour = hour < 20 ? hour + 1 : hour;
            event.preventDefault();
            break;
        default:
            return; // Do nothing for other keys
    }

    // Prevent focus from moving outside the grid
    if (targetDay < 0 || targetDay > 6 || targetHour < 7 || targetHour > 20) {
        return;
    }

    // Find the target cell and focus its noteTextElement
    const targetCell = document.querySelector(`td[data-day="${targetDay}"][data-hour="${targetHour}"] .note-text`);
    if (targetCell) {
        // Remove active class from all cells
        document.querySelectorAll('.note-text.active').forEach(el => el.classList.remove("active"));

        // Add active class to the target cell
        targetCell.classList.add("active");

        targetCell.focus();
    }
}

// ========================
// Note Handling Functions
// ========================

// Debounce Function to Limit Frequency of Function Calls
function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

// Handle Note Input with Debounce
const handleNoteInput = debounce((event, day, hour) => {
    const noteText = event.target.innerText.trim();

    // Optionally handle empty notes
    if (noteText === '') {
        const dateObj = addDays(currentStartOfWeek, day);
        const date = format(dateObj, 'yyyy-MM-dd');
        const time = formatHour(hour);
        deleteNoteFromFirebase(date, time);
        return;
    }

    const dateObj = addDays(currentStartOfWeek, day);
    const date = format(dateObj, 'yyyy-MM-dd');
    const time = formatHour(hour);

    saveNoteToFirebase(date, time, noteText);
    saveSelectedDateToLocalStorage(dateObj); // Save to local storage
}, 500);

// Save Note Directly via Blur Event
async function saveNoteDirectly(event, day, hour) {
    const noteText = event.target.innerText.trim();

    const dateObj = addDays(currentStartOfWeek, day);
    const date = format(dateObj, 'yyyy-MM-dd');
    const time = formatHour(hour);

    if (!noteText) {
        // If note text is empty, delete the note
        await deleteNoteFromFirebase(date, time);
        console.log(`Note deleted at ${date} ${time} due to empty input.`);
        saveSelectedDateToLocalStorage(dateObj); // Save to local storage
        return;
    }

    await saveNoteToFirebase(date, time, noteText);
    saveSelectedDateToLocalStorage(dateObj); // Save to local storage
}

// Fetch and Display Note for a Specific Cell
async function fetchNoteForCell(noteTextElement, day, hour, startOfWeek, spinner) {
    const dateObj = addDays(startOfWeek, day);
    const date = format(dateObj, 'yyyy-MM-dd');
    const time = formatHour(hour);

    // Show spinner
    spinner.style.display = "block";

    const noteText = await fetchNoteFromFirebase(date, time);
    noteTextElement.innerText = sanitizeInput(noteText || '');

    // Hide spinner after loading
    spinner.style.display = "none";

    console.log(`Fetched note for ${date} ${time}:`, noteText); // Debugging
}

// ========================
// Highlight Selected Week in Calendars
// ========================
function highlightSelectedWeek(startOfWeek) {
    // Highlight in Mini Calendar
    const miniCalendarCells = document.querySelectorAll("#mini-calendar-container td");
    miniCalendarCells.forEach(cell => {
        const day = parseInt(cell.innerText, 10);
        if (isNaN(day)) return;

        const cellDate = new Date(baseDate.getFullYear(), baseDate.getMonth(), day);
        if (isDateInCurrentSelectedWeek(cellDate)) {
            cell.classList.add("selected-week");
        } else {
            cell.classList.remove("selected-week");
        }
    });

    // Highlight in Year Calendar Modal
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
        } else {
            cell.classList.remove("selected-week");
        }
    });
}

// ========================
// Real-Time Clock
// ========================
function setupClock() {
    const clockElement = document.getElementById("real-time-clock");
    if (!clockElement) return;

    function updateClock() {
        const now = new Date();
        const hours = now.getHours().toString().padStart(2, '0');
        const minutes = now.getMinutes().toString().padStart(2, '0');
        const seconds = now.getSeconds().toString().padStart(2, '0');
        clockElement.innerText = `${hours}:${minutes}:${seconds}`;
    }

    updateClock(); // Initial call
    setInterval(updateClock, 1000); // Update every second
}

// ========================
// Display Update Functions
// ========================

// Update Year and Month Display
function updateYearAndMonthDisplay() {
    const currentYearElement = document.getElementById("current-year");
    const currentMonthNameElement = document.getElementById("current-month-name");
    const selectedMonthElement = document.getElementById("selected-month");

    if (currentYearElement) {
        const currentYear = baseDate.getFullYear();
        currentYearElement.innerText = currentYear;
    } else {
        console.error("Element with ID 'current-year' not found.");
    }

    if (currentMonthNameElement) {
        const currentMonthName = baseDate.toLocaleString('cs-CZ', { month: 'long' });
        currentMonthNameElement.innerText = currentMonthName.toUpperCase();
    } else {
        console.error("Element with ID 'current-month-name' not found.");
    }

    if (selectedMonthElement) {
        const currentMonthName = baseDate.toLocaleString('cs-CZ', { month: 'long' });
        selectedMonthElement.innerText = `Vybraný měsíc: ${currentMonthName.toUpperCase()}`;
    } else {
        console.error("Element with ID 'selected-month' not found.");
    }
}

// Update Today's Date Display
function updateTodayDate() {
    const todayDateElement = document.getElementById("today-date");
    if (!todayDateElement) {
        console.error("Element with ID 'today-date' not found.");
        return;
    }
    const today = new Date();
    const day = today.getDate().toString().padStart(2, '0');
    const month = (today.getMonth() + 1).toString().padStart(2, '0');
    const year = today.getFullYear();
    todayDateElement.innerText = `${day}.${month}.${year}`;
}

// Update Selected Week Number Display
function updateSelectedWeekNumber(startOfWeek) {
    const selectedWeekNumberElement = document.getElementById("selected-week-number");
    if (!selectedWeekNumberElement) {
        console.error("Element with ID 'selected-week-number' not found.");
        return;
    }
    const weekNumber = getWeekNumber(startOfWeek);
    selectedWeekNumberElement.innerText = `Týden ${weekNumber}`;
}

// ========================
// Additional Navigation Functions
// ========================

// Navigate to a Specific Date
function goToSpecificDate(dateStr) {
    baseDate = new Date(dateStr);
    currentStartOfWeek = getStartOfWeek(baseDate); // Update the week based on the selected date
    renderPlanner(); // Re-render the planner with updated data
    renderMiniCalendar();
    renderYearCalendarModal();
    updateYearAndMonthDisplay();
    saveSelectedDateToLocalStorage(baseDate); // Save to local storage
}

// ========================
// Local Storage Functions
// ========================

// Save Selected Date to Local Storage
function saveSelectedDateToLocalStorage(date) {
    const dateStr = date.toISOString();
    localStorage.setItem("selectedDate", dateStr);
}

// ========================
// Web Speech API Integration for Transcription
// ========================

function setupWebSpeechAPI() {
    // Check for browser support
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        alert("Web Speech API není podporováno ve vašem prohlížeči. Prosím, použijte Google Chrome nebo Mozilla Firefox.");
        return;
    }

    recognition = new SpeechRecognition();
    recognition.lang = 'cs-CZ'; // Czech language
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    // Function to start transcription
    function startTranscription(cell) {
        if (currentTranscribingCell) {
            // Already transcribing another cell
            alert("Již probíhá přepis. Prosím, dokončete jej před zahájením nového.");
            return;
        }

        currentTranscribingCell = cell;
        const micIcon = cell.parentElement.querySelector('.cell-mic');
        micIcon.classList.add('active');

        recognition.start();
    }

    // Function to stop transcription
    function stopTranscription() {
        if (recognition && currentTranscribingCell) {
            recognition.stop();
            const micIcon = currentTranscribingCell.parentElement.querySelector('.cell-mic');
            micIcon.classList.remove('active');
            currentTranscribingCell = null;
        }
    }

    // Handle transcription results
    recognition.addEventListener('result', (event) => {
        const transcript = event.results[0][0].transcript.trim();
        if (currentTranscribingCell) {
            currentTranscribingCell.innerText = transcript;
            const day = parseInt(currentTranscribingCell.getAttribute('data-day'), 10);
            const hour = parseInt(currentTranscribingCell.getAttribute('data-hour'), 10);
            const dateObj = addDays(currentStartOfWeek, day);
            const date = format(dateObj, 'yyyy-MM-dd');
            const time = formatHour(hour);
            saveNoteToFirebase(date, time, transcript);
            saveSelectedDateToLocalStorage(dateObj); // Save to local storage
            alert(`Poznámka přidána: "${transcript}"`);
            stopTranscription();
        }
    });

    recognition.addEventListener('speechend', () => {
        if (currentTranscribingCell) {
            stopTranscription();
        }
    });

    recognition.addEventListener('error', (event) => {
        console.error('Chyba přepisu hlasu:', event.error);
        alert("Chyba přepisu hlasu. Prosím, zkuste to znovu.");
        if (currentTranscribingCell) {
            stopTranscription();
        }
    });
 
}

// ========================
// Voice Transcription Handling
// ========================

function startTranscription(noteTextElement) {
    if (currentTranscribingCell) {
        alert("Již probíhá přepis. Prosím, dokončete jej před zahájením nového.");
        return;
    }

    currentTranscribingCell = noteTextElement;
    const micIcon = noteTextElement.parentElement.querySelector('.cell-mic');
    micIcon.classList.add('active');

    recognition.start();
}

function stopTranscription() {
    if (recognition && currentTranscribingCell) {
        recognition.stop();
        const micIcon = currentTranscribingCell.parentElement.querySelector('.cell-mic');
        micIcon.classList.remove('active');
        currentTranscribingCell = null;
    }
}
