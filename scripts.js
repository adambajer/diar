// script.js

// ========================
// Firebase Configuration
// ========================

// TODO: Replace the following with your app's Firebase project configuration.
// You can find this information in your Firebase project settings.
const firebaseConfig = {
    apiKey: "YOUR_API_KEY_HERE",
    authDomain: "YOUR_AUTH_DOMAIN_HERE",
    databaseURL: "https://voice-noter-default-rtdb.europe-west1.firebasedatabase.app", // e.g., https://your-project-id.firebaseio.com
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

let baseDate = new Date();
let currentDay = null;
let currentHour = null;
let currentStartOfWeek = null;
let activeCell = null; // Added variable

// ========================
// Initialize Planner on DOM Load
// ========================
document.addEventListener("DOMContentLoaded", () => {
    renderPlanner();
    updateYearAndMonthDisplay();
    renderMiniCalendar();
});


// ========================
// Render Planner Function
// ========================
async function renderPlanner() {
    currentStartOfWeek = getStartOfWeek(baseDate);
    //renderHeaders(currentStartOfWeek);
    renderTimeSlots(currentStartOfWeek);
   // renderYearCalendar();
  
     const weekStartDate = format(currentStartOfWeek, 'yyyy-MM-dd');

    const weekNotes = await fetchNotesForWeekFromFirebase(weekStartDate);

    if (weekNotes) {
        for (const [dayKey, hours] of Object.entries(weekNotes)) {
            const dayIndex = parseInt(dayKey.replace('day', ''), 10); // e.g., 'day0' -> 0
            for (const [hourKey, noteText] of Object.entries(hours)) {
                const hourIndex = parseInt(hourKey.replace('hour', ''), 10); // e.g., 'hour7' -> 7
                const noteTextElement = document.querySelector(`td[data-day="${dayIndex}"][data-hour="${hourIndex}"] .note-text`);
                const spinner = document.querySelector(`td[data-day="${dayIndex}"][data-hour="${hourIndex}"] .spinner`);
                if (noteTextElement && spinner) {
                    noteTextElement.innerText = sanitizeInput(noteText);
                    spinner.style.display = "none"; // Hide spinner if it was visible
                }
            }
        }
    } 
    // Focus the first cell
    const firstCell = document.querySelector(`td[data-day="0"][data-hour="7"] .note-text`);
    if (firstCell) {
        firstCell.classList.add('active');
        firstCell.focus();
    }
}

// ========================
// Render Day Headers
// ========================
function renderHeaders(startOfWeek) {
    const dayHeaders = document.getElementById("day-headers");
    dayHeaders.innerHTML = ''; // Clear existing headers

    for (let i = 0; i < 7; i++) {
        const dayDate = addDays(startOfWeek, i);
        const th = document.createElement('th');
        th.className = "day-header";
        th.innerHTML = `<span class="day-subheader">${dayDate.toLocaleString('cs-CZ', { weekday: 'short' })}</span><span class="big">${dayDate.getDate()}</span>
                        `;
        dayHeaders.appendChild(th);
    }
}

// ========================
// Render Time Slots
// ========================
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

            const timeLabel = document.createElement("span");
            timeLabel.className = "time-label";
            timeLabel.innerText = `${formatHour(hour)}`;
            cell.appendChild(timeLabel);

            // Spinner Element
            const spinner = document.createElement("div");
            spinner.className = "spinner";
            spinner.style.display = "none"; // Hide spinner initially
            cell.appendChild(spinner);

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

            cell.appendChild(noteTextElement);

            row.appendChild(cell);

            // Fetch and Display Existing Notes
            fetchNoteForCell(noteTextElement, day, hour, startOfWeek, spinner);
        }

        tbody.appendChild(row);
    }
}

// ========================
// Handle Keyboard Navigation
// ========================
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
        case 'Tab':
            event.preventDefault();
            // Allow default Tab behavior to handle focus
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
        document.querySelectorAll('.note-text.active').forEach(el => el.classList.remove('active'));

        // Add active class to the target cell
        targetCell.classList.add('active');

        targetCell.focus();
    }
}

// ========================
// Fetch Note for a Specific Cell
// ========================
async function fetchNoteForCell(noteTextElement, day, hour, startOfWeek, spinner) {
    const dateObj = addDays(startOfWeek, day);
    const date = format(dateObj, 'yyyy-MM-dd'); // Format: YYYY-MM-DD
    const time = `${formatHour(hour)}:00`;

    // Show spinner
    spinner.style.display = "block";

    const noteText = await fetchNoteFromFirebase(date, time);
    noteTextElement.innerText = sanitizeInput(noteText || '');

    // Hide spinner after loading
    spinner.style.display = "none";

    console.log(`Fetched note for ${date} ${time}:`, noteText); // Debugging
}

