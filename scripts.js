 
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

// Swipe Variables
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

    setupClock();
    renderPlanner();
    setupSwipeListeners(); // Attach swipe listeners to the initial planner
    renderMiniCalendar();
    renderYearCalendarModal();
    setupWebSpeechAPI(); // Initialize Web Speech API for voice transcription

    setupDragScrolling();
    setupKeyboardNavigation();
    setupWeekNavigationButtons();

    document.getElementById("go-to-today").addEventListener("click", () => {
        // Set the baseDate to the current date
        baseDate = new Date();

        // Re-render the planner, mini-calendar, and year calendar modal
        renderPlanner();
        renderMiniCalendar();
        renderYearCalendarModal();

        // Save the current date to local storage
        saveSelectedDateToLocalStorage(baseDate);

        console.log("Switched to today's date:", baseDate);
    });

});

// ========================
// Utility and Helper Functions
// ========================

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

// Get Start of the Week (Monday)
function getStartOfWeek(date) {
    const result = new Date(date);
    const day = result.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    const diff = (day === 0 ? -6 : 1) - day; // Adjust so that Monday is the start of the week
    result.setDate(result.getDate() + diff);
    result.setHours(0, 0, 0, 0); // Reset time
    return result;
}

// Get End of the Week (Sunday)
function getEndOfWeek(startOfWeek) {
    const result = new Date(startOfWeek);
    result.setDate(result.getDate() + 6);
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
// Function to Determine if a Year is a Leap Year
// ========================
function isLeapYear(year) {
    return ((year % 4 === 0) && (year % 100 !== 0)) || (year % 400 === 0);
}

// ========================
// Render Day Numbers Row
// ========================


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
// Render Day Headers (Day Names and Real Dates)
// ========================
function renderHeaders(startOfWeek) {
    const dayHeaders = document.getElementById("day-headers");
    if (!dayHeaders) {
        console.error("Element with ID 'day-headers' not found.");
        return;
    }
    dayHeaders.innerHTML = ""; // Clear existing headers

    console.log("Rendering day headers...");

    for (let i = 0; i < 7; i++) {
        const dayDate = addDays(startOfWeek, i);
        const th = document.createElement("th");
        th.className = "day-header";
        th.innerHTML = `
            <div class="d-inline-flex">
            <div class="day-name me-2">${dayDate.toLocaleString('cs-CZ', { weekday: 'short' })}</div>
            <div class="day-date" title="${dayDate.toLocaleDateString('cs-CZ', { year: 'numeric', month: 'long', day: 'numeric' })}">${dayDate.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric' })}</div>
            
            </div>
        `;
        dayHeaders.appendChild(th);
    }
}

// ========================
// Render Time Slots
// ========================
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

        for (let day = 0; day < 7; day++) {
            const cell = createTimeSlotCell(day, hour, startOfWeek);
            row.appendChild(cell);
        }

        tbody.appendChild(row);
    }
}
function createTimeSlotCell(day, hour, startOfWeek) {
    const cell = document.createElement("td");
    cell.className = "time-slot";
    cell.dataset.day = day;
    cell.dataset.hour = hour;
    cell.tabIndex = 0; // Enable focus for keyboard navigation

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
    const date = format(dateObj, 'yyyy-MM-dd');
    const time = formatHour(hour);

    if (!noteText) return; // Skip saving if note is empty

    saveNoteToFirebase(date, time, noteText);
}, 500);

