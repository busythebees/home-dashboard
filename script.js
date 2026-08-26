// -------------------------
// CLOCK
// -------------------------

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


// -------------------------
// TASKS
// -------------------------

let tasks = JSON.parse(
    localStorage.getItem("tasks") || "[]"
);

function saveTasks() {
    localStorage.setItem(
        "tasks",
        JSON.stringify(tasks)
    );
}

function renderTasks() {
    const list =
        document.getElementById("task-list");

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
    tasks = tasks.filter(
        task => task.id !== id
    );

    saveTasks();
    renderTasks();
}

document.getElementById("add-task")
    .addEventListener("click", () => {

        tasks.push({
            id: Date.now(),
            name: "Test task"
        });

        saveTasks();
        renderTasks();
    });

renderTasks();


// -------------------------
// BACKEND
// -------------------------

const API =
    "https://home-dashboard-api.busythebees123.workers.dev";


// -------------------------
// SESSION
// -------------------------

let session =
    localStorage.getItem("session");

if (location.hash.startsWith("#session=")) {

    session = decodeURIComponent(
        location.hash.substring(9)
    );

    localStorage.setItem(
        "session",
        session
    );

    history.replaceState(
        null,
        "",
        location.pathname
    );
}


// -------------------------
// GOOGLE CALENDAR LOGIN
// -------------------------

document.getElementById("connect-google")
    .addEventListener("click", () => {

        location.href =
            API + "/oauth/start";
    });


// -------------------------
// FORMAT CALENDAR EVENT TIME
// -------------------------

function formatEventTime(event) {

    const start =
        event.start.dateTime ||
        event.start.date;

    if (event.start.dateTime) {

        return new Date(start)
            .toLocaleString(
                [],
                {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit"
                }
            );
    }

    const parts =
        start.split("-");

    const localDate =
        new Date(
            Number(parts[0]),
            Number(parts[1]) - 1,
            Number(parts[2])
        );

    return (
        localDate.toLocaleDateString(
            [],
            {
                weekday: "short",
                day: "numeric",
                month: "short"
            }
        ) +
        " · All day"
    );
}


// -------------------------
// LOAD GOOGLE CALENDAR
// -------------------------

async function loadCalendar() {

    if (!session) {
        return;
    }

    const container =
        document.getElementById(
            "calendar-events"
        );

    container.innerHTML = `
        <div class="card">
            <p>Loading calendar...</p>
        </div>
    `;

    try {

        const response =
            await fetch(
                API + "/calendar",
                {
                    headers: {
                        Authorization:
                            "Bearer " + session
                    }
                }
            );

        if (!response.ok) {

            container.innerHTML = `
                <div class="card">
                    <p>
                        Calendar error:
                        ${response.status}
                    </p>
                </div>
            `;

            return;
        }

        const data =
            await response.json();

        if (!data.items?.length) {

            container.innerHTML = `
                <div class="card">
                    <p>No upcoming events.</p>
                </div>
            `;

            return;
        }

        container.innerHTML =
            data.items.map(event => {

                const when =
                    formatEventTime(event);

                const calendarColor =
                    event.calendarColor ||
                    "#777777";

                const calendarName =
                    event.calendarName ||
                    "Calendar";

                return `
                    <div
                        class="card calendar-card"
                        style="
                            border-left:
                                6px solid ${calendarColor};
                        "
                    >
                        <strong>
                            ${event.summary ||
                              "Untitled event"}
                        </strong>

                        <p>${when}</p>

                        <small
                            style="
                                color:
                                    ${calendarColor};
                            "
                        >
                            ${calendarName}
                        </small>
                    </div>
                `;

            }).join("");
    }

    catch (error) {

        console.error(error);

        container.innerHTML = `
            <div class="card">
                <p>
                    Calendar failed to load:
                    ${error.message}
                </p>
            </div>
        `;
    }
}


// Automatically load Calendar if already authenticated
loadCalendar();


// -------------------------
// SERVICE WORKER
// -------------------------

if ("serviceWorker" in navigator) {

    navigator.serviceWorker.register(
        "service-worker.js"
    );
}
