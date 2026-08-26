// =========================
// CONFIG
// =========================

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


// =========================
// TASK DATA
// =========================

let tasks = [];


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


// =========================
// MIGRATE OLD LOCAL TASKS
// =========================

async function initialiseTasks() {

    try {

        const remoteTasks =
            await fetchTasks();

        if (remoteTasks.length > 0) {

            tasks = remoteTasks;

        } else {

            const localTasks =
                JSON.parse(
                    localStorage.getItem(
                        "tasks-v2"
                    ) || "[]"
                );

            if (localTasks.length > 0) {

                tasks = localTasks;

                await saveTasks();

                localStorage.removeItem(
                    "tasks-v2"
                );

            } else {

                tasks = [];
            }
        }

        renderTasks();

    } catch (error) {

        console.error(error);

        // Temporary fallback if Worker cannot be reached
        tasks =
            JSON.parse(
                localStorage.getItem(
                    "tasks-v2"
                ) || "[]"
            );

        renderTasks();
    }
}


// =========================
// TASK FORM
// =========================

const taskForm =
    document.getElementById("task-form");

const taskType =
    document.getElementById("task-type");

const recurringOptions =
    document.getElementById(
        "recurring-options"
    );


document.getElementById("show-add-task")
    .addEventListener("click", () => {

        taskForm.hidden = false;

        document.getElementById(
            "task-name"
        ).focus();
    });


document.getElementById("cancel-task")
    .addEventListener("click", () => {

        taskForm.reset();

        recurringOptions.hidden = true;

        taskForm.hidden = true;
    });


taskType.addEventListener(
    "change",
    () => {

        recurringOptions.hidden =
            taskType.value !== "recurring";
    }
);


// =========================
// CREATE TASK
// =========================

taskForm.addEventListener(
    "submit",
    async event => {

        event.preventDefault();

        const type =
            document.getElementById(
                "task-type"
            ).value;

        const task = {

            id:
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

            notes:
                document.getElementById(
                    "task-notes"
                ).value.trim(),

            createdAt:
                new Date().toISOString(),

            completed:
                false,

            lastCompleted:
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


        tasks.push(task);

        try {

            await saveTasks();

            renderTasks();

            taskForm.reset();

            recurringOptions.hidden = true;

            taskForm.hidden = true;

        } catch (error) {

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
// RECURRING TASK DATES
// =========================

function getRecurringDates(task) {

    if (!task.lastCompleted) {

        if (!task.dueDate) {
            return null;
        }

        const target =
            parseDateOnly(task.dueDate);

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
        new Date(task.lastCompleted);

    const target =
        dateOnly(completed);

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

    // Recurring task with no starting date
    // remains actionable.
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

        console.error(error);

        alert(
            "Completion could not be saved."
        );
    }
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


    if (
        !confirm(
            `Delete "${task.name}"?`
        )
    ) {
        return;
    }


    const oldTasks =
        [...tasks];

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

    if (
        task.type === "one-off"
    ) {

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
            return `Overdue by ${Math.abs(days)} day${
                Math.abs(days) === 1
                    ? ""
                    : "s"
            }`;
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

function taskCard(task, dormant) {

    const recurrence =
        task.type === "recurring"
            ? ` · Every ${task.targetIntervalDays} days`
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
        <div class="card task ${
            dormant
                ? "task-dormant"
                : ""
        }">

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

            <div class="task-actions">

                ${actionButton}

                <button
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
            <details
                class="dormant-section"
            >

                <summary>
                    Completed / dormant
                    (${dormant.length})
                </summary>

                <div
                    class="dormant-list"
                >

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


    list.innerHTML = html;
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
// CALENDAR DATE FORMATTING
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
// GOOGLE CALENDAR
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
