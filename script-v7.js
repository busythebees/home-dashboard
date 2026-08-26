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
// TASK STORAGE
// -------------------------

let tasks = JSON.parse(
    localStorage.getItem("tasks-v2") || "[]"
);

function saveTasks() {
    localStorage.setItem(
        "tasks-v2",
        JSON.stringify(tasks)
    );
}


// -------------------------
// TASK FORM
// -------------------------

const taskForm =
    document.getElementById("task-form");

const taskType =
    document.getElementById("task-type");

const recurringOptions =
    document.getElementById("recurring-options");

document.getElementById("show-add-task")
    .addEventListener("click", () => {
        taskForm.hidden = false;
        document.getElementById("task-name").focus();
    });

document.getElementById("cancel-task")
    .addEventListener("click", () => {
        taskForm.reset();
        recurringOptions.hidden = true;
        taskForm.hidden = true;
    });

taskType.addEventListener("change", () => {
    recurringOptions.hidden =
        taskType.value !== "recurring";
});


// -------------------------
// CREATE TASK
// -------------------------

taskForm.addEventListener("submit", event => {
    event.preventDefault();

    const type =
        document.getElementById("task-type").value;

    const task = {
        id: crypto.randomUUID(),

        name:
            document.getElementById("task-name")
                .value.trim(),

        type,

        durationMinutes:
            Number(
                document.getElementById("task-duration")
                    .value
            ),

        dueDate:
            document.getElementById("task-due")
                .value || null,

        flexibility:
            document.getElementById("task-flexibility")
                .value,

        notes:
            document.getElementById("task-notes")
                .value.trim(),

        createdAt:
            new Date().toISOString(),

        completed: false,
        lastCompleted: null
    };

    if (type === "recurring") {
        task.targetIntervalDays =
            Number(
                document.getElementById("task-interval")
                    .value
            );

        task.earlyDays =
            Number(
                document.getElementById("task-early")
                    .value
            );

        task.lateDays =
            Number(
                document.getElementById("task-late")
                    .value
            );
    }

    tasks.push(task);

    saveTasks();
    renderTasks();

    taskForm.reset();
    recurringOptions.hidden = true;
    taskForm.hidden = true;
});


// -------------------------
// COMPLETE TASK
// -------------------------

function completeTask(id) {
    const task =
        tasks.find(task => task.id === id);

    if (!task) {
        return;
    }

    if (task.type === "recurring") {

        task.lastCompleted =
            new Date().toISOString();

        task.dueDate =
            calculateNextDueDate(task);

    } else {

        task.completed = true;
    }

    saveTasks();
    renderTasks();
}


// -------------------------
// NEXT RECURRING DATE
// -------------------------

function calculateNextDueDate(task) {

    if (!task.lastCompleted) {
        return task.dueDate;
    }

    const date =
        new Date(task.lastCompleted);

    date.setDate(
        date.getDate() +
        task.targetIntervalDays
    );

    return date.toISOString().split("T")[0];
}


// -------------------------
// DELETE TASK
// -------------------------

function deleteTask(id) {

    const task =
        tasks.find(task => task.id === id);

    if (!task) {
        return;
    }

    if (!confirm(`Delete "${task.name}"?`)) {
        return;
    }

    tasks =
        tasks.filter(task => task.id !== id);

    saveTasks();
    renderTasks();
}


// -------------------------
// TASK STATUS
// -------------------------

function getTaskStatus(task) {

    if (task.completed) {
        return "Completed";
    }

    if (!task.dueDate) {
        return "No due date";
    }

    const today =
        new Date();

    today.setHours(0, 0, 0, 0);

    const due =
        new Date(
            task.dueDate + "T00:00:00"
        );

    const difference =
        Math.round(
            (due - today) /
            86400000
        );

    if (difference < 0) {
        return `Overdue by ${Math.abs(difference)} day${
            Math.abs(difference) === 1 ? "" : "s"
        }`;
    }

    if (difference === 0) {
        return "Due today";
    }

    if (difference === 1) {
        return "Due tomorrow";
    }

    return `Due in ${difference} days`;
}


// -------------------------
// RENDER TASKS
// -------------------------

function renderTasks() {

    const list =
        document.getElementById("task-list");

    const activeTasks =
        tasks.filter(task => !task.completed);

    if (activeTasks.length === 0) {

        list.innerHTML = `
            <div class="card">
                <p>No tasks</p>
            </div>
        `;

        return;
    }

    list.innerHTML =
        activeTasks.map(task => {

            const recurrence =
                task.type === "recurring"
                    ? ` · Every ${task.targetIntervalDays} days`
                    : "";

            return `
                <div class="card task">

                    <div class="task-details">

                        <strong>
                            ${escapeHtml(task.name)}
                        </strong>

                        <div class="task-meta">
                            ${getTaskStatus(task)}
                            · ${task.durationMinutes} min
                            ${recurrence}
                        </div>

                    </div>

                    <div>
                        <button
                            onclick="completeTask('${task.id}')"
                        >
                            Done
                        </button>

                        <button
                            onclick="deleteTask('${task.id}')"
                            aria-label="Delete task"
                        >
                            ×
                        </button>
                    </div>

                </div>
            `;

        }).join("");
}


// -------------------------
// HTML SAFETY
// -------------------------

function escapeHtml(value) {

    const element =
        document.createElement("div");

    element.textContent = value;

    return element.innerHTML;
}


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
// FORMAT CALENDAR EVENT
// -------------------------

function formatEventTime(event) {

    const start =
        event.start.dateTime ||
        event.start.date;

    if (event.start.dateTime) {

        return new Date(start)
            .toLocaleString([], {
                weekday: "short",
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit"
            });
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
        localDate.toLocaleDateString([], {
            weekday: "short",
            day: "numeric",
            month: "short"
        }) +
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
                            ${escapeHtml(
                                event.summary ||
                                "Untitled event"
                            )}
                        </strong>

                        <p>${when}</p>

                        <small
                            style="
                                color:
                                    ${calendarColor};
                            "
                        >
                            ${escapeHtml(calendarName)}
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
                    ${escapeHtml(error.message)}
                </p>
            </div>
        `;
    }
}


loadCalendar();


// -------------------------
// SERVICE WORKER
// -------------------------

if ("serviceWorker" in navigator) {

    navigator.serviceWorker.register(
        "service-worker.js"
    );
}
