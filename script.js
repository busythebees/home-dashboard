function updateClock() {
    const now = new Date();

    document.getElementById("time").textContent =
        now.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit"
        });

    document.getElementById("date").textContent =
        now.toLocaleDateString([], {
            weekday: "long",
            day: "numeric",
            month: "long"
        });
}

updateClock();
setInterval(updateClock, 1000);
if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("service-worker.js");
}

let tasks = JSON.parse(localStorage.getItem("tasks") || "[]");

function saveTasks() {
    localStorage.setItem("tasks", JSON.stringify(tasks));
}

function renderTasks() {
    const list = document.getElementById("task-list");

    if (tasks.length === 0) {
        list.innerHTML = `
            <div class="card">
                <p>No tasks scheduled</p>
            </div>
        `;
        return;
    }

    list.innerHTML = tasks.map(task => `
        <div class="card task">
            <div>
                <strong>${task.name}</strong>
            </div>
            <button onclick="completeTask(${task.id})">
                Done
            </button>
        </div>
    `).join("");
}

function completeTask(id) {
    tasks = tasks.filter(task => task.id !== id);
    saveTasks();
    renderTasks();
}

document.getElementById("add-task").addEventListener("click", () => {
    tasks.push({
        id: Date.now(),
        name: "Test task"
    });

    saveTasks();
    renderTasks();
});

renderTasks();

const CLIENT_ID = "83999734852-n2f55is3a10tj1771grm8oeq2oltvj4p.apps.googleusercontent.com";

let tokenClient;

function setupGoogle() {
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: "https://www.googleapis.com/auth/calendar.readonly",

        callback: response => {
            if (response.error) {
                console.error(response);
                return;
            }

            loadCalendar(response.access_token);
        }
    });
}

document.getElementById("connect-google")
    .addEventListener("click", () => {
        tokenClient.requestAccessToken();
    });

async function loadCalendar(token) {
    const now = new Date().toISOString();

    const url =
        "https://www.googleapis.com/calendar/v3/calendars/primary/events" +
        "?singleEvents=true" +
        "&orderBy=startTime" +
        "&timeMin=" + encodeURIComponent(now) +
        "&maxResults=10";

    const response = await fetch(url, {
        headers: {
            Authorization: "Bearer " + token
        }
    });

    const data = await response.json();

    const container =
        document.getElementById("calendar-events");

    if (!data.items || data.items.length === 0) {
        container.innerHTML =
            '<div class="card"><p>No upcoming events</p></div>';
        return;
    }

    container.innerHTML = data.items.map(event => {
        const start = event.start.dateTime || event.start.date;

        const when = new Date(start).toLocaleString([], {
            weekday: "short",
            day: "numeric",
            month: "short",
            hour: event.start.dateTime ? "2-digit" : undefined,
            minute: event.start.dateTime ? "2-digit" : undefined
        });

        return `
            <div class="card">
                <strong>${event.summary || "Untitled event"}</strong>
                <p>${when}</p>
            </div>
        `;
    }).join("");
}

window.addEventListener("load", setupGoogle);
