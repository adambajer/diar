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
// Global Variables for Animation
let isAnimating = false;

let baseDate = new Date(); // Tracks the currently selected date
let currentStartOfWeek = null;
let currentTranscribingCell = null; // Tracks the cell being transcribed into
let recognition = null; // SpeechRecognition instance
// ========================
// Global Variables for Swipe
// ========================
let touchStartX = null;
let touchEndX = null;
let isSwiping = false;
// ========================
// Initialize Planner on DOM Load
// ========================
document.addEventListener("DOMContentLoaded", () => {
    console.log("DOM loaded. Initializing planner...");

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

    setupClock(); // Initialize real-time clock
    updateYearAndMonthDisplay();

    renderPlanner();
    renderMiniCalendar();
    renderYearCalendarModal();
    renderDayNumbersRow();
    addMonthNavigationListeners();
    setupYearCalendarButton();
    setupWebSpeechAPI(); // Initialize Web Speech API for voice transcription
    setupSwipeListeners(); // Initialize swipe listeners   
     setupDragScrolling();
     setupKeyboardNavigation();
     setupWeekSlider();

});

// ========================
// Render Day Numbers Row
// ========================

function renderDayNumbersRow() {
    const dayNumbersContainer = document.getElementById("day-numbers");
    dayNumbersContainer.innerHTML = ""; // Clear existing row

    const currentYear = baseDate.getFullYear();
    const currentMonth = baseDate.getMonth();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

    const row = document.createElement("div");
    row.className = "day-numbers-row";

    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(currentYear, currentMonth, day);

        const dayCell = document.createElement("div");
        dayCell.innerText = day;
        dayCell.className = "day-cell";

        // Highlight Sundays in red
        if (date.getDay() === 0) {
            dayCell.style.color = "red";
        }

        // Click event to navigate to the selected day
        dayCell.addEventListener("click", () => {
            console.log(`Clicked on day: ${day}`);
            baseDate = date;
            renderPlanner();
            renderMiniCalendar();
            renderYearCalendarModal();
            updateYearAndMonthDisplay();
            saveSelectedDateToLocalStorage(baseDate); // Save to local storage
        });

        // Highlight the current day
        const today = new Date();
        if (
            date.getDate() === today.getDate() &&
            date.getMonth() === today.getMonth() &&
            date.getFullYear() === today.getFullYear()
        ) {
            dayCell.style.backgroundColor = "#e0f7fa"; // Light blue
        }

        row.appendChild(dayCell);
    }

    dayNumbersContainer.appendChild(row);
}

