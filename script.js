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