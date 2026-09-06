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
let laundryMachineState = {
    status: "available",
    busyUntil: null
};

let calendarSettings = {};
let calendarData = [];
let calendarEvents = [];

let upcomingDaysShown = 2;


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
// LAUNDRY MACHINE API
// =========================

async function fetchLaundryMachineState() {

    if (!session) {
        return;
    }

    const response =
        await fetch(
            API + "/laundry-machine-state?_=" +
                Date.now(),
            {
                cache: "no-store",

                headers: {
                    Authorization:
                        "Bearer " + session
                }
            }
        );

    if (!response.ok) {
        throw new Error(
            "Laundry machine state load failed: " +
            response.status
        );
    }

    const data =
        await response.json();

    laundryMachineState =
        data.state || {
            status: "available",
            busyUntil: null
        };
}


async function saveLaundryMachineState(
    status,
    busyUntil = null
) {

    const response =
        await fetch(
            API + "/laundry-machine-state",
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
                        status,
                        busyUntil
                    })
            }
        );

    if (!response.ok) {

        throw new Error(
            "Laundry machine state save failed: " +
            response.status
        );
    }

    const data =
        await response.json();

    laundryMachineState =
        data.state || {
            status,
            busyUntil
        };

    renderTasks();
}


async function initialiseTasks() {
    try {

        tasks =
            await fetchTasks();

        await fetchLaundryMachineState();

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

const taskSpecialType =
    document.getElementById(
        "task-special-type"
    );

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

const taskFlexibility =
    document.getElementById(
        "task-flexibility"
    );

taskFlexibility.addEventListener(
    "change",
    updateSchedulingVisibility
);

const taskEffort =
    document.getElementById(
        "task-effort"
    );

taskEffort.addEventListener(
    "change",
    updateBatchableVisibility
);


function updateBatchableVisibility() {

    const isLow =
        taskEffort.value === "low";

    document.getElementById(
        "task-batchable-option"
    ).hidden = !isLow;

    if (!isLow) {
        document.getElementById(
            "task-batchable"
        ).checked = false;
    }
}

function updateRecurringVisibility() {
    recurringOptions.hidden =
        taskType.value !== "recurring";
}

function updateSchedulingVisibility() {

    const isFixed =
        taskFlexibility.value === "fixed";

    document.getElementById(
        "task-flexible-options"
    ).hidden = isFixed;

    document.getElementById(
        "task-fixed-options"
    ).hidden = !isFixed;

    document.getElementById(
        "task-due-option"
    ).hidden = isFixed;
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
            "task-batchable"
        ).checked = false;

        document.getElementById(
            "task-avoid-hangover"
        ).checked = true;

        taskSpecialType.value = "";
        
        updateRecurringVisibility();
        updateSchedulingVisibility();
        updateBatchableVisibility();

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

        taskSpecialType.value =
            task.specialType === "washing"
                ? "clothes-washing"
                : (task.specialType || "");

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
            "task-batchable"
        ).checked =
            task.batchable === true;

        document.getElementById(
            "task-avoid-hangover"
        ).checked =
            task.avoidHangover !== false;

        document.getElementById(
            "task-notes"
        ).value =
            task.notes || "";

        document.getElementById(
            "task-fixed-date"
        ).value =
            task.fixedDate || "";

        document.getElementById(
            "task-fixed-start-time"
        ).value =
            task.fixedStartTime || "";

        updateRecurringVisibility();
        updateSchedulingVisibility();
        updateBatchableVisibility();
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

    renderTasks();
}


// =========================
// CREATE / EDIT TASK
// =========================