// ========================
// Save Note to Firebase
// ========================
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

// ========================
// Delete Note from Firebase
// ========================
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

// ========================
// Save Note Directly via Event
// ========================
async function saveNoteDirectly(event, day, hour) {
    const noteText = event.target.innerText.trim();

    const dateObj = addDays(currentStartOfWeek, day);
    const date = format(dateObj, 'yyyy-MM-dd');
    const time = `${formatHour(hour)}:00`;

    if (!noteText) {
        // If note text is empty, delete the note
        await deleteNoteFromFirebase(date, time);
        console.log(`Note deleted at ${date} ${time} due to empty input.`);
        return;
    }

    await saveNoteToFirebase(date, time, noteText);
}

// ========================
// Debounce Function
// ========================
function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

// Handle note input with debounce
const handleNoteInput = debounce((event, day, hour) => {
    const noteText = event.target.innerText.trim();

    // Optionally handle empty notes
    if (noteText === '') {
        const dateObj = addDays(currentStartOfWeek, day);
        const date = format(dateObj, 'yyyy-MM-dd');
        const time = `${formatHour(hour)}:00`;
        deleteNoteFromFirebase(date, time);
        return;
    }

    const dateObj = addDays(currentStartOfWeek, day);
    const date = format(dateObj, 'yyyy-MM-dd');
    const time = `${formatHour(hour)}:00`;

    saveNoteToFirebase(date, time, noteText);
}, 500);

// ========================
// Render Monthly Calendar
// ========================
function renderMonthlyCalendar() {
    const calendar = document.getElementById("calendar");
    const calendarDays = document.getElementById("calendar-days");

    let currentMonth = new Date(baseDate);

    // Set aria-label for accessibility (Optional)
    calendar.setAttribute('aria-label', `Kalendář pro ${currentMonth.toLocaleString('cs-CZ', { month: 'long', year: 'numeric' })}`);

    const firstDay = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
    const startDay = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;

    calendarDays.innerHTML = "";

    let currentRow = document.createElement("tr");
    for (let i = 0; i < startDay; i++) {
        currentRow.appendChild(document.createElement("td"));
    }

    const daysInMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();
    for (let day = 1; day <= daysInMonth; day++) {
        const cell = document.createElement("td");
        cell.innerText = day;
        currentRow.appendChild(cell);

        if ((startDay + day) % 7 === 0) {
            calendarDays.appendChild(currentRow);
            currentRow = document.createElement("tr");
        }
    }

    if (currentRow.children.length > 0) {
        calendarDays.appendChild(currentRow);
    }
}


// ========================
// Sanitize Input to Prevent XSS
// ========================
function sanitizeInput(str) {
    const temp = document.createElement('div');
    temp.textContent = str;
    return temp.innerHTML;
}

// ========================
// Utility Functions
// ========================

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

// Add Days to a Date
function addDays(date, days) {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
}

 
// Get Week Number
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

// Get Day Index from Date String
function getDayFromDate(dateString) {
    const date = new Date(dateString);
    const startOfWeek = getStartOfWeek(baseDate);
    const dayDiff = Math.floor((date - startOfWeek) / (24 * 60 * 60 * 1000));
    return dayDiff;
}

// Get Hour from Time String
function getHourFromTime(timeString) {
    return parseInt(timeString.split(':')[0], 10);
}

// Format Hour for Display
function formatHour(hour) {
    return hour.toString().padStart(1, '0');
}

// ========================
// Navigation Functions
// ========================

// Navigate to Next Week
function goToNextWeek() {
    baseDate.setDate(baseDate.getDate() + 7);
    renderPlanner();
}

// Navigate to Previous Week
function goToPreviousWeek() {
    baseDate.setDate(baseDate.getDate() - 7);
    renderPlanner();
}

/**
 * Fetch a specific note for a given date and time from Firebase.
 * @param {string} date - Date in YYYY-MM-DD format.
 * @param {string} time - Time in HH:MM format.
 * @returns {Promise<string|null>} - Returns the note text or null if not found.
 */
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

/**
 * Fetch all notes for a specific week from Firebase.
 * @param {string} weekStartDate - Start date of the week in YYYY-MM-DD format.
 * @returns {Promise<Object|null>} - Returns an object containing notes or null if not found.
 */
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
}function getStartOfWeek(date) {
    const result = new Date(date);
    const day = result.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    const diff = (day === 0 ? -6 : 1) - day; // Adjust so that Monday is the start of the week
    result.setDate(result.getDate() + diff);
    return result;
}