// ========================
// Mini Calendar
// ========================
function renderMiniCalendar() {
    const container = document.getElementById("mini-calendar-container");
    if (!container) {
        console.error("Element with ID 'mini-calendar-container' not found.");
        return;
    }
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
} function renderYearCalendarModal() {
    const container = document.querySelector(".year-calendar-modal");
    if (!container) {
        console.error("Element with class 'year-calendar-modal' not found.");
        return;
    }

    container.innerHTML = ""; // Clear existing year calendar

    const currentYear = baseDate.getFullYear();
    const selectedMonth = baseDate.getMonth(); 
    // Add year as the main header
    let yearHeader = document.querySelector(".year-header");
    yearHeader.innerText = currentYear;
    let monthHeader = document.querySelector(".month-header");
    // Update the week-header with the current selected week number
    const weekHeader = document.querySelector(".week-header");
    if (weekHeader) {
        const selectedWeekNumber = getWeekNumber(baseDate);
        weekHeader.innerText = `${selectedWeekNumber} týden`;
    }

    // Create the accordion wrapper
    const accordion = document.createElement("div");
    accordion.className = "accordion accordion-flush";
    accordion.id = "yearCalendarAccordion";

    for (let month = 0; month < 12; month++) {
        const firstDay = new Date(currentYear, month, 1);
        const daysInMonth = new Date(currentYear, month + 1, 0).getDate();
        const monthName = firstDay.toLocaleString("cs-CZ", { month: "long" });
        const isSelectedMonth = month === selectedMonth;
if (month == selectedMonth) {
    monthHeader.innerText = monthName.charAt(0).toUpperCase() + monthName.slice(1); 
}
        // Accordion item
        const accordionItem = document.createElement("div");
        accordionItem.className = "accordion-item";

        // Accordion header
        const headerId = `flush-heading${month}`;
        const collapseId = `flush-collapse${month}`;
        const accordionHeader = document.createElement("h2");
        accordionHeader.className = "accordion-header";
        accordionHeader.id = headerId;

        const accordionButton = document.createElement("button");
        accordionButton.className = `accordion-button ${isSelectedMonth ? "" : "collapsed"}`;
        accordionButton.type = "button";
        accordionButton.setAttribute("data-bs-toggle", "collapse");
        accordionButton.setAttribute("data-bs-target", `#${collapseId}`);
        accordionButton.setAttribute("aria-expanded", isSelectedMonth ? "true" : "false");
        accordionButton.setAttribute("aria-controls", collapseId);
        accordionButton.innerText = monthName.charAt(0).toUpperCase() + monthName.slice(1); // Capitalize first letter

        accordionHeader.appendChild(accordionButton);
        accordionItem.appendChild(accordionHeader);

        // Accordion body (collapse content)
        const accordionCollapse = document.createElement("div");
        accordionCollapse.id = collapseId;
        accordionCollapse.className = `accordion-collapse collapse ${isSelectedMonth ? "show" : ""}`;
        accordionCollapse.setAttribute("aria-labelledby", headerId);
        accordionCollapse.setAttribute("data-bs-parent", "#yearCalendarAccordion");

        const accordionBody = document.createElement("div");
        accordionBody.className = "accordion-body";

        // Generate month table
        const table = document.createElement("table");
        table.className = "table table-bordered table-sm text-center";

        const tbody = document.createElement("tbody");
        let row = document.createElement("tr");

        // Empty cells for days before the first day of the month
        for (let i = 0; i < (firstDay.getDay() || 7) - 1; i++) {
            row.appendChild(document.createElement("td"));
        }

        // Add cells for each day of the month
        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(currentYear, month, day);
            const cell = document.createElement("td");
            cell.innerText = day;

            // Highlight Sundays
            if (date.getDay() === 0) {
                cell.style.color = "red";
            }

            // Highlight the selected week
            if (isDateInCurrentSelectedWeek(date)) {
                cell.classList.add("selected-week");
                cell.style.backgroundColor = "#d1e7dd"; // Light green
            }

            // Add click event to select a date
            cell.addEventListener("click", () => {
                baseDate = date;
                renderPlanner();
                renderMiniCalendar();
                renderYearCalendarModal();
                saveSelectedDateToLocalStorage(date);

                // Close the modal if Bootstrap modal is active
                const modal = bootstrap.Modal.getInstance(
                    document.getElementById("yearCalendarModal")
                );
                if (modal) modal.hide();
            });

            row.appendChild(cell);

            // Start a new row if the current day is Sunday or the last day of the month
            if (date.getDay() === 0 || day === daysInMonth) {
                tbody.appendChild(row);
                row = document.createElement("tr");
            }
        }

        table.appendChild(tbody);
        accordionBody.appendChild(table);
        accordionCollapse.appendChild(accordionBody);
        accordionItem.appendChild(accordionCollapse);

        // Append the accordion item to the accordion
        accordion.appendChild(accordionItem);
    }

    container.appendChild(accordion);
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
// Functions to Update Display
// ========================

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
// Navigation and Event Listeners
// ========================


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
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), wait);
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