// ========================
// Render Weekly Planner
// ========================
async function renderPlanner() {
    console.log("Rendering planner...");

    // Calculate start and end of the week
    currentStartOfWeek = getStartOfWeek(baseDate);
    const currentEndOfWeek = getEndOfWeek(currentStartOfWeek);

    // Update slider position
    const slider = document.getElementById('week-slider');
    if (slider) {
        const currentWeekNumber = getWeekNumber(baseDate);
        slider.value = currentWeekNumber - 1;
    }

    // Render headers and time slots for the correct week
    renderHeaders(currentStartOfWeek);
    renderTimeSlots(currentStartOfWeek);

    // Highlight the selected week and update the week number display
    highlightSelectedWeek(currentStartOfWeek);
    updateSelectedWeekNumber(currentStartOfWeek);

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

// Render Day Headers (Day Names and Real Dates)
function renderHeaders(startOfWeek) {
    const dayHeaders = document.getElementById("day-headers");
    dayHeaders.innerHTML = ""; // Clear existing headers

    console.log("Rendering day headers...");

    for (let i = 0; i < 7; i++) {
        const dayDate = addDays(startOfWeek, i);
        const th = document.createElement("th");
        th.className = "day-header";
        th.innerHTML = `
            <div class="day-name">${dayDate.toLocaleString('cs-CZ', { weekday: 'long' })}</div>
            <div class="day-date" title="${dayDate.toLocaleDateString('cs-CZ', { year: 'numeric', month: 'long', day: 'numeric' })}">${dayDate.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric' })}</div>
        `;
        dayHeaders.appendChild(th);
    }
}

// Render Time Slots
function renderTimeSlots(startOfWeek) {
    const tbody = document.getElementById("time-slots");
    tbody.innerHTML = ""; // Clear existing slots

    const startHour = 7; // Start hour for time slots
    const endHour = 20; // End hour for time slots

    for (let hour = startHour; hour <= endHour; hour++) {
        const row = document.createElement("tr");

        for (let day = 0; day < 7; day++) {
            const cell = createTimeSlotCell(day, hour, startOfWeek);
            row.appendChild(cell);
        }

        tbody.appendChild(row);
    }
}

// Create a single time slot cell
function createTimeSlotCell(day, hour, startOfWeek) {
    const cell = document.createElement("td");
    cell.className = "time-slot";
    cell.dataset.day = day;
    cell.dataset.hour = hour;

    const spinner = createSpinner();
    const noteContainer = createNoteContainer(day, hour, startOfWeek, spinner);

    cell.appendChild(spinner);
    cell.appendChild(noteContainer);

    // Load and display notes
    fetchNoteForCell(noteContainer.querySelector(".note-text"), day, hour, startOfWeek, spinner);

    return cell;
}

// Create spinner for loading indication
function createSpinner() {
    const spinner = document.createElement("div");
    spinner.className = "spinner-border spinner-border-sm text-success";
    spinner.style.display = "none"; // Hide spinner initially
    return spinner;
}

// Create the note container
function createNoteContainer(day, hour, startOfWeek, spinner) {
    const container = document.createElement("div");
    container.className = "note-text-container";

    const timeLabel = document.createElement("div");
    timeLabel.className = "time-label";
    timeLabel.innerText = formatHour(hour);

    const noteText = createNoteTextElement(day, hour, spinner);

    const micIcon = createMicIcon(noteText);

    container.appendChild(timeLabel);
    container.appendChild(noteText);
    container.appendChild(micIcon);

    return container;
}

// Create the note text element
function createNoteTextElement(day, hour, spinner) {
    const noteText = document.createElement("div");
    noteText.className = "note-text";
    noteText.contentEditable = true;
    noteText.dataset.day = day;
    noteText.dataset.hour = hour;

    noteText.addEventListener("input", debounce((event) => handleNoteInput(event, day, hour), 500));
    noteText.addEventListener("blur", (event) => saveNoteDirectly(event, day, hour));

    return noteText;
}

// Create the microphone icon
function createMicIcon(noteText) {
    const micIcon = document.createElement("i");
    micIcon.className = "bi bi-mic-fill cell-mic";
    micIcon.title = "Voice transcription";
    micIcon.setAttribute("aria-label", "Start voice transcription");

    micIcon.addEventListener("click", () => {
        startTranscription(noteText);
    });

    return micIcon;
}

// ========================
// Simplified Note Input Handling
// ========================
const handleNoteInput = debounce((event, day, hour) => {
    const noteText = event.target.innerText.trim();
    const dateObj = addDays(currentStartOfWeek, day);
    const date = format(dateObj, "yyyy-MM-dd");
    const time = formatHour(hour);

    if (!noteText) return; // Skip saving if note is empty

    saveNoteToFirebase(date, time, noteText);
}, 500);

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

    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.flexWrap = "wrap";
    row.style.justifyContent = "space-around";

    // Create day cells
    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(currentYear, currentMonth, day);

        const dayCell = document.createElement("div");
        dayCell.innerText = day;
        dayCell.className = "day-cell";
        dayCell.style.padding = "10px";
        dayCell.style.textAlign = "center";
        dayCell.style.flex = "1";
        dayCell.style.cursor = "pointer";
        dayCell.style.position = "relative";

        // Highlight Sundays in red
        if (date.getDay() === 0) {
            dayCell.style.color = "red";
        }

        // Add click event
        dayCell.addEventListener("click", () => {
            console.log(`Clicked on mini calendar: day ${day}`);
            baseDate = date;
            renderPlanner();
            renderMiniCalendar();
            renderYearCalendarModal();
            updateYearAndMonthDisplay();
            saveSelectedDateToLocalStorage(date); // Save to local storage
        });

        // Highlight the current day
        const today = new Date();
        if (
            date.getDate() === today.getDate() &&
            date.getMonth() === today.getMonth() &&
            date.getFullYear() === today.getFullYear()
        ) {
            dayCell.style.backgroundColor = "#e0f7fa"; // Light blue
        }

        row.appendChild(dayCell);
    }

    container.appendChild(row);
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

        const monthLabel = document.createElement("div");
        monthLabel.innerText = monthName.toUpperCase();
        monthLabel.className = "text-center";

        const table = document.createElement("table");
        table.className = "table table-bordered table-sm text-center";

        const tbody = document.createElement("tbody");
        let row = document.createElement("tr");

        // Empty cells for days before the first day of the month
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

            // Highlight if the day is in the currently selected week
            if (isDateInCurrentSelectedWeek(date)) {
                cell.classList.add("selected-week");
                console.log(`Year calendar cell for day ${day}, month ${month + 1} is in the selected week.`);
            }

            // Add click event
            cell.addEventListener("click", () => {
                console.log(`Clicked on year calendar: day ${day}, month ${month + 1}`);
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
            console.log(`Note successfully saved for ${date} at ${time}.`);
            showToast("Poznámka úspěšně uložena.", 'success');
        })
        .catch(error => {
            console.error(`Error saving note for ${date} at ${time}:`, error);
            showToast("Nepodařilo se uložit poznámku. Prosím, zkuste to znovu.", 'error');
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
    const weekNumber = getWeekNumber(weekStart);
    const monthName = getMonthName(weekStart);
    const dayIndex = getDayFromDate(date);
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
    const weekNumber = getWeekNumber(startOfWeek);
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
// Utilities and Helper Functions
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

// Get the end of the week (Sunday)
function getEndOfWeek(startOfWeek) {
    const result = new Date(startOfWeek);
    result.setDate(result.getDate() + 6);
    result.setHours(23, 59, 59, 999); // Set time to the end of the day
    return result;
}

// Add Days to a Date
function addDays(date, days) {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
}

// Format Date according to Specified Format
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

// Get Week Number for a Date
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

// Check if Date is in the Currently Selected Week
function isDateInCurrentSelectedWeek(date) {
    const startOfWeek = getStartOfWeek(baseDate);
    const endOfWeek = addDays(startOfWeek, 7);
    return date >= startOfWeek && date < endOfWeek;
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

// ========================
// Navigation and Event Listeners
// ========================

// Add Event Listeners for Month Navigation
function addMonthNavigationListeners() {
    document.getElementById("prev-month").addEventListener("click", () => {
        console.log("Clicked on previous month.");
        baseDate.setMonth(baseDate.getMonth() - 1);
        renderPlanner();
        renderMiniCalendar();
        renderYearCalendarModal();
        updateYearAndMonthDisplay();
        saveSelectedDateToLocalStorage(baseDate); // Save to local storage
    });

    document.getElementById("next-month").addEventListener("click", () => {
        console.log("Clicked on next month.");
        baseDate.setMonth(baseDate.getMonth() + 1);
        renderPlanner();
        renderMiniCalendar();
        renderYearCalendarModal();
        updateYearAndMonthDisplay();
        saveSelectedDateToLocalStorage(baseDate); // Save to local storage
    });
}

// Set up Button for Opening Year Calendar
function setupYearCalendarButton() {
    document.getElementById("open-year-calendar").addEventListener("click", () => {
        console.log("Clicked on button to open year calendar.");
        renderYearCalendarModal();
        new bootstrap.Modal(document.getElementById("yearCalendarModal")).show();
    });
}

// ========================
// Function to Save Selected Date to Local Storage
// ========================

function saveSelectedDateToLocalStorage(date) {
    const dateStr = date.toISOString();
    localStorage.setItem("selectedDate", dateStr);
    console.log(`Selected date saved to local storage: ${dateStr}`);
}

// ========================
// Handle Note Input and Save
// ========================

// Debounce Function to Limit Frequency of Function Calls
function debounce(func, wait) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

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

// Load and Display Note for Specific Cell
async function fetchNoteForCell(noteTextElement, day, hour, startOfWeek, spinner) {
    const dateObj = addDays(startOfWeek, day);
    const date = format(dateObj, 'yyyy-MM-dd');
    const time = formatHour(hour);

    console.log(`Fetching note for day ${day}, hour ${hour} (${date} ${time})`);

    // Show spinner
    spinner.style.display = "block";

    const noteText = await fetchNoteFromFirebase(date, time);
    noteTextElement.innerText = sanitizeInput(noteText || '');

    // Hide spinner after loading
    spinner.style.display = "none";

    console.log(`Loaded note for ${date} at ${time}: "${noteText}"`);
}

// ========================
// Set Up Web Speech API for Transcription
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
            const day = parseInt(currentTranscribingCell.getAttribute('data-day'), 10);
            const hour = parseInt(currentTranscribingCell.getAttribute('data-hour'), 10);
            const dateObj = addDays(currentStartOfWeek, day);
            const date = format(dateObj, 'yyyy-MM-dd');
            const time = formatHour(hour);
            console.log(`Saving transcription for day ${day}, hour ${hour}: "${transcript}"`);
            saveNoteToFirebase(date, time, transcript)
                .then(() => {
                    showToast(`Poznámka přidána: "${transcript}"`, 'success');
                })
                .catch((error) => {
                    showToast("Chyba při ukládání poznámky.", 'error');
                });
            saveSelectedDateToLocalStorage(dateObj); // Save to local storage
            stopTranscription(); // Clear current transcription cell
        } else {
            console.warn("Active cell for transcription not found.");
        }
    });

    recognition.addEventListener('speechend', () => {
        console.log("Voice transcription ended (speechend).");
    });

    recognition.addEventListener('error', (event) => {
        console.error(`Voice transcription error (${event.error}):`, event);
        showToast(`Chyba přepisu hlasu: ${event.error}. Prosím, zkuste to znovu.`, 'error');
        if (currentTranscribingCell) {
            stopTranscription();
        }
    });
}