function renderYearCalendar() {
    const yearCalendar = document.querySelector(".year-calendar");
    const currentYear = baseDate.getFullYear();
    const currentMonth = baseDate.getMonth();

    yearCalendar.innerHTML = ""; // Clear existing content

    for (let month = 0; month < 12; month++) {
        const firstDay = new Date(currentYear, month, 1);
        const daysInMonth = new Date(currentYear, month + 1, 0).getDate();
        const monthName = firstDay.toLocaleString('cs-CZ', { month: 'long' });

        const monthContainer = document.createElement("div");
        monthContainer.className = "month-container shadow-sm";
        if (month === currentMonth) {
            monthContainer.classList.add("expanded");
        }

        const monthLabel = document.createElement("div");
        monthLabel.className = "month-label";
        monthLabel.innerText = monthName.toUpperCase();
        monthLabel.addEventListener("mouseenter", () => {
            document.querySelectorAll(".month-container").forEach(el => el.classList.remove("expanded"));
            monthContainer.classList.add("expanded");
        });

        const calendar = document.createElement("table");
        calendar.className = "month-calendar";

        const tbody = document.createElement("tbody");
        let row = document.createElement("tr");

        for (let i = 0; i < (firstDay.getDay() || 7) - 1; i++) {
            row.appendChild(document.createElement("td"));
        }

        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(currentYear, month, day);
            const dateStr = format(date, 'yyyy-MM-dd');

            const cell = document.createElement("td");
            cell.innerText = day;

            if (
                date >= getStartOfWeek(baseDate) && 
                date < addDays(getStartOfWeek(baseDate), 7)
            ) {
                cell.classList.add("current-week");
            }

            cell.addEventListener("click", () => goToSpecificDate(dateStr));

            row.appendChild(cell);

            if (date.getDay() === 0 || day === daysInMonth) {
                tbody.appendChild(row);
                row = document.createElement("tr");
            }
        }

        calendar.appendChild(tbody);

        monthContainer.appendChild(monthLabel);
        monthContainer.appendChild(calendar);
        yearCalendar.appendChild(monthContainer);
    }
}



// Navigate to a specific date in the planner
function goToSpecificDate(dateStr) {
    baseDate = new Date(dateStr);
    renderPlanner();
}


// Navigate to a specific date in the planner
function goToSpecificDate(dateStr) {
    baseDate = new Date(dateStr);
    renderPlanner();
}
document.getElementById("open-year-calendar").addEventListener("click", () => {
    renderYearCalendarModal();
    const modal = new bootstrap.Modal(document.getElementById("yearCalendarModal"));
    modal.show();
});
function renderYearCalendarModal() {
    const container = document.querySelector(".year-calendar-modal");
    container.innerHTML = ""; // Clear existing content

    const currentYear = baseDate.getFullYear();

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
        table.className = "table table-bordered table-sm";

        const tbody = document.createElement("tbody");
        let row = document.createElement("tr");

        for (let i = 0; i < (firstDay.getDay() || 7) - 1; i++) {
            row.appendChild(document.createElement("td"));
        }

        for (let day = 1; day <= daysInMonth; day++) {
            const cell = document.createElement("td");
            cell.innerText = day;

            row.appendChild(cell);

            if (new Date(currentYear, month, day).getDay() === 0 || day === daysInMonth) {
                tbody.appendChild(row);
                row = document.createElement("tr");
            }
        }

        table.appendChild(tbody);
        monthContainer.appendChild(monthLabel);
        monthContainer.appendChild(table);
        container.appendChild(monthContainer);
    }
}function renderMiniCalendar() {
    const container = document.getElementById("mini-calendar-container");
    container.innerHTML = ""; // Clear existing content

    const currentYear = baseDate.getFullYear();
    const currentMonth = baseDate.getMonth();
    const firstDay = new Date(currentYear, currentMonth, 1);
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

    const table = document.createElement("table");
    table.className = "table table-sm table-bordered";

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

        // Highlight today's date
        if (date.toDateString() === new Date().toDateString()) {
            cell.classList.add("bg-primary", "text-white");
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

function updateYearAndMonthDisplay() {
    const currentYear = baseDate.getFullYear();
    const currentMonthName = baseDate.toLocaleString('cs-CZ', { month: 'long' });

    document.getElementById("current-year").innerText = currentYear;
    document.getElementById("current-month-name").innerText = currentMonthName.toUpperCase();
    document.getElementById("selected-month").innerText = currentMonthName;
}
// Handle switching to the previous month
document.getElementById("prev-month").addEventListener("click", () => {
    baseDate.setMonth(baseDate.getMonth() - 1); // Move to the previous month
    updateMonthView();
});

// Handle switching to the next month
document.getElementById("next-month").addEventListener("click", () => {
    baseDate.setMonth(baseDate.getMonth() + 1); // Move to the next month
    updateMonthView();
});

// Update the mini-calendar, current month name, and year display
function updateMonthView() {
    renderMiniCalendar();
    updateYearAndMonthDisplay();
}
