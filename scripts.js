
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
let currentSelectedCell = null;
let topMicIcon = null;
// Swipe Variables
let touchStartX = null;
let touchEndX = null;


let isSwiping = false;
// Global Variables
let microphonePermissionGranted = false;
let currentCell = null;
let yearHeader = null;
// ========================
// Initialize Planner on DOM Load
// ========================
document.addEventListener("DOMContentLoaded", () => {
    console.log("DOM loaded. Initializing planner...");
    topMicIcon = document.querySelector("#top-mic-icon");
    yearHeader = document.querySelector(".year-header");
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
    setupWebSpeechAPI(); // Initialize Web Speech API for voice transcription

    setupDragScrolling();
    setupKeyboardNavigation();

    renderYearCalendarModal();
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

    // Add click event listener to the top microphone icon
    if (topMicIcon) {
        topMicIcon.addEventListener("click", (event) => {
            event.preventDefault(); // Prevent default click behavior
            event.stopPropagation(); // Stop the event from bubbling up

            if (currentSelectedCell) {
                startTranscription(currentSelectedCell);
            } else if (!microphonePermissionGranted || !currentSelectedCell) {
                showToast("Napřed vyberte buňku, jestli chcete přepsat hlas!", 'warning');
                topMicIcon.classList.add("shake");

                // Add the orange color class
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
function getWeekNumberISO(date) {
    const target = new Date(date.valueOf());
    const dayNr = (date.getDay() + 6) % 7;
    target.setDate(target.getDate() - dayNr + 3);
    const firstThursday = target.valueOf();
    target.setMonth(0, 1);
    if (target.getDay() !== 4) {
        target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7);
    }
    const weekNumber = 1 + Math.ceil((firstThursday - target) / 604800000);
    return [date.getFullYear(), weekNumber];
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
function formatHourShort(hour) {
    return hour.toString().padStart(2, '0');
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
};


function renderHeaders(startOfWeek) {
    const dayHeaders = document.getElementById("day-headers");
    if (!dayHeaders) {
        console.error("Element with ID 'day-headers' not found.");
        return;
    }
    dayHeaders.innerHTML = ""; // Clear existing headers

    console.log("Rendering day headers...");
    console.log("Keys in calendarData:", Object.keys(calendarData)); // Log all keys in calendarData

    for (let i = 0; i < 7; i++) {
        const dayDate = addDays(startOfWeek, i);
        const formattedDate = dayDate.getDate() + "." + (dayDate.getMonth() + 1) + ".";

        console.log(`Checking for formattedDate: "${formattedDate}" in calendarData.`);
        const data = calendarData[formattedDate] || { nameDay: "", holiday: "" };

        console.log(`Data for ${formattedDate}:`, data);

        const th = document.createElement("th");
        th.className = "day-header ";

        // Add CSS class for holidays
        if (data.holiday) {
            th.classList.add("holiday");
        }
        const weekdayName = capitalizeFirstLetter(
            dayDate.toLocaleString("cs-CZ", { weekday: "long" })
        );
        th.innerHTML = `
            <div class="day-header-content">
                <div class="d-inline-block">
                    <div class="day-date display-5 me-1">
                        ${dayDate.getDate()}
                    </div>
                </div>
                <div class="d-inline-block">
                
                <div class="holiday-name d-sm-none d-none d-md-block">${data.holiday}</div>
                <div class="name-day">${data.nameDay}</div
                  <div class="day-name">
                       <strong> ${weekdayName}</strong>
                    </div>
                    </div>
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
    timeLabel.innerHTML = '<small class="text-muted">' + formatHourShort(hour) + '</span>';

    const noteText = createNoteTextElement(day, hour, spinner);



    container.appendChild(timeLabel);
    container.appendChild(noteText);

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

    container.appendChild(row);  // Keeps track of the currently displayed month in the modal
}
function renderYearCalendarModal() {
    const container = document.querySelector(".year-calendar-modal");
    if (!container) {
        console.error("Element '.year-calendar-modal' not found.");
        return;
    }

    let currentYear = baseDate.getFullYear();
    let selectedMonth = baseDate.getMonth();
    let daysInMonth = new Date(currentYear, selectedMonth + 1, 0).getDate();
    let firstDay = new Date(currentYear, selectedMonth, 1);
    // Get and display the interval for the current week
    let weekStartDate = getStartOfWeek(baseDate);
    let weekEndDate = getEndOfWeek(weekStartDate);
    let monthheader = document.querySelector(".month-header");
    monthheader.innerText = `${weekStartDate.getDate()}. - ${weekEndDate.getDate()}.${weekEndDate.getMonth() + 1}. ${currentYear}`;
    // Clear previous content
    container.innerHTML = "";

    // Add table for calendar
    const table = document.createElement("table");
    table.className = "table table-bordered text-right";

    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    const thweek = document.createElement("th");
    thweek.innerText = "";
    headerRow.appendChild(thweek);
    ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"].forEach((day) => {
        const th = document.createElement("th");
        th.innerText = day;
        headerRow.appendChild(th);
    });

    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    let weekRow = document.createElement("tr");

    // Week number column
    let weekNumber = getWeekNumber(firstDay);
    const weekCell = document.createElement("td");
    weekCell.innerText = `W${weekNumber}`;
    weekRow.appendChild(weekCell);

    // Empty cells for days before the start of the month
    for (let i = 1; i < firstDay.getDay(); i++) {
        const emptyCell = document.createElement("td");
        weekRow.appendChild(emptyCell);
    }

    // Fill in the days
    for (let day = 1; day <= daysInMonth; day++) {
        const dayDate = new Date(currentYear, selectedMonth, day);
        const dayCell = document.createElement("td");
        dayCell.innerText = day;

        // Highlight the selected week
        if (isDateInCurrentSelectedWeek(dayDate)) {
            dayCell.classList.add("table-success");
        }

        // Add click event
        dayCell.addEventListener("click", () => {

            baseDate = dayDate; // Update the global selected date
            renderPlanner(); // Update the planner
            renderYearCalendarModal(); // Re-render modal content

            highlightSelectedWeek(baseDate); // Update the selected week highlight
        });

        weekRow.appendChild(dayCell);

        // Start a new row for the next week
        if (dayDate.getDay() === 0 || day === daysInMonth) {
            tbody.appendChild(weekRow);
            weekRow = document.createElement("tr");

            // Add week number for the new row
            weekNumber++;
            const newWeekCell = document.createElement("td");
            newWeekCell.innerText = `W${weekNumber}`;
            weekRow.appendChild(newWeekCell);
        }
    }

    table.appendChild(tbody);
    container.appendChild(table);

    // Add navigation and footer
    const footer = document.createElement("div");
    footer.className = "d-flex justify-content-between align-items-center mt-3";

    const prevButton = document.createElement("button");
    prevButton.className = "btn btn-outline-secondary";
    prevButton.innerText = "←";
    prevButton.addEventListener("click", (e) => {
        e.stopPropagation(); // Prevent closing the dropdown
        baseDate.setDate(baseDate.getDate() - 7); // Move back one week
        renderYearCalendarModal(); // Re-render modal content
        renderPlanner(); // Update the planner
    });

    const nextButton = document.createElement("button");
    nextButton.className = "btn btn-outline-secondary";
    nextButton.innerText = "→";
    nextButton.addEventListener("click", (e) => {
        e.stopPropagation(); // Prevent closing the dropdown
        baseDate.setDate(baseDate.getDate() + 7); // Move forward one week
        renderYearCalendarModal(); // Re-render modal content
        renderPlanner(); // Update the planner
    });


    const dateInterval = document.createElement("span");
    dateInterval.className = "text-right";
    dateInterval.innerText = `${weekStartDate.getDate()}.${weekStartDate.getMonth() + 1} - ${weekEndDate.getDate()}.${weekEndDate.getMonth() + 1}`;

    footer.appendChild(prevButton);

    footer.appendChild(dateInterval);
    footer.appendChild(nextButton);
    container.appendChild(footer);

    // Highlight the selected week after rendering
    highlightSelectedWeek(baseDate);
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

    //console.log(`Fetching note for day ${day}, hour ${hour} (${date} ${time})`);

    // Show spinner
    spinner.style.display = "block";

    const noteText = await fetchNoteFromFirebase(date, time);
    noteTextElement.innerText = sanitizeInput(noteText || '');

    // Hide spinner after loading
    spinner.style.display = "none";

    //console.log(`Loaded note for ${date} at ${time}: "${noteText}"`);
}

// ========================
// Set Up Web Speech API for Transcription
// ========================
// Set up Web Speech API for Transcription
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
            saveSelectedDateToLocalStorage(dateObj);
            stopTranscription(); // Clear current transcription cell
        } else {
            console.warn("Active cell for transcription not found.");
        }
    });

    recognition.addEventListener('speechend', () => {
        console.log("Speech ended. Stopping transcription.");
        if (currentTranscribingCell) {
            recognition.stop();
        }
    });

    recognition.addEventListener('end', () => {
        console.log("Speech recognition service disconnected.");
        if (currentTranscribingCell) {
            stopTranscription();
        }
    });

    recognition.addEventListener('error', (event) => {
        console.error(`Voice transcription error (${event.error}):`, event);
        showToast(`Chyba přepisu hlasu: ${event.error}.`, 'error');
        if (currentTranscribingCell) {
            stopTranscription();
        }
    });
}
// Start Transcription with Countdown
function startTranscriptionWithCountdown(noteTextElement) {


    let countdownValue = 1.0; // Start at 1.0 seconds
    displayCountdown(countdownValue);

    const countdownInterval = setInterval(() => {
        countdownValue -= 0.1;
        countdownValue = Math.round(countdownValue * 10) / 10;

        if (countdownValue <= 0) {
            clearInterval(countdownInterval);
            hideCountdown();
            startTranscription(noteTextElement);
        } else {
            displayCountdown(countdownValue);
        }
    }, 100);

    // Allow user to cancel by moving the cursor away
    if (topMicIcon) {
        topMicIcon.addEventListener("click", (event) => {
            event.preventDefault(); // Prevent default click behavior
            event.stopPropagation(); // Stop the event from bubbling up

            if (currentSelectedCell) {
                startTranscription(currentSelectedCell);
            } else if (!currentSelectedCell) {
                if (topMicIcon) {
                    topMicIcon.classList.add('active');
                }
            
                showToast("Prosím, vyberte buňku, do které chcete přepsat hlas.", 'info');
            }
        });
    }

}

function startTranscription(noteTextElement) {
    if (currentTranscribingCell) {
        showToast("Přepis je již spuštěn.", 'info');
        return;
    }

    currentTranscribingCell = noteTextElement;

    const cell = noteTextElement.closest('td');
    cell.classList.add('recording');

    if (topMicIcon) {
        topMicIcon.classList.add('active');
    }

    try {
        recognition.start();
        showToast("Začíná přepis hlasu. Můžete mluvit.", 'success');
    } catch (error) {
        console.error("Error starting voice transcription:", error);
        showToast("Nepodařilo se spustit přepis hlasu.", 'error');
        stopTranscription();
    }
}

function stopTranscription() {
    if (recognition && currentTranscribingCell) {
        recognition.stop();

        const cell = currentTranscribingCell.closest('td');
        cell.classList.remove('recording');


        if (topMicIcon) {
            topMicIcon.classList.remove('active');
        }

        currentTranscribingCell = null;
    }
}




// ========================
// Function for Toast Notifications
// ========================

// Show Toast Notifications
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
    } else if (type === 'warning') {
        icon.className = "bi bi-exclamation-triangle-fill text-warning me-2";
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

        if (cellDate >= startOfWeek && cellDate <= endOfWeek) {
            cell.classList.add("table-success");
        } else {
            cell.classList.remove("table-success");
        }
    });
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
}
// Modify the focusEditableContent function to set currentSelectedCell
function focusEditableContent(cell) {
    const noteText = cell.querySelector(".note-text");
    if (noteText) {
        noteText.focus();
        noteText.setAttribute("contenteditable", "true");
        currentSelectedCell = noteText; // Set the selected cell's noteText
    }
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
            focusEditableContent(currentCell);
        }
    }

    // Function to focus on editable content within the cell
    function focusEditableContent(cell) {
        const editable = cell.querySelector('.editable');
        if (editable) {
            editable.focus();
        }
    }

    // Function to display toast notifications
    function showToast(message, type) {
        // Implementation of toast notifications
        // Example using a simple alert for demonstration
        alert(`${type.toUpperCase()}: ${message}`);
    }

    // Function to start transcription
    function startTranscription(cell) {
        // Implementation of transcription logic
        console.log("Transcription started for:", cell);
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
            event.preventDefault(); // Prevent default behavior if Ctrl is pressed

            if (event.key === 'c' || event.key === 'C') { // Example: Ctrl+C to start transcription
                if (currentCell) {
                    startTranscription(currentCell);
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

// Modify Cell Selection to Request Microphone Permission
document.addEventListener("click", function (event) {
    const cell = event.target.closest(".time-slot");
    if (cell) {
        if (currentCell) {
            currentCell.classList.remove("selected-cell");
        }
        currentCell = cell;
        currentCell.classList.add("selected-cell");
        focusEditableContent(currentCell);


    } else {
        // Deselect current cell if any
        if (currentCell) {
            currentCell.classList.remove("selected-cell");
            currentCell = null;
            currentSelectedCell = null;
        }
    }
});

// Function to Request Microphone Permission
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
function capitalizeFirstLetter(string) {
    if (!string) return '';
    return string.charAt(0).toUpperCase() + string.slice(1);
}
function getWeeksInYear(year) {
    const d = new Date(year, 11, 31);
    const week = getWeekNumberISO(d)[1];
    // If the last day of the year is in week 1, then the total weeks is the week number of the last Thursday of the year
    if (week === 1) {
        const lastThursday = new Date(year, 11, 31);
        lastThursday.setDate(lastThursday.getDate() - ((lastThursday.getDay() + 6) % 7) - 3);
        return getWeekNumberISO(lastThursday)[1];
    }
    return week;
}

function selectWeek(weekNumber, year) {
    const firstThursday = new Date(year, 0, 4);
    const firstWeekStart = new Date(firstThursday.getTime() - ((firstThursday.getDay() + 6) % 7) * 86400000);
    const selectedDate = new Date(firstWeekStart.getTime() + (weekNumber - 1) * 7 * 86400000);
    baseDate = selectedDate;
    renderPlanner();
    renderMiniCalendar();
    renderYearCalendarModal();
    saveSelectedDateToLocalStorage(baseDate);
} function displayCountdown(value) {
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
