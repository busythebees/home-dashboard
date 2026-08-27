const API =
    "https://home-dashboard-api.busythebees123.workers.dev";


// =========================
// CLOCK
// =========================

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


// =========================
// SESSION
// =========================

let session =
    localStorage.getItem("session");

if (location.hash.startsWith("#session=")) {
    session =
        decodeURIComponent(
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


// =========================
// TASK DATA
// =========================

let tasks = [];
let editingTaskId = null;
let calendarSettings = {};
let calendarData = [];


// =========================
// TASK API
// =========================

async function fetchTasks() {
    if (!session) {
        return [];
    }

    const response =
        await fetch(
            API + "/tasks",
            {
                headers: {
                    Authorization:
                        "Bearer " + session
                }
            }
        );

    if (!response.ok) {
        throw new Error(
            `Task load failed: ${response.status}`
        );
    }

    const data =
        await response.json();

    return data.tasks || [];
}


async function saveTasks() {
    if (!session) {
        return;
    }

    const response =
        await fetch(
            API + "/tasks",
            {
                method: "PUT",

                headers: {
                    Authorization:
                        "Bearer " + session,

                    "Content-Type":
                        "application/json"
                },

                body:
                    JSON.stringify({
                        tasks
                    })
            }
        );

    if (!response.ok) {
        throw new Error(
            `Task save failed: ${response.status}`
        );
    }
}


async function initialiseTasks() {
    try {
        tasks =
            await fetchTasks();

        renderTasks();

    } catch (error) {
        console.error(error);
        renderTasks();
    }
}


// =========================
// FORM REFERENCES
// =========================

const taskForm =
    document.getElementById("task-form");

const taskType =
    document.getElementById("task-type");

const recurringOptions =
    document.getElementById(
        "recurring-options"
    );

const taskFormTitle =
    document.getElementById(
        "task-form-title"
    );


// =========================
// FORM OPEN / CLOSE
// =========================

document.getElementById("show-add-task")
    .addEventListener("click", () => {
        openTaskForm();
    });


document.getElementById("cancel-task")
    .addEventListener("click", () => {
        closeTaskForm();
    });


taskType.addEventListener(
    "change",
    updateRecurringVisibility
);


function updateRecurringVisibility() {
    recurringOptions.hidden =
        taskType.value !== "recurring";
}


function openTaskForm(task = null) {
    taskForm.hidden = false;

    if (!task) {
        editingTaskId = null;

        taskFormTitle.textContent =
            "Add task";

        taskForm.reset();

        document.getElementById(
            "task-duration"
        ).value = 30;

        document.getElementById(
            "task-interval"
        ).value = 7;

        document.getElementById(
            "task-early"
        ).value = 1;

        document.getElementById(
            "task-late"
        ).value = 2;

        document.getElementById(
            "task-earliest-time"
        ).value = "09:00";

        document.getElementById(
            "task-latest-time"
        ).value = "20:00";

        document.getElementById(
            "task-effort"
        ).value = "medium";

        document.getElementById(
            "task-avoid-hangover"
        ).checked = true;

        updateRecurringVisibility();

    } else {
        editingTaskId = task.id;

        taskFormTitle.textContent =
            "Edit task";

        document.getElementById(
            "task-name"
        ).value = task.name || "";

        document.getElementById(
            "task-type"
        ).value =
            task.type || "one-off";

        document.getElementById(
            "task-duration"
        ).value =
            task.durationMinutes || 30;

        document.getElementById(
            "task-due"
        ).value =
            task.dueDate || "";

        document.getElementById(
            "task-interval"
        ).value =
            task.targetIntervalDays || 7;

        document.getElementById(
            "task-early"
        ).value =
            task.earlyDays ?? 1;

        document.getElementById(
            "task-late"
        ).value =
            task.lateDays ?? 2;

        document.getElementById(
            "task-flexibility"
        ).value =
            task.flexibility || "flexible";

        document.getElementById(
            "task-earliest-time"
        ).value =
            task.earliestTime || "09:00";

        document.getElementById(
            "task-latest-time"
        ).value =
            task.latestTime || "20:00";

        document.getElementById(
            "task-requires-home"
        ).checked =
            Boolean(task.requiresHome);

        document.getElementById(
            "task-effort"
        ).value =
            task.effort || "medium";

        document.getElementById(
            "task-avoid-hangover"
        ).checked =
            task.avoidHangover !== false;

        document.getElementById(
            "task-notes"
        ).value =
            task.notes || "";

        updateRecurringVisibility();
    }

    document.getElementById(
        "task-name"
    ).focus();
}


function closeTaskForm() {
    editingTaskId = null;
    taskForm.reset();
    recurringOptions.hidden = true;
    taskForm.hidden = true;
}


// =========================
// CREATE / EDIT TASK
// =========================

taskForm.addEventListener(
    "submit",
    async event => {
        event.preventDefault();

        const type =
            document.getElementById(
                "task-type"
            ).value;

        const existingTask =
            tasks.find(
                task =>
                    task.id === editingTaskId
            );

        const task = {
            id:
                existingTask?.id ||
                crypto.randomUUID(),

            name:
                document.getElementById(
                    "task-name"
                ).value.trim(),

            type,

            durationMinutes:
                Number(
                    document.getElementById(
                        "task-duration"
                    ).value
                ),

            dueDate:
                document.getElementById(
                    "task-due"
                ).value || null,

            flexibility:
                document.getElementById(
                    "task-flexibility"
                ).value,

            earliestTime:
                document.getElementById(
                    "task-earliest-time"
                ).value || null,

            latestTime:
                document.getElementById(
                    "task-latest-time"
                ).value || null,

            requiresHome:
                document.getElementById(
                    "task-requires-home"
                ).checked,

            effort:
                document.getElementById(
                    "task-effort"
                ).value,

            avoidHangover:
                document.getElementById(
                    "task-avoid-hangover"
                ).checked,

            notes:
                document.getElementById(
                    "task-notes"
                ).value.trim(),

            createdAt:
                existingTask?.createdAt ||
                new Date().toISOString(),

            completed:
                existingTask?.completed ||
                false,

            completedAt:
                existingTask?.completedAt ||
                null,

            lastCompleted:
                existingTask?.lastCompleted ||
                null
        };


        if (type === "recurring") {
            task.targetIntervalDays =
                Number(
                    document.getElementById(
                        "task-interval"
                    ).value
                );

            task.earlyDays =
                Number(
                    document.getElementById(
                        "task-early"
                    ).value
                );

            task.lateDays =
                Number(
                    document.getElementById(
                        "task-late"
                    ).value
                );
        }


        const oldTasks =
            [...tasks];


        if (existingTask) {
            tasks =
                tasks.map(item =>
                    item.id === task.id
                        ? task
                        : item
                );
        } else {
            tasks.push(task);
        }


        try {
            await saveTasks();
            renderTasks();
            closeTaskForm();

        } catch (error) {
            tasks = oldTasks;
            console.error(error);

            alert(
                "Task could not be saved."
            );
        }
    }
);


// =========================
// DATE HELPERS
// =========================

function dateOnly(date) {
    return new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate()
    );
}


function parseDateOnly(value) {
    const parts =
        value.split("-");

    return new Date(
        Number(parts[0]),
        Number(parts[1]) - 1,
        Number(parts[2])
    );
}


function formatDate(date) {
    return date.toLocaleDateString(
        [],
        {
            day: "numeric",
            month: "short"
        }
    );
}


// =========================
// RECURRING DATES
// =========================

function getRecurringDates(task) {
    if (!task.lastCompleted) {
        if (!task.dueDate) {
            return null;
        }

        const target =
            parseDateOnly(
                task.dueDate
            );

        const earliest =
            new Date(target);

        earliest.setDate(
            earliest.getDate() -
            (task.earlyDays || 0)
        );

        const latest =
            new Date(target);

        latest.setDate(
            latest.getDate() +
            (task.lateDays || 0)
        );

        return {
            earliest,
            target,
            latest
        };
    }


    const completed =
        dateOnly(
            new Date(
                task.lastCompleted
            )
        );

    const target =
        new Date(completed);

    target.setDate(
        target.getDate() +
        task.targetIntervalDays
    );

    const earliest =
        new Date(target);

    earliest.setDate(
        earliest.getDate() -
        (task.earlyDays || 0)
    );

    const latest =
        new Date(target);

    latest.setDate(
        latest.getDate() +
        (task.lateDays || 0)
    );

    return {
        earliest,
        target,
        latest
    };
}


// =========================
// ACTIVE / DORMANT
// =========================

function isTaskActive(task) {
    if (task.type === "one-off") {
        return !task.completed;
    }

    const dates =
        getRecurringDates(task);

    if (!dates) {
        return true;
    }

    const today =
        dateOnly(new Date());

    return today >= dates.earliest;
}


// =========================
// COMPLETE TASK
// =========================

async function completeTask(id) {
    const task =
        tasks.find(
            task => task.id === id
        );

    if (!task) {
        return;
    }

    const oldTasks =
        JSON.parse(
            JSON.stringify(tasks)
        );


    if (task.type === "recurring") {
        task.lastCompleted =
            new Date().toISOString();

        task.completed = false;

    } else {
        task.completed = true;

        task.completedAt =
            new Date().toISOString();
    }


    try {
        await saveTasks();
        renderTasks();

    } catch (error) {
        tasks = oldTasks;
        console.error(error);

        alert(
            "Completion could not be saved."
        );
    }
}


// =========================
// EDIT TASK
// =========================

function editTask(id) {
    const task =
        tasks.find(
            task => task.id === id
        );

    if (!task) {
        return;
    }

    openTaskForm(task);
}


// =========================
// DELETE TASK
// =========================

async function deleteTask(id) {
    const task =
        tasks.find(
            task => task.id === id
        );

    if (!task) {
        return;
    }

    const button =
        document.querySelector(
            `[data-delete-id="${CSS.escape(id)}"]`
        );

    if (!button) {
        return;
    }

    if (
        button.dataset.confirming !== "true"
    ) {
        button.dataset.confirming = "true";
        button.textContent = "Confirm delete";

        setTimeout(() => {
            if (
                button.dataset.confirming === "true"
            ) {
                button.dataset.confirming = "false";
                button.textContent = "×";
            }
        }, 5000);

        return;
    }

    const oldTasks = [...tasks];

    tasks =
        tasks.filter(
            task => task.id !== id
        );

    try {
        await saveTasks();
        renderTasks();

    } catch (error) {
        tasks = oldTasks;
        console.error(error);

        alert(
            "Task could not be deleted."
        );
    }
}


// =========================
// TASK STATUS
// =========================

function getTaskStatus(task) {
    if (task.type === "one-off") {
        if (task.completed) {
            return "Completed";
        }

        if (!task.dueDate) {
            return "No due date";
        }

        const today =
            dateOnly(new Date());

        const due =
            parseDateOnly(
                task.dueDate
            );

        const days =
            Math.round(
                (due - today) /
                86400000
            );

        if (days < 0) {
            return (
                `Overdue by ${Math.abs(days)} day` +
                (
                    Math.abs(days) === 1
                        ? ""
                        : "s"
                )
            );
        }

        if (days === 0) {
            return "Due today";
        }

        if (days === 1) {
            return "Due tomorrow";
        }

        return `Due in ${days} days`;
    }


    const dates =
        getRecurringDates(task);

    if (!dates) {
        return "Ready to schedule";
    }

    const today =
        dateOnly(new Date());

    if (today < dates.earliest) {
        return (
            "Returns " +
            formatDate(
                dates.earliest
            )
        );
    }

    if (today < dates.target) {
        return (
            "Available now · ideally " +
            formatDate(
                dates.target
            )
        );
    }

    if (
        today.getTime() ===
        dates.target.getTime()
    ) {
        return "Due today";
    }

    if (today <= dates.latest) {
        return (
            "Due · latest " +
            formatDate(
                dates.latest
            )
        );
    }

    return "Overdue";
}


// =========================
// TASK CARD
// =========================

function taskCard(
    task,
    dormant
) {
    const recurrence =
        task.type === "recurring"
            ? ` · Every ${task.targetIntervalDays} days`
            : "";

    const home =
        task.requiresHome
            ? " · Home required"
            : "";

    const actionButton =
        dormant
            ? ""
            : `
                <button
                    onclick="completeTask('${task.id}')"
                >
                    Done
                </button>
            `;

    return `
        <div
            class="card task ${
                dormant
                    ? "task-dormant"
                    : ""
            }"
        >

            <div class="task-details">

                <strong>
                    ${escapeHtml(task.name)}
                </strong>

                <div class="task-meta">
                    ${getTaskStatus(task)}
                    · ${task.durationMinutes} min
                    ${recurrence}
                    ${home}
                </div>

            </div>

            <div class="task-actions">

                ${actionButton}

                <button
                    onclick="editTask('${task.id}')"
                >
                    Edit
                </button>

                <button
                    data-delete-id="${task.id}"
                    onclick="deleteTask('${task.id}')"
                    aria-label="Delete task"
                >
                    ×
                </button>

            </div>

        </div>
    `;
}


// =========================
// RENDER TASKS
// =========================

function renderTasks() {
    const list =
        document.getElementById(
            "task-list"
        );

    const active =
        tasks.filter(
            task =>
                isTaskActive(task)
        );

    const dormant =
        tasks.filter(
            task =>
                !isTaskActive(task)
        );

    let html = "";


    if (active.length === 0) {
        html += `
            <div class="card">
                <p>
                    No tasks currently due
                </p>
            </div>
        `;

    } else {
        html +=
            active.map(
                task =>
                    taskCard(
                        task,
                        false
                    )
            ).join("");
    }


    if (dormant.length > 0) {
        html += `
            <details class="dormant-section">

                <summary>
                    Completed / dormant
                    (${dormant.length})
                </summary>

                <div class="dormant-list">

                    ${
                        dormant.map(
                            task =>
                                taskCard(
                                    task,
                                    true
                                )
                        ).join("")
                    }

                </div>

            </details>
        `;
    }


    list.innerHTML =
        html;
}


// =========================
// HTML SAFETY
// =========================

function escapeHtml(value) {
    const element =
        document.createElement(
            "div"
        );

    element.textContent =
        value ?? "";

    return element.innerHTML;
}

// =========================
// CALENDAR SETTINGS API
// =========================

async function fetchCalendarSettings() {

    if (!session) {
        return {};
    }

    const response =
        await fetch(
            API + "/calendar-settings",
            {
                headers: {
                    Authorization:
                        "Bearer " + session
                }
            }
        );

    if (!response.ok) {
        throw new Error(
            `Calendar settings load failed: ${response.status}`
        );
    }

    const data =
        await response.json();

    return data.settings || {};
}


async function saveCalendarSettings() {

    if (!session) {
        return;
    }

    const response =
        await fetch(
            API + "/calendar-settings",
            {
                method: "PUT",

                headers: {
                    Authorization:
                        "Bearer " + session,

                    "Content-Type":
                        "application/json"
                },

                body:
                    JSON.stringify({
                        settings: calendarSettings
                    })
            }
        );

    if (!response.ok) {
        throw new Error(
            `Calendar settings save failed: ${response.status}`
        );
    }
}


// =========================
// UNIQUE CALENDARS
// =========================

function getUniqueCalendars(events) {

    const calendars =
        new Map();

    for (const event of events) {

        if (!event.calendarId) {
            continue;
        }

        if (!calendars.has(event.calendarId)) {

            calendars.set(
                event.calendarId,
                {
                    id: event.calendarId,

                    name:
                        event.calendarName ||
                        "Calendar",

                    color:
                        event.calendarColor ||
                        "#777777"
                }
            );
        }
    }

    return Array.from(
        calendars.values()
    ).sort(
        (a, b) =>
            a.name.localeCompare(b.name)
    );
}


// =========================
// RENDER CALENDAR SETTINGS
// =========================

function renderCalendarSettings() {

    const container =
        document.getElementById(
            "calendar-settings"
        );

    if (!calendarData.length) {

        container.innerHTML = `
            <div class="card">
                <p>No calendars found.</p>
            </div>
        `;

        return;
    }


    container.innerHTML =
        calendarData.map(calendar => {

            const role =
                calendarSettings[
                    calendar.id
                ] || "fixed";

            return `
                <div class="card calendar-setting">

                    <span
                        class="calendar-setting-color"
                        style="
                            background:
                            ${calendar.color};
                        "
                    ></span>

                    <span class="calendar-setting-name">
                        ${escapeHtml(calendar.name)}
                    </span>

                    <select
                        data-calendar-id="${escapeHtml(calendar.id)}"
                        class="calendar-role"
                    >
                        <option
                            value="fixed"
                            ${role === "fixed" ? "selected" : ""}
                        >
                            Fixed
                        </option>

                        <option
                            value="flexible"
                            ${role === "flexible" ? "selected" : ""}
                        >
                            Flexible
                        </option>

                        <option
                            value="recordable"
                            ${role === "recordable" ? "selected" : ""}
                        >
                            Recordable
                        </option>

                        <option
                            value="ignore"
                            ${role === "ignore" ? "selected" : ""}
                        >
                            Ignore
                        </option>
                    </select>

                </div>
            `;

        }).join("");


    container
        .querySelectorAll(
            ".calendar-role"
        )
        .forEach(select => {

            select.addEventListener(
                "change",
                async event => {

                    const calendarId =
                        event.target.dataset.calendarId;

                    const previous =
                        calendarSettings[
                            calendarId
                        ] || "fixed";

                    calendarSettings[
                        calendarId
                    ] =
                        event.target.value;

                    try {

                        await saveCalendarSettings();

                    } catch (error) {

                        console.error(error);

                        calendarSettings[
                            calendarId
                        ] =
                            previous;

                        event.target.value =
                            previous;

                        alert(
                            "Calendar setting could not be saved."
                        );
                    }
                }
            );
        });
}

// =========================
// GOOGLE LOGIN
// =========================

document.getElementById(
    "connect-google"
).addEventListener(
    "click",
    () => {
        location.href =
            API + "/oauth/start";
    }
);


// =========================
// CALENDAR FORMATTING
// =========================

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


// =========================
// LOAD CALENDAR
// =========================

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
                            "Bearer " +
                            session
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

        calendarSettings =
            await fetchCalendarSettings();

        calendarData =
            getUniqueCalendars(
                data.items || []
            );

        renderCalendarSettings();

        if (!data.items?.length) {
            container.innerHTML = `
                <div class="card">
                    <p>
                        No upcoming events.
                    </p>
                </div>
            `;

            return;
        }

        container.innerHTML =
            data.items.map(
                event => {

                    const when =
                        formatEventTime(
                            event
                        );

                    const color =
                        event.calendarColor ||
                        "#777777";

                    const name =
                        event.calendarName ||
                        "Calendar";

                    return `
                        <div
                            class="card calendar-card"
                            style="
                                border-left:
                                6px solid ${color};
                            "
                        >

                            <strong>
                                ${
                                    escapeHtml(
                                        event.summary ||
                                        "Untitled event"
                                    )
                                }
                            </strong>

                            <p>
                                ${when}
                            </p>

                            <small
                                style="
                                    color:
                                    ${color};
                                "
                            >
                                ${
                                    escapeHtml(
                                        name
                                    )
                                }
                            </small>

                        </div>
                    `;
                }
            ).join("");
    }

    catch (error) {
        console.error(error);

        container.innerHTML = `
            <div class="card">
                <p>
                    Calendar failed to load:
                    ${escapeHtml(
                        error.message
                    )}
                </p>
            </div>
        `;
    }
}


// =========================
// START
// =========================

initialiseTasks();
loadCalendar();


// =========================
// SERVICE WORKER
// =========================

if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register(
        "service-worker.js"
    );
}