// ========================
// Manage Voice Transcription
// ========================
function startTranscription(noteTextElement) {
    console.log("Starting voice transcription.");
    if (currentTranscribingCell) {
        showToast("Již probíhá přepis.", 'error');
        console.warn("Attempt to start transcription while another transcription is in progress.");
        return;
    }

    currentTranscribingCell = noteTextElement;
    const micIcon = noteTextElement.parentElement.querySelector('.cell-mic');
    micIcon.classList.add('active');

    // Add 'recording' class to the cell
    const cell = noteTextElement.closest('td');
    cell.classList.add('recording');

    try {
        recognition.start();
        console.log("Voice transcription started.");
        showToast("Začíná přepis hlasu. Prosím, mluvte nyní.", 'success');
    } catch (error) {
        console.error("Error starting voice transcription:", error);
        showToast("Nepodařilo se spustit přepis hlasu.", 'error');
    }
}

function stopTranscription() {
    console.log("Stopping voice transcription.");
    if (recognition && currentTranscribingCell) {
        recognition.stop();
        const micIcon = currentTranscribingCell.parentElement.querySelector('.cell-mic');
        micIcon.classList.remove('active');

        // Remove 'recording' class from the cell
        const cell = currentTranscribingCell.closest('td');
        cell.classList.remove('recording');

        console.log("Voice transcription stopped.");
        currentTranscribingCell = null;
    } else {
        console.warn("Attempting to stop transcription, but no transcription is running.");
    }
}