// ========================
// Navigation Buttons Initialization
// ========================
function setupWeekNavigationButtons() {
    const prevWeekBtn = document.getElementById("prev-week");
    const nextWeekBtn = document.getElementById("next-week");

    if (prevWeekBtn) {
        prevWeekBtn.addEventListener("click", () => {
            moveToPreviousWeek();
        });
    } else {
        console.error("Element with ID 'prev-week' not found.");
    }

    if (nextWeekBtn) {
        nextWeekBtn.addEventListener("click", () => {
            moveToNextWeek();
        });
    } else {
        console.error("Element with ID 'next-week' not found.");
    }
}

// ========================
// Swipe Handling Functions
// ========================
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

// ========================
// Drag Scrolling and Keyboard Navigation
// ========================
function setupDragScrolling() {
    const plannerContainer = document.querySelector(".planner-table-container");
    if (!plannerContainer) {
        console.error("Planner table container not found for drag scrolling.");
        return;
    }

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
} function setupKeyboardNavigation() {
    let currentCell = document.querySelector(".time-slot"); // Default to the first cell

    // Highlight the initial cell and focus its editable content
    if (currentCell) {
        currentCell.classList.add("selected-cell");
        focusEditableContent(currentCell);
    }

    // Style for the selected cell
    const css = `
        .selected-cell {
            outline: 2px solid blue; /* Highlight the focused cell */
            background-color: #e0f7fa; /* Optional: Change background color */
        }
    `;
    const style = document.createElement("style");
    style.appendChild(document.createTextNode(css));
    document.head.appendChild(style);

    // Function to focus and start editing the content
    function focusEditableContent(cell) {
        const noteText = cell.querySelector(".note-text");
        if (noteText) {
            noteText.focus(); // Focus the contenteditable element
            noteText.setAttribute("contenteditable", "true"); // Ensure it is editable
        }
    }

    document.addEventListener("keydown", function (event) {
        if (!currentCell) return;

        let nextCell = null;
        const day = parseInt(currentCell.dataset.day, 10);
        const hour = parseInt(currentCell.dataset.hour, 10);

        switch (event.key) {
            case "ArrowRight":
                nextCell = document.querySelector(`td[data-day="${(day + 1) % 7}"][data-hour="${hour}"]`);
                break;
            case "ArrowLeft":
                nextCell = document.querySelector(`td[data-day="${(day - 1 + 7) % 7}"][data-hour="${hour}"]`);
                break;
            case "ArrowDown":
                nextCell = document.querySelector(`td[data-day="${day}"][data-hour="${hour + 1 <= 20 ? hour + 1 : 7}"]`);
                break;
            case "ArrowUp":
                nextCell = document.querySelector(`td[data-day="${day}"][data-hour="${hour - 1 >= 7 ? hour - 1 : 20}"]`);
                break;
            default:
                return; // Ignore other keys
        }

        // If a valid next cell exists, move focus
        if (nextCell) {
            event.preventDefault(); // Prevent default scrolling behavior
            currentCell.classList.remove("selected-cell"); // Remove highlight from the current cell
            currentCell = nextCell; // Update to the new cell
            currentCell.classList.add("selected-cell"); // Highlight the new cell
            focusEditableContent(currentCell); // Focus on the editable content
        }
    });

    // Allow direct editing when a cell is clicked
    document.addEventListener("click", function (event) {
        const cell = event.target.closest(".time-slot"); // Ensure we only target .time-slot
        if (cell) {
            if (currentCell) {
                currentCell.classList.remove("selected-cell");
            }
            currentCell = cell;
            currentCell.classList.add("selected-cell");
            focusEditableContent(currentCell); // Focus on the editable content
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
    renderMiniCalendar();
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
    renderMiniCalendar();
    renderYearCalendarModal();

    // After rendering is done, re-attach swipe listeners
    setTimeout(() => {
        setupSwipeListeners();
        isAnimating = false;
    }, 500); // Match with CSS transition duration (adjust if needed)
}

// Function to determine if a year is a leap year
function isLeapYear(year) {
    return ((year % 4 === 0) && (year % 100 !== 0)) || (year % 400 === 0);
}

// Function to get a date from day of the year
function getDateFromDay(year, day) {
    const date = new Date(year, 0); // January 1st
    return new Date(date.setDate(day));
}
