// Define API Base URL
const API_BASE_URL = 'http://localhost:3000'; // Replace with your deployed API URL in production

// Global Variables
const baseDate = new Date();
let currentDay = null;
let currentHour = null;
let currentStartOfWeek = null;
let activeCell = null; // Added variable

// Initialize Planner on DOM Load
document.addEventListener("DOMContentLoaded", () => {
    renderPlanner(); 
});

async function renderPlanner() {
    currentStartOfWeek = getStartOfWeek(baseDate);
    renderHeaders(currentStartOfWeek);
    renderTimeSlots(currentStartOfWeek);
    renderWeekNumber();
    renderMonthlyCalendar();
    const weekStartDate = dateFns.format(currentStartOfWeek, 'yyyy-MM-dd');

    const weekNotes = await fetchNotesForWeek(weekStartDate);

    if (weekNotes) {
        for (const [noteDate, times] of Object.entries(weekNotes)) {
            for (const [time, note] of Object.entries(times)) {
                const dayDiff = getDayFromDate(noteDate);
                const hour = getHourFromTime(time);
                const noteTextElement = document.querySelector(`td[data-day="${dayDiff}"][data-hour="${hour}"] .note-text`);
                const spinner = document.querySelector(`td[data-day="${dayDiff}"][data-hour="${hour}"] .spinner`);
                if (noteTextElement && spinner) {
                    noteTextElement.innerText = sanitizeInput(note.text);
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


// Render Day Headers
function renderHeaders(startOfWeek) {
    const dayHeaders = document.getElementById("day-headers");
    dayHeaders.innerHTML = ''; // Clear existing headers

    for (let i = 0; i < 7; i++) {
        const dayDate = addDays(startOfWeek, i);
        const th = document.createElement('th');
        th.className = "day-header";
        th.innerHTML = `<span class="big">${dayDate.getDate()}</span>
                        <span class="day-subheader">${dayDate.toLocaleString('cs-CZ', { weekday: 'long' })}</span>`;
        dayHeaders.appendChild(th);
    }
}function renderTimeSlots(startOfWeek) {
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
            timeLabel.innerText = `${formatHour(hour)}:00`;
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
async function fetchNote(date, time) {
    try {
        const response = await fetch(`${API_BASE_URL}/notes/${date}/${time}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            },
        });

        if (response.status === 404) {
            console.warn(`Note not found for ${date} at ${time}`);
            return null;
        }

        if (!response.ok) {
            throw new Error(`Error fetching note: ${response.statusText}`);
        }

        const data = await response.json();
        return data.text || '';
    } catch (error) {
        console.error(`Fetch Note Error: ${error}`);
        return '';
    }
}

async function fetchNoteForCell(noteTextElement, day, hour, startOfWeek, spinner) {
    const dateObj = addDays(startOfWeek, day);
    const date = dateObj.toISOString().split('T')[0]; // Format: YYYY-MM-DD
    const time = `${formatHour(hour)}:00`;

    // Zobrazit spinner
    spinner.style.display = "block";

    const noteText = await fetchNote(date, time);
    noteTextElement.innerText = sanitizeInput(noteText);

    // Skrýt spinner po načtení
    spinner.style.display = "none";

    console.log(`Fetched note for ${date} ${time}:`, noteText); // Debugging
}


// Save Note to API
async function saveNote() {
    const noteTextElement = document.getElementById("noteText");
    const noteText = noteTextElement.value.trim();
    
    console.log("Attempting to save note:", noteText); // Debugging
    
    if (!noteText) {
        alert("Note cannot be empty.");
        return;
    }

    const dateObj = addDays(currentStartOfWeek, currentDay);
    const date = dateObj.toISOString().split('T')[0];
    const time = `${formatHour(currentHour)}:00`;

    await saveNoteAPI(date, time, noteText);

    // Update the cell with the new note
    const cell = document.querySelector(`td[data-day="${currentDay}"][data-hour="${currentHour}"]`);
    if (cell) {
        const noteTextElement = cell.querySelector('.note-text');
        if (noteTextElement) {
            noteTextElement.innerText = sanitizeInput(noteText);
        }
    }
    closeModal();
}

// Helper Function to Save Note via API
async function saveNoteAPI(date, time, text) {
    try {
        const response = await fetch(`${API_BASE_URL}/notes/${date}/${time}`, {
            method: 'POST', // Use 'PUT' if updating is preferred
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ text }),
        });

        if (!response.ok) {
            throw new Error(`Error saving note: ${response.statusText}`);
        }

        const data = await response.json();
        console.log(`Note saved successfully: ${data.message}`);
    } catch (error) {
        console.error("Error saving note:", error);
        alert("Failed to save the note. Please try again.");
    }
}

// Debounce function to limit how often a function can fire
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
        deleteNoteDirectly(day, hour);
        return;
    }

    saveNoteDirectly(event, day, hour);
}, 500); 

// Save Note Directly via API
async function saveNoteDirectly(event, day, hour) {
    const noteText = event.target.innerText.trim();

    const dateObj = addDays(currentStartOfWeek, day);
    const date = dateObj.toISOString().split('T')[0];
    const time = `${formatHour(hour)}:00`;

    if (!noteText) {
        // If note text is empty, delete the note
        await deleteNote(date, time);
        console.log(`Note deleted at ${date} ${time} due to empty input.`);
        return;
    }

    await saveNoteAPI(date, time, noteText);
}

// Delete Note via API
async function deleteNoteDirectly(day, hour) {
    const dateObj = addDays(currentStartOfWeek, day);
    const date = dateObj.toISOString().split('T')[0];
    const time = `${formatHour(hour)}:00`;

    await deleteNote(date, time);
}

// Helper Function to Delete Note via API
async function deleteNote(date, time) {
    try {
        const response = await fetch(`${API_BASE_URL}/notes/${date}/${time}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
            },
        });

        if (response.status === 404) {
            console.warn(`Note not found for deletion: ${date} at ${time}`);
            return;
        }

        if (!response.ok) {
            throw new Error(`Error deleting note: ${response.statusText}`);
        }

        const data = await response.json();
        console.log(`Note deleted successfully: ${data.message}`);

        // Clear the note text in the cell
        const cell = document.querySelector(`td[data-day="${getDayFromDate(date)}"][data-hour="${getHourFromTime(time)}"]`);
        if (cell) {
            const noteTextElement = cell.querySelector('.note-text');
            if (noteTextElement) {
                noteTextElement.innerText = '';
            }
        }
    } catch (error) {
        console.error(`Error deleting note: ${error}`);
        alert('Failed to delete the note. Please try again.');
    }
}

// Format Hour for Display
function formatHour(hour) {
    return hour.toString().padStart(2, '0');
}
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

// Add Days to a Date
function addDays(date, days) {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
}

// Get Start of the Week (Monday)
function getStartOfWeek(date) {
    const clonedDate = new Date(date);
    const day = clonedDate.getDay() || 7; // Sunday = 7
    const diff = (day === 7 ? -6 : 1) - day;
    clonedDate.setDate(clonedDate.getDate() + diff);
    clonedDate.setHours(0, 0, 0, 0);
    return clonedDate;
}

// Render Monthly Calendar
function renderMonthlyCalendar() {
    const calendar = document.getElementById("calendar");
    const calendarDays = document.getElementById("calendar-days");

    const currentMonth = new Date(baseDate);

    // Removed the line that sets calendarMonth.innerText

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

// Render Week Number
function renderWeekNumber() {
 
    // Calculate Start of the Week
    const startOfWeek = getStartOfWeek(new Date(baseDate)); // Clone baseDate to avoid mutation

    // Calculate Start of the Year
    const startOfYear = new Date(startOfWeek.getFullYear(), 0, 1);

    // Calculate the number of days between startOfWeek and startOfYear
    const diffInTime = startOfWeek - startOfYear;
    const diffInDays = diffInTime / (24 * 60 * 60 * 1000);

    // Calculate Week Number
    const weekNumber = Math.ceil((diffInDays + startOfYear.getDay() + 1) / 7);
    document.getElementById("week-number").innerText = `${weekNumber}`;

    // Array of Month Names in Czech (adjust if you need a different language)
    const monthNamesCzech = [
        "Leden", "Únor", "Březen", "Duben", "Květen", "Červen",
        "Červenec", "Srpen", "Září", "Říjen", "Listopad", "Prosinec"
    ];

    // Get the current month name
    const monthName = monthNamesCzech[startOfWeek.getMonth()];
    document.getElementById("month-title").innerText = monthName;
}

// Sanitize Input to Prevent XSS
function sanitizeInput(str) {
    const temp = document.createElement('div');
    temp.textContent = str;
    return temp.innerHTML;
}

// Utility Functions to Extract Day and Hour from Strings
function getDayFromDate(dateString) {
    const date = new Date(dateString);
    const startOfWeek = getStartOfWeek(baseDate);
    const dayDiff = Math.floor((date - startOfWeek) / (24 * 60 * 60 * 1000));
    return dayDiff;
}

function getHourFromTime(timeString) {
    return parseInt(timeString.split(':')[0], 10);
}
/**
 * Fetch all notes for a specific day.
 * @param {string} date - Date in YYYY-MM-DD format.
 * @returns {Object|null} - Returns notes object or null if not found.
 */
async function fetchNotesForDay(date) {
    try {
        const response = await fetch(`${API_BASE_URL}/notes/day/${date}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            },
        });

        if (response.status === 404) {
            console.warn(`No notes found for ${date}`);
            return null;
        }

        if (!response.ok) {
            throw new Error(`Error fetching notes for day: ${response.statusText}`);
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error(`Fetch Notes For Day Error: ${error}`);
        return null;
    }
}

/**
 * Fetch all notes for a specific week.
 * @param {string} date - Date in YYYY-MM-DD format within the desired week.
 * @returns {Object|null} - Returns notes object or null if not found.
 */
async function fetchNotesForWeek(date) {
    try {
        const response = await fetch(`${API_BASE_URL}/notes/week/${date}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            },
        });

        if (response.status === 404) {
            console.warn(`No notes found for the week of ${date}`);
            return null;
        }

        if (!response.ok) {
            throw new Error(`Error fetching notes for week: ${response.statusText}`);
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error(`Fetch Notes For Week Error: ${error}`);
        return null;
    }
}

/**
 * Fetch all notes for a specific month.
 * @param {string} date - Date in YYYY-MM-DD format within the desired month.
 * @returns {Object|null} - Returns notes object or null if not found.
 */
async function fetchNotesForMonth(date) {
    try {
        const response = await fetch(`${API_BASE_URL}/notes/month/${date}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            },
        });

        if (response.status === 404) {
            console.warn(`No notes found for the month of ${date}`);
            return null;
        }

        if (!response.ok) {
            throw new Error(`Error fetching notes for month: ${response.statusText}`);
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error(`Fetch Notes For Month Error: ${error}`);
        return null;
    }
}