// ========================
// Function for Toast Notifications
// ========================

function showToast(message, type = 'success') {
    const toastEl = document.getElementById('notification-toast');
    if (!toastEl) {
        console.error("Element with ID 'notification-toast' not found.");
        return;
    }
    const toastBody = toastEl.querySelector('#toast-body');

    toastBody.innerText = message;

    // Clear previous content
    toastBody.innerHTML = '';

    // Add icon based on type
    const icon = document.createElement('i');
    if (type === 'success') {
        icon.className = "bi bi-check-circle-fill text-success me-2";
    } else if (type === 'error') {
        icon.className = "bi bi-exclamation-triangle-fill text-danger me-2";
    } else {
        icon.className = "bi bi-info-circle-fill text-info me-2";
    }
    toastBody.appendChild(icon);

    // Add message text
    const messageSpan = document.createElement('span');
    messageSpan.innerText = message;
    toastBody.appendChild(messageSpan);

    const toast = new bootstrap.Toast(toastEl);
    toast.show();
}

// ========================
// Real-Time Clock and Date
// ========================
function setupClock() {
    const clockElement = document.getElementById("real-time-clock");
    const dateElement = document.getElementById("real-time-date");

    if (!clockElement || !dateElement) {
        console.error("Clock or date elements not found!");
        return;
    }

    console.log("Initializing real-time clock...");

    function updateClock() {
        const now = new Date();
        const hours = now.getHours().toString().padStart(2, '0');
        const minutes = now.getMinutes().toString().padStart(2, '0');
        const seconds = now.getSeconds().toString().padStart(2, '0');
        clockElement.innerText = `${hours}:${minutes}:${seconds}`;

        const day = now.getDate().toString().padStart(2, '0');
        const month = (now.getMonth() + 1).toString().padStart(2, '0');
        const year = now.getFullYear();
        dateElement.innerText = `${day}.${month}.${year}`;
    }

    updateClock(); // Initial call
    setInterval(updateClock, 1000); // Update every second
}