taskForm.addEventListener(
    "submit",
    async event => {
        event.preventDefault();

        const flexibility =
            document.getElementById(
                "task-flexibility"
            ).value;

        if (flexibility === "fixed") {

            const fixedDate =
                document.getElementById(
                    "task-fixed-date"
                ).value;

            const fixedStartTime =
                document.getElementById(
                    "task-fixed-start-time"
                ).value;

            if (!fixedDate || !fixedStartTime) {
                alert(
                    "Fixed tasks need a date and start time."
                );

                return;
            }
        }

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

            specialType:
                taskSpecialType.value || null,

            laundryState:
                existingTask?.laundryState ||
                null,

            laundryStartedAt:
                existingTask?.laundryStartedAt ||
                null,

            durationMinutes:
                Number(
                    document.getElementById(
                        "task-duration"
                    ).value
                ),

            dueDate:
                flexibility === "fixed"
                    ? null
                    : document.getElementById(
                        "task-due"
                    ).value || null,

            flexibility:
                document.getElementById(
                    "task-flexibility"
                ).value,

            fixedDate:
                document.getElementById(
                    "task-fixed-date"
                ).value || null,

            fixedStartTime:
                document.getElementById(
                    "task-fixed-start-time"
                ).value || null,

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

            batchable:
                document.getElementById(
                    "task-effort"
                ).value === "low" &&
                document.getElementById(
                    "task-batchable"
                ).checked,

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

        const initialDate =
            task.flexibility === "fixed"
                ? task.fixedDate
                : task.dueDate;

        if (!initialDate) {
            return null;
        }

        const target =
            parseDateOnly(
                initialDate
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

function isUpcomingRecurringTask(task) {

    if (task.type !== "recurring") {
        return false;
    }

    const dates =
        getRecurringDates(task);

    if (!dates) {
        return false;
    }

    const today =
        dateOnly(new Date());

    return today < dates.earliest;
}


function isCompletedOneOffTask(task) {

    return (
        task.type === "one-off" &&
        task.completed
    );
}

// =========================
// LAUNDRY START
// =========================

function isLaundryTask(task) {
    return (
        task?.specialType === "washing" ||
        task?.specialType === "clothes-washing" ||
        task?.specialType === "bedding-washing"
    );
}


async function startLaundryTask(id) {

    const task =
        tasks.find(
            task => task.id === id
        );

    if (
        !task ||
        !isLaundryTask(task)
    ) {
        return;
    }


    /*
    * Once laundry has physically
    * started, record that fact.
    *
    * This does NOT complete the task
    * and does NOT advance recurrence.
    */
    const oldTasks =
        JSON.parse(
            JSON.stringify(tasks)
        );


    task.laundryState =
        "in-progress";

    task.laundryStartedAt =
        new Date().toISOString();


    try {

        await saveTasks();

        renderTasks();

    } catch (error) {

        tasks = oldTasks;

        console.error(error);

        alert(
            "Laundry start could not be saved."
        );
    }
}

// =========================
// EXTERNAL MACHINE BUSY
// =========================

function openLaundryMachineDialog() {

    document
        .getElementById(
            "laundry-machine-dialog"
        )
        .showModal();
}


function closeLaundryMachineDialog() {

    document
        .getElementById(
            "laundry-machine-dialog"
        )
        .close();
}


async function markLaundryMachineBusy(
    minutes
) {

    const busyUntil =
        new Date(
            Date.now() +
            minutes * 60 * 1000
        ).toISOString();

    closeLaundryMachineDialog();

    try {

        await saveLaundryMachineState(
            "busy-until",
            busyUntil
        );

    } catch (error) {

        console.error(error);

        alert(
            "Machine state could not be saved."
        );
    }
}


async function markLaundryMachineAvailable() {

    try {

        await saveLaundryMachineState(
            "available",
            null
        );

    } catch (error) {

        console.error(error);

        alert(
            "Machine state could not be saved."
        );
    }
}


document
    .querySelectorAll(
        "[data-laundry-busy-minutes]"
    )
    .forEach(button => {

        button.addEventListener(
            "click",
            () => {

                markLaundryMachineBusy(
                    Number(
                        button.dataset
                            .laundryBusyMinutes
                    )
                );
            }
        );
    });


document
    .getElementById(
        "laundry-machine-cancel"
    )
    .addEventListener(
        "click",
        closeLaundryMachineDialog
    );


document
    .getElementById(
        "laundry-machine-dialog"
    )
    .addEventListener(
        "cancel",
        event => {

            event.preventDefault();

            closeLaundryMachineDialog();
        }
    );

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

    if (isLaundryTask(task)) {
        task.laundryState = null;
        task.laundryStartedAt = null;
    }

    if (task.type === "recurring") {

        task.previousLastCompleted =
            task.lastCompleted || null;

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
// UNDO COMPLETION
// =========================

async function undoCompleteTask(id) {

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
            task.previousLastCompleted || null;

        task.previousLastCompleted = null;

    } else {

        task.completed = false;
        task.completedAt = null;
    }

    try {

        await saveTasks();
        renderTasks();

    } catch (error) {

        tasks = oldTasks;

        console.error(error);

        alert(
            "Task could not be restored."
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
    renderTasks();
}


// =========================
// DELETE TASK
// =========================

let pendingDeleteTaskId = null;


function requestDeleteTask(id) {

    const task =
        tasks.find(
            task => task.id === id
        );

    if (!task) {
        return;
    }

    pendingDeleteTaskId = id;

    const dialog =
        document.getElementById(
            "confirm-dialog"
        );

    const title =
        document.getElementById(
            "confirm-dialog-title"
        );

    const message =
        document.getElementById(
            "confirm-dialog-message"
        );

    const confirmButton =
        document.getElementById(
            "confirm-dialog-confirm"
        );

    title.textContent =
        "Delete task?";

    message.textContent =
        `Are you sure you want to delete “${task.name}”?`;

    confirmButton.textContent =
        "Delete";

    dialog.showModal();
}


function cancelDeleteTask() {

    pendingDeleteTaskId = null;

    document
        .getElementById(
            "confirm-dialog"
        )
        .close();
}


async function confirmDeleteTask() {

    if (!pendingDeleteTaskId) {
        return;
    }

    const id =
        pendingDeleteTaskId;

    const oldTasks =
        JSON.parse(
            JSON.stringify(tasks)
        );

    tasks =
        tasks.filter(
            task => task.id !== id
        );

    pendingDeleteTaskId = null;

    document
        .getElementById(
            "confirm-dialog"
        )
        .close();

    try {

        await saveTasks();
        renderTasks();

    } catch (error) {

        tasks = oldTasks;

        console.error(error);

        renderTasks();

        alert(
            "Task could not be deleted."
        );
    }
}

document
    .getElementById(
        "confirm-dialog-cancel"
    )
    .addEventListener(
        "click",
        cancelDeleteTask
    );


document
    .getElementById(
        "confirm-dialog-confirm"
    )
    .addEventListener(
        "click",
        confirmDeleteTask
    );


document
    .getElementById(
        "confirm-dialog"
    )
    .addEventListener(
        "cancel",
        event => {

            event.preventDefault();

            cancelDeleteTask();
        }
    );


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

    const machineBusy =
        isLaundryTask(task) &&
        task.laundryState !== "in-progress" &&
        laundryMachineState.status ===
            "busy-until";

    let actionButton = "";

    if (isCompletedOneOffTask(task)) {

        actionButton = `
            <button
                onclick="undoCompleteTask('${task.id}')"
            >
                Undo
            </button>
        `;

    } else if (
        !isUpcomingRecurringTask(task)
    ) {

        if (
            isLaundryTask(task) &&
            task.laundryState ===
                "in-progress"
        ) {

            actionButton = `
                <button
                    onclick="completeTask('${task.id}')"
                >
                    Complete laundry
                </button>
            `;

        } else if (
            isLaundryTask(task)
        ) {

            actionButton = `
                ${
                    machineBusy
                        ? `
                            <button
                                onclick="markLaundryMachineAvailable()"
                            >
                                Machine available
                            </button>
                        `
                        : `
                            <button
                                onclick="startLaundryTask('${task.id}')"
                            >
                                Start laundry
                            </button>
                        `
                }
            `;

        } else {

            actionButton = `
                <button
                    onclick="completeTask('${task.id}')"
                >
                    Done
                </button>
            `;
        }
    }

    return `
        <div
            class="card task ${
                dormant
                    ? "task-dormant"
                    : ""
            } ${
                machineBusy
                    ? "task-machine-busy"
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

                ${
                    machineBusy
                        ? `
                            <div class="task-machine-busy-label">
                                Machine busy
                            </div>
                        `
                        : ""
                }

            </div>

            <div class="task-actions">

                ${actionButton}

                <details
                    class="task-action-menu"
                >
                    <summary
                        aria-label="More actions"
                        title="More actions"
                    >
                        ⋯
                    </summary>

                    <div
                        class="task-action-menu-items"
                    >

                        ${
                            (
                                task.type === "recurring" &&
                                isUpcomingRecurringTask(task) &&
                                task.lastCompleted
                            )
                                ? `
                                    <button
                                        onclick="
                                            this.closest('details').removeAttribute('open');
                                            undoCompleteTask('${task.id}');
                                        "
                                    >
                                        <svg
                                            class="task-action-icon"
                                            viewBox="0 0 24 24"
                                            aria-hidden="true"
                                        >
                                            <path
                                                d="M9 7 4 12l5 5"
                                                fill="none"
                                                stroke="currentColor"
                                                stroke-width="2"
                                                stroke-linecap="round"
                                                stroke-linejoin="round"
                                            />

                                            <path
                                                d="M5 12h8a6 6 0 0 1 6 6"
                                                fill="none"
                                                stroke="currentColor"
                                                stroke-width="2"
                                                stroke-linecap="round"
                                            />
                                        </svg>

                                        <span>
                                            Undo completion
                                        </span>
                                    </button>
                                `
                                : ""
                        }

                        ${
                            (
                                isLaundryTask(task) &&
                                task.laundryState !== "in-progress"
                            )
                                ? (
                                    laundryMachineState.status !==
                                        "busy-until"
                                        ? `
                                            <button
                                                onclick="
                                                    this.closest('details').removeAttribute('open');
                                                    openLaundryMachineDialog();
                                                "
                                            >
                                                <svg
                                                    class="task-action-icon"
                                                    viewBox="0 0 24 24"
                                                    aria-hidden="true"
                                                >
                                                    <circle
                                                        cx="12"
                                                        cy="12"
                                                        r="9"
                                                        fill="none"
                                                        stroke="currentColor"
                                                        stroke-width="2"
                                                    />

                                                    <path
                                                        d="M12 7v5l3 2"
                                                        fill="none"
                                                        stroke="currentColor"
                                                        stroke-width="2"
                                                        stroke-linecap="round"
                                                        stroke-linejoin="round"
                                                    />
                                                </svg>

                                                <span>
                                                    Machine busy…
                                                </span>
                                            </button>
                                        `
                                        : ""
                                )
                                : ""
                        }
                    
                        <button
                            onclick="
                                this.closest('details').removeAttribute('open');
                                editTask('${task.id}');
                            "
                        >
                            <svg
                                class="task-action-icon"
                                viewBox="0 0 24 24"
                                aria-hidden="true"
                            >
                                <path
                                    d="M12 20h9"
                                    fill="none"
                                    stroke="currentColor"
                                    stroke-width="2"
                                    stroke-linecap="round"
                                />
                                <path
                                    d="M16.5 3.5a2.121 2.121 0 0 1 3 3L8 18l-4 1 1-4Z"
                                    fill="none"
                                    stroke="currentColor"
                                    stroke-width="2"
                                    stroke-linejoin="round"
                                />
                            </svg>

                            <span>Edit</span>
                        </button>

                        <button
                            onclick="
                                this.closest('details').removeAttribute('open');
                                requestDeleteTask('${task.id}');
                            "
                            class="task-delete-action"
                        >
                            <svg
                                class="task-action-icon"
                                viewBox="0 0 24 24"
                                aria-hidden="true"
                            >
                                <path
                                    d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 10v6M14 10v6"
                                    fill="none"
                                    stroke="currentColor"
                                    stroke-width="2"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                />
                            </svg>

                            <span>Delete</span>
                        </button>
                    </div>

                </details>

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
                isTaskActive(task) &&
                task.id !== editingTaskId
        );

    const upcomingRecurring =
        tasks.filter(
            task =>
                isUpcomingRecurringTask(task) &&
                task.id !== editingTaskId
        );

    const completed =
        tasks.filter(
            task =>
                isCompletedOneOffTask(task) &&
                task.id !== editingTaskId
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


    if (upcomingRecurring.length > 0) {

        html += `
            <details class="dormant-section">

                <summary>
                    Upcoming recurring
                    (${upcomingRecurring.length})
                </summary>

                <div class="dormant-list">

                    ${
                        upcomingRecurring.map(
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


    if (completed.length > 0) {

        html += `
            <details class="dormant-section">

                <summary>
                    Completed
                    (${completed.length})
                </summary>

                <div class="dormant-list">

                    ${
                        completed.map(
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

            const setting =
                calendarSettings[calendar.id];

            const role =
                typeof setting === "object"
                    ? setting.role || "fixed"
                    : setting || "fixed";

            const type =
                typeof setting === "object"
                    ? setting.type || "general"
                    : "general";

            const displaceable =
                typeof setting === "object" &&
                setting.displaceable === true;

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

                    <select
                        data-calendar-id="${escapeHtml(calendar.id)}"
                        class="calendar-type"
                    >
                        <option
                            value="general"
                            ${type === "general" ? "selected" : ""}
                        >
                            General
                        </option>

                        <option
                            value="lecture"
                            ${type === "lecture" ? "selected" : ""}
                        >
                            Lecture / Uni
                        </option>

                        <option
                            value="home"
                            ${type === "home" ? "selected" : ""}
                        >
                            Home
                        </option>

                        <option
                            value="online"
                            ${type === "online" ? "selected" : ""}
                        >
                            Online
                        </option>

                        <option
                            value="away"
                            ${type === "away" ? "selected" : ""}
                        >
                            Away
                        </option>
                    </select>

                    <label
                        class="calendar-displaceable-option"
                        ${role !== "fixed" ? "hidden" : ""}
                    >
                        <input
                            type="checkbox"
                            class="calendar-displaceable"
                            data-calendar-id="${escapeHtml(calendar.id)}"
                            ${displaceable ? "checked" : ""}
                        >

                        Scheduler may skip events
                    </label>

                </div>
            `;                    

        }).join("");


    container
        .querySelectorAll(".calendar-role")
        .forEach(select => {

            select.addEventListener(
                "change",
                async event => {

                    const calendarId =
                        event.target.dataset.calendarId;

                    const oldSettings =
                        JSON.parse(
                            JSON.stringify(calendarSettings)
                        );

                    const existing =
                        calendarSettings[calendarId];

                    const currentType =
                        typeof existing === "object"
                            ? existing.type || "general"
                            : "general";

                    const currentDisplaceable =
                        typeof existing === "object" &&
                        existing.displaceable === true;

                    calendarSettings[calendarId] = {
                        role: event.target.value,
                        type: currentType,
                        displaceable:
                            event.target.value === "fixed"
                                ? currentDisplaceable
                                : false
                    };

                    try {

                        await saveCalendarSettings();

                        renderCalendarSettings();
                        renderCalendarViews();

                    } catch (error) {

                        calendarSettings =
                            oldSettings;

                        console.error(error);

                        renderCalendarSettings();
                        renderCalendarViews();
                        

                        alert(
                            "Calendar setting could not be saved."
                        );
                    }
                }
            );
        });

    container
        .querySelectorAll(".calendar-type")
        .forEach(select => {

            select.addEventListener(
                "change",
                async event => {

                    const calendarId =
                        event.target.dataset.calendarId;

                    const oldSettings =
                        JSON.parse(
                            JSON.stringify(calendarSettings)
                        );

                    const existing =
                        calendarSettings[calendarId];

                    const currentRole =
                        typeof existing === "object"
                            ? existing.role || "fixed"
                            : existing || "fixed";

                    const currentDisplaceable =
                        typeof existing === "object" &&
                        existing.displaceable === true;

                    calendarSettings[calendarId] = {
                        role: currentRole,
                        type: event.target.value,
                        displaceable:
                            currentRole === "fixed"
                                ? currentDisplaceable
                                : false
                    };

                    try {

                        await saveCalendarSettings();

                    } catch (error) {

                        calendarSettings =
                            oldSettings;

                        console.error(error);

                        renderCalendarSettings();

                        alert(
                            "Calendar setting could not be saved."
                        );
                    }
                }
            );
        });
    container
        .querySelectorAll(
            ".calendar-displaceable"
        )
        .forEach(checkbox => {

            checkbox.addEventListener(
                "change",
                async event => {

                    const calendarId =
                        event.target.dataset.calendarId;

                    const oldSettings =
                        JSON.parse(
                            JSON.stringify(
                                calendarSettings
                            )
                        );

                    const existing =
                        calendarSettings[calendarId];

                    const currentRole =
                        typeof existing === "object"
                            ? existing.role || "fixed"
                            : existing || "fixed";

                    const currentType =
                        typeof existing === "object"
                            ? existing.type || "general"
                            : "general";

                    calendarSettings[calendarId] = {
                        role: currentRole,
                        type: currentType,
                        displaceable:
                            currentRole === "fixed" &&
                            event.target.checked
                    };

                    try {

                        await saveCalendarSettings();

                    } catch (error) {

                        calendarSettings =
                            oldSettings;

                        console.error(error);

                        renderCalendarSettings();

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
// CALENDAR DISPLAY HELPERS
// =========================

function getCalendarRole(calendarId) {

    const setting =
        calendarSettings[calendarId];

    if (
        setting &&
        typeof setting === "object"
    ) {
        return setting.role || "fixed";
    }

    return setting || "fixed";
}


function isIgnoredCalendarEvent(event) {

    return (
        getCalendarRole(
            event.calendarId
        ) === "ignore"
    );
}


function localDateKey(date) {

    const year =
        date.getFullYear();

    const month =
        String(
            date.getMonth() + 1
        ).padStart(2, "0");

    const day =
        String(
            date.getDate()
        ).padStart(2, "0");

    return `${year}-${month}-${day}`;
}


function eventDateKey(event) {

    if (event.start.date) {
        return event.start.date;
    }

    return localDateKey(
        new Date(
            event.start.dateTime
        )
    );
}


function dateKeyDaysFromToday(days) {

    const date =
        new Date();

    date.setHours(
        0,
        0,
        0,
        0
    );

    date.setDate(
        date.getDate() + days
    );

    return localDateKey(date);
}


function calendarEventCard(event) {

    const when =
        formatEventTime(event);

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
                    escapeHtml(name)
                }
            </small>

        </div>
    `;
}


// =========================
// NEXT EVENT
// =========================

function renderNextEvent() {

    const container =
        document.getElementById(
            "next-event"
        );

    if (!container) {
        return;
    }

    const visibleEvents =
        calendarEvents.filter(
            event =>
                !isIgnoredCalendarEvent(
                    event
                )
        );

    const nextEvent =
        visibleEvents[0];

    if (!nextEvent) {

        container.innerHTML = `
            <div class="card">
                <p>No upcoming events.</p>
            </div>
        `;

        return;
    }

    container.innerHTML =
        calendarEventCard(
            nextEvent
        );
}


// =========================
// UPCOMING EVENTS
// =========================

function renderUpcomingEvents() {

    const container =
        document.getElementById(
            "calendar-events"
        );

    const lastVisibleDate =
        dateKeyDaysFromToday(
            upcomingDaysShown - 1
        );

    const visibleEvents =
        calendarEvents.filter(event => {

            if (
                isIgnoredCalendarEvent(
                    event
                )
            ) {
                return false;
            }

            const date =
                eventDateKey(event);

            return (
                date <= lastVisibleDate
            );
        });


    let html = "";

    if (!visibleEvents.length) {

        html = `
            <div class="card">
                <p>
                    No upcoming events
                    in this period.
                </p>
            </div>
        `;

    } else {

        html =
            visibleEvents
                .map(
                    event =>
                        calendarEventCard(
                            event
                        )
                )
                .join("");
    }


    const laterEventsExist =
        calendarEvents.some(event => {

            if (
                isIgnoredCalendarEvent(
                    event
                )
            ) {
                return false;
            }

            return (
                eventDateKey(event) >
                lastVisibleDate
            );
        });


    html += `
        <div class="calendar-range-controls">

            ${
                upcomingDaysShown > 2
                    ? `
                        <button
                            type="button"
                            id="calendar-show-less"
                        >
                            Show less
                        </button>
                    `
                    : ""
            }

            ${
                laterEventsExist
                    ? `
                        <button
                            type="button"
                            id="calendar-show-more"
                        >
                            Show more
                        </button>
                    `
                    : ""
            }

        </div>
    `;


    container.innerHTML =
        html;


    const showMore =
        document.getElementById(
            "calendar-show-more"
        );

    if (showMore) {

        showMore.addEventListener(
            "click",
            () => {

                upcomingDaysShown++;

                renderUpcomingEvents();
            }
        );
    }


    const showLess =
        document.getElementById(
            "calendar-show-less"
        );

    if (showLess) {

        showLess.addEventListener(
            "click",
            () => {

                upcomingDaysShown =
                    Math.max(
                        2,
                        upcomingDaysShown - 1
                    );

                renderUpcomingEvents();
            }
        );
    }
}


function renderCalendarViews() {

    renderNextEvent();
    renderUpcomingEvents();
}

// =========================
// LOAD CALENDAR
// =========================

async function loadCalendar() {

    if (!session) {
        return;
    }

    const upcomingContainer =
        document.getElementById(
            "calendar-events"
        );

    const nextContainer =
        document.getElementById(
            "next-event"
        );


    upcomingContainer.innerHTML = `
        <div class="card">
            <p>Loading calendar...</p>
        </div>
    `;

    if (nextContainer) {

        nextContainer.innerHTML = `
            <div class="card">
                <p>Loading calendar...</p>
            </div>
        `;
    }


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

            const message = `
                <div class="card">
                    <p>
                        Calendar error:
                        ${response.status}
                    </p>
                </div>
            `;

            upcomingContainer.innerHTML =
                message;

            if (nextContainer) {
                nextContainer.innerHTML =
                    message;
            }

            return;
        }


        const data =
            await response.json();

        const connectGoogleButton =
            document.getElementById(
                "connect-google"
            );

        connectGoogleButton.hidden = true;

        calendarSettings =
            await fetchCalendarSettings();

        calendarData =
            getUniqueCalendars(
                data.items || []
            );

        renderCalendarSettings();

        renderCalendarViews();

    } catch (error) {

        console.error(error);

        const message = `
            <div class="card">
                <p>
                    Calendar failed to load:
                    ${
                        escapeHtml(
                            error.message
                        )
                    }
                </p>
            </div>
        `;

        upcomingContainer.innerHTML =
            message;

        if (nextContainer) {
            nextContainer.innerHTML =
                message;
        }
    }
}

// =========================
// SCHEDULER SETTINGS
// =========================

async function loadSchedulerSettings() {

    if (!session) {
        return;
    }

    const status =
        document.getElementById(
            "scheduler-settings-status"
        );

    try {

        const response =
            await fetch(
                API + "/scheduler-settings",
                {
                    headers: {
                        Authorization:
                            "Bearer " + session
                    }
                }
            );

        if (!response.ok) {
            throw new Error(
                `Settings load failed: ${response.status}`
            );
        }

        const data =
            await response.json();

        const settings =
            data.settings;


        document.getElementById(
            "scheduler-normal-earliest"
        ).value =
            settings.normalEarliest;


        document.getElementById(
            "scheduler-hangover-earliest"
        ).value =
            settings.hangoverEarliest;


        document.getElementById(
            "scheduler-preferred-finish"
        ).value =
            settings.preferredFinish;


        document.getElementById(
            "scheduler-absolute-finish"
        ).value =
            settings.absoluteFinish;


        document.getElementById(
            "scheduler-early-fixed-override"
        ).checked =
            settings.earlyFixedOverridesEarliest;


        document.getElementById(
            "scheduler-lecture-travel-before"
        ).value =
            settings.lectureTravelBeforeMinutes;


        document.getElementById(
            "scheduler-lecture-travel-after"
        ).value =
            settings.lectureTravelAfterMinutes;


        document.getElementById(
            "scheduler-transition"
        ).value =
            settings.defaultTransitionMinutes;


        status.textContent = "";

    } catch (error) {

        console.error(error);

        status.textContent =
            "Could not load scheduler settings.";
    }
}


// =========================
// SAVE SCHEDULER SETTINGS
// =========================

async function saveSchedulerSettingsFromUI() {

    if (!session) {
        return;
    }

    const button =
        document.getElementById(
            "save-scheduler-settings"
        );

    const status =
        document.getElementById(
            "scheduler-settings-status"
        );


    const settings = {

        normalEarliest:
            document.getElementById(
                "scheduler-normal-earliest"
            ).value,

        hangoverEarliest:
            document.getElementById(
                "scheduler-hangover-earliest"
            ).value,

        preferredFinish:
            document.getElementById(
                "scheduler-preferred-finish"
            ).value,

        absoluteFinish:
            document.getElementById(
                "scheduler-absolute-finish"
            ).value,

        earlyFixedOverridesEarliest:
            document.getElementById(
                "scheduler-early-fixed-override"
            ).checked,

        lectureTravelBeforeMinutes:
            Number(
                document.getElementById(
                    "scheduler-lecture-travel-before"
                ).value
            ),

        lectureTravelAfterMinutes:
            Number(
                document.getElementById(
                    "scheduler-lecture-travel-after"
                ).value
            ),

        defaultTransitionMinutes:
            Number(
                document.getElementById(
                    "scheduler-transition"
                ).value
            )
    };


    button.disabled = true;
    status.textContent = "Saving...";


    try {

        const response =
            await fetch(
                API + "/scheduler-settings",
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
                            settings
                        })
                }
            );


        if (!response.ok) {
            throw new Error(
                `Settings save failed: ${response.status}`
            );
        }


        status.textContent = "Saved.";

    } catch (error) {

        console.error(error);

        status.textContent =
            "Could not save settings.";

    } finally {

        button.disabled = false;
    }
}


// =========================
// SCHEDULER SETTINGS BUTTON
// =========================

document.getElementById(
    "save-scheduler-settings"
).addEventListener(
    "click",
    saveSchedulerSettingsFromUI
);

// =========================
// SETTINGS VIEW
// =========================

const dashboardView =
    document.getElementById(
        "dashboard-view"
    );

const settingsView =
    document.getElementById(
        "settings-view"
    );

const openSettingsButton =
    document.getElementById(
        "open-settings"
    );

const closeSettingsButton =
    document.getElementById(
        "close-settings"
    );


function showSettings() {

    dashboardView.hidden = true;
    settingsView.hidden = false;
}


function hideSettings() {

    settingsView.hidden = true;
    dashboardView.hidden = false;
}


function showSettingsTab(tabName) {

    document
        .querySelectorAll(
            ".settings-tab"
        )
        .forEach(button => {

            button.classList.toggle(
                "active",
                button.dataset.settingsTab ===
                    tabName
            );
        });


    document
        .querySelectorAll(
            ".settings-tab-content"
        )
        .forEach(content => {

            content.hidden =
                content.id !==
                `${tabName}-settings-tab`;
        });
}


openSettingsButton.addEventListener(
    "click",
    () => {
        showSettings();
    }
);


closeSettingsButton.addEventListener(
    "click",
    () => {
        hideSettings();
    }
);


document
    .querySelectorAll(
        ".settings-tab"
    )
    .forEach(button => {

        button.addEventListener(
            "click",
            () => {

                showSettingsTab(
                    button.dataset.settingsTab
                );
            }
        );
    });

// =========================
// START
// =========================

initialiseTasks();
loadCalendar();
loadSchedulerSettings();


// =========================
// SERVICE WORKER
// =========================

if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register(
        "service-worker.js"
    );
}