// ========================
// Functions to Update Display
// ========================

// Update Year and Month Display
function updateYearAndMonthDisplay() {
    const currentYearElement = document.getElementById("current-year");
    const currentMonthNameElement = document.getElementById("current-month-name");

    console.log("Updating year and month display...");
    console.log("currentYearElement:", currentYearElement);
    console.log("currentMonthNameElement:", currentMonthNameElement);

    if (currentYearElement) {
        const currentYear = baseDate.getFullYear();
        currentYearElement.innerText = currentYear;
        console.log(`Set current year to ${currentYear}`);
    } else {
        console.error("Element with ID 'current-year' not found.");
    }

    if (currentMonthNameElement) {
        const currentMonthName = baseDate.toLocaleString('cs-CZ', { month: 'long' });
        currentMonthNameElement.innerText = currentMonthName.toUpperCase();
        console.log(`Set current month to ${currentMonthName.toUpperCase()}`);
    } else {
        console.error("Element with ID 'current-month-name' not found.");
    }
}

// Update Selected Week Number Display
function updateSelectedWeekNumber(startOfWeek) {
    const selectedWeekNumberElement = document.getElementById("selected-week-number");
    if (!selectedWeekNumberElement) {
        console.error("Element with ID 'selected-week-number' not found.");
        return;
    }
    const weekNumber = getWeekNumber(startOfWeek);
    selectedWeekNumberElement.innerText = `${weekNumber}. TÝDEN`;
}

// ========================
// Event Listeners for Swipe and Scroll
// ========================
function setupSwipeListeners() {
    const plannerContainer = document.querySelector(".planner-table-container");

    // Check if touch events are supported
    if ('ontouchstart' in window || navigator.maxTouchPoints) {
        // Touch event listeners
        plannerContainer.addEventListener('touchstart', function (event) {
            touchStartX = event.changedTouches[0].clientX;
            isSwiping = true;
        }, false);

        plannerContainer.addEventListener('touchmove', function (event) {
            if (!isSwiping) return;
            touchEndX = event.changedTouches[0].clientX;
        }, false);

        plannerContainer.addEventListener('touchend', function (event) {
            if (!isSwiping) return;
            handleSwipeGesture();
            isSwiping = false;
        }, false);
    }
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

function moveToNextWeek() {
    if (isAnimating) return; // Prevent overlapping animations
    isAnimating = true;

    const slideWrapper = document.querySelector('.planner-slide-wrapper');

    // Clone the current planner to create the next week's planner
    const newPlanner = slideWrapper.cloneNode(true);
    baseDate.setDate(baseDate.getDate() + 7);
    renderPlanner(newPlanner.querySelector('.planner-table-container'));

    // Append the new planner to the slide wrapper
    slideWrapper.parentNode.appendChild(newPlanner);

    // Animate the slide
    slideWrapper.style.transform = 'translateX(-100%)';

    // After animation ends, clean up
    slideWrapper.addEventListener('transitionend', () => {
        slideWrapper.parentNode.removeChild(slideWrapper);
        newPlanner.classList.remove('planner-slide-wrapper');
        newPlanner.style.transform = '';
        newPlanner.classList.add('planner-slide-wrapper');
        isAnimating = false;
    }, { once: true });

    updateAfterWeekChange();
}

function moveToPreviousWeek() {
    if (isAnimating) return; // Prevent overlapping animations
    isAnimating = true;

    const slideWrapper = document.querySelector('.planner-slide-wrapper');

    // Clone the current planner to create the previous week's planner
    const newPlanner = slideWrapper.cloneNode(true);
    baseDate.setDate(baseDate.getDate() - 7);
    renderPlanner(newPlanner.querySelector('.planner-table-container'));

    // Insert the new planner before the current one
    slideWrapper.parentNode.insertBefore(newPlanner, slideWrapper);

    // Set initial position for sliding in
    newPlanner.style.transform = 'translateX(-100%)';

    // Trigger reflow to ensure the transform is applied
    newPlanner.offsetHeight; // eslint-disable-line no-unused-expressions

    // Animate the slide
    newPlanner.style.transform = 'translateX(0)';
    slideWrapper.style.transform = 'translateX(100%)';

    // After animation ends, clean up
    newPlanner.addEventListener('transitionend', () => {
        slideWrapper.parentNode.removeChild(slideWrapper);
        newPlanner.classList.remove('planner-slide-wrapper');
        newPlanner.style.transform = '';
        newPlanner.classList.add('planner-slide-wrapper');
        isAnimating = false;
    }, { once: true });

    updateAfterWeekChange();
}

// ========================
// Highlight Selected Week in Calendars
// ========================
function highlightSelectedWeek(currentStartOfWeek) {
    console.log("Highlighting selected week in calendars.");

    // Highlight in Mini Calendar
    const miniCalendarCells = document.querySelectorAll("#day-numbers .day-cell");
    miniCalendarCells.forEach(cell => {
        const day = parseInt(cell.innerText, 10);
        if (isNaN(day)) return;

        const cellDate = new Date(baseDate.getFullYear(), baseDate.getMonth(), day);
        if (isDateInCurrentSelectedWeek(cellDate)) {
            cell.classList.add("selected-week");
            cell.style.backgroundColor = "#d1e7dd"; // Light green
            console.log(`Mini calendar cell for day ${day} is in the selected week.`);
        } else {
            cell.classList.remove("selected-week");
            cell.style.backgroundColor = ""; // Reset background
        }
    });

    // Highlight in Year Calendar Modal
    const yearCalendarCells = document.querySelectorAll(".year-calendar-modal .day-cell");
    yearCalendarCells.forEach(cell => {
        const day = parseInt(cell.innerText, 10);
        if (isNaN(day)) return;

        const monthHeader = cell.closest(".month-container-modal").querySelector("div.text-center");
        if (!monthHeader) return;

        const monthName = monthHeader.textContent.trim();
        const monthIndex = new Date(`${monthName} 1, ${baseDate.getFullYear()}`).getMonth();
        const cellDate = new Date(baseDate.getFullYear(), monthIndex, day);

        if (isDateInCurrentSelectedWeek(cellDate)) {
            cell.classList.add("selected-week");
            cell.style.backgroundColor = "#d1e7dd"; // Light green
            console.log(`Year calendar cell for day ${day}, month ${monthIndex + 1} is in the selected week.`);
        } else {
            cell.classList.remove("selected-week");
            cell.style.backgroundColor = ""; // Reset background
        }
    });
}
function setupDragScrolling() {
    const plannerContainer = document.querySelector(".planner-table-container");
    let isDown = false;
    let startX;
    let scrollLeft;

    plannerContainer.addEventListener('mousedown', (e) => {
        isDown = true;
        plannerContainer.classList.add('active');
        startX = e.pageX - plannerContainer.offsetLeft;
        scrollLeft = plannerContainer.scrollLeft;
    });

    plannerContainer.addEventListener('mouseleave', () => {
        isDown = false;
        plannerContainer.classList.remove('active');
    });

    plannerContainer.addEventListener('mouseup', () => {
        isDown = false;
        plannerContainer.classList.remove('active');
    });

    plannerContainer.addEventListener('mousemove', (e) => {
        if (!isDown) return;
        e.preventDefault();
        const x = e.pageX - plannerContainer.offsetLeft;
        const walk = (x - startX) * 1; // The multiplier can adjust the scroll speed
        plannerContainer.scrollLeft = scrollLeft - walk;
    });
}
function setupKeyboardNavigation() {
    document.addEventListener('keydown', function(event) {
        if (event.key === 'ArrowRight') {
            moveToNextWeek();
        } else if (event.key === 'ArrowLeft') {
            moveToPreviousWeek();
        }
    });
}
function setupWeekNavigationButtons() {
    document.getElementById("prev-week").addEventListener("click", () => {
        moveToPreviousWeek();
    });

    document.getElementById("next-week").addEventListener("click", () => {
        moveToNextWeek();
    });
}

document.addEventListener("DOMContentLoaded", () => {
    // Existing initialization code...
    setupWeekNavigationButtons();
});
// ========================
// Slider Initialization and Event Handling
// ========================
function setupWeekSlider() {
    const slider = document.getElementById('week-slider');

    // Calculate the total number of weeks in the year
    const totalWeeks = getWeeksInYear(baseDate.getFullYear());
    slider.max = totalWeeks - 1; // Zero-based index
    slider.value = getWeekNumber(baseDate) - 1; // Set slider to current week

    // Update planner when slider value changes
    slider.addEventListener('input', () => {
        const selectedWeek = parseInt(slider.value, 10) + 1;
        navigateToWeek(selectedWeek);
    });
}

// Function to get the total number of weeks in a year
function getWeeksInYear(year) {
    const d = new Date(year, 11, 31);
    const week = getWeekNumber(d);
    return week;
}

// Function to navigate to a specific week number
function navigateToWeek(weekNumber) {
    const year = baseDate.getFullYear();
    // Get the first day of the week
    const firstDayOfYear = new Date(year, 0, 1);
    const daysOffset = (weekNumber - 1) * 7;
    const newDate = new Date(firstDayOfYear.getTime() + daysOffset * 86400000);

    // Adjust to the correct week day
    baseDate = getStartOfWeek(newDate);

    renderPlanner();
    renderMiniCalendar();
    renderYearCalendarModal();
    updateYearAndMonthDisplay();
    saveSelectedDateToLocalStorage(baseDate);

    console.log(`Navigated to week ${weekNumber} of ${year}`);
}

// Call setupWeekSlider after DOM content is loaded
document.addEventListener("DOMContentLoaded", () => {
    // Existing initialization code...
    setupWeekSlider();
});
