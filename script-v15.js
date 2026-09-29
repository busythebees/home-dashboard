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
let pendingGmailTasks = [];
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
// DISCORD COLLECTOR
// =========================

let collectorHealth = null;
let systemHealth = null;
let systemHealthApiAvailable = true;
let discordMessages = [];

// Canonical Discord extraction.
// Loaded alongside the legacy event pipeline
// during migration.
let discordItems = [];
let rejectedDiscordItems = [];
let acceptedDiscordItems = [];

let rejectedDiscordSort =
    "rejected";

const DISCORD_CHANNELS = {
    "1054431143929319454": {
        society: "Warwick Enable",
        channel: "announcements",
        logo: "images/societies/enable.png"
    },

    "766404087356588032": {
        society: "Autism @ Warwick",
        channel: "announcements",
        logo: "images/societies/autism-at-warwick.png"
    },

    "758345986446983260": {
        society: "Offbeat",
        channel: "news",
        logo: "images/societies/offbeat.png"
    },

    "1362824952817914028": {
        society: "Warwick BandSoc",
        channel: "events",
        logo: "images/societies/bandsoc.png"
    },

    "1362886298758807582": {
        society: "Warwick BandSoc",
        channel: "announcements",
        logo: "images/societies/bandsoc.png"
    },

    "759863551606259732": {
        society: "Warwick Bad Film Society",
        channel: "announcements",
        logo: "images/societies/bad-film.png"
    },

    "881857706640687125": {
        society: "Warwick Pride",
        channel: "announcements",
        logo: "images/societies/pride.png"
    },

    "758711329581563925": {
        society: "Warwick RockSoc",
        channel: "news",
        logo: "images/societies/rocksoc.png"
    }
};


function parseD1UtcTimestamp(value) {

    if (!value) {
        return null;
    }

    /*
    * D1 CURRENT_TIMESTAMP is UTC but comes
    * back as "YYYY-MM-DD HH:MM:SS".
    */
    const normalized =
        value.includes("T")
            ? value
            : value.replace(" ", "T") + "Z";

    const date =
        new Date(normalized);

    return Number.isNaN(date.getTime())
        ? null
        : date;
}


async function fetchCollectorStatus() {

    if (!session) {
        return null;
    }

    const response =
        await fetch(
            API + "/collector/status?_=" +
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
            "Collector status load failed: " +
            response.status
        );
    }

    return response.json();
}


function getCollectorDisplayState() {
    if (!systemHealthApiAvailable || !systemHealth) return "unavailable";
    return ["healthy", "degraded", "blocked"].includes(systemHealth.overall_state)
        ? systemHealth.overall_state
        : "unavailable";
}

function systemHealthReasonLabel(reason) {
    const labels = {
        "report-stale": "Report delayed", "report-missing": "Report missing",
        "vpn-unavailable": "VPN unavailable", "vesktop-unavailable": "Vesktop unavailable",
        "collector-unavailable": "Collector unavailable", "outbox-backlog": "Outbox delayed",
        "outbox-pressure": "Outbox nearing capacity", "outbox-full": "Outbox full",
        "outbox-enqueue-rejected": "Outbox rejected an event", "outbox-corrupt": "Outbox metadata invalid",
        "outbox-no-progress": "Outbox is not draining", "bridge-unavailable": "Bridge unavailable",
        "bridge-poll-failed": "Bridge polling retrying", "forwarder-unavailable": "Forwarder unavailable",
        "network-error": "Network retrying", "request-timeout": "Request timed out",
        "bridge-retryable-response": "Bridge retrying", "cloudflare-retryable-response": "Worker retrying",
        "concurrent-edit": "Edit retrying", "cursor-expired": "Cursor recovery required",
        "missing-forwarder-state": "Forwarder state missing", "invalid-forwarder-state": "Forwarder state invalid",
        "bridge-permanent-response": "Bridge rejected delivery", "cloudflare-permanent-response": "Worker rejected delivery",
        "structured-content-too-large": "Structured content blocked", "terminal-processing-failure": "Processing failed",
        "processing-recovery-overdue": "Processing recovery overdue", "processing-retry-pending": "Processing retry pending",
        "recovery-repeated-failure": "Recovery repeatedly failed", "recovery-overdue": "Recovery overdue",
        "recovery-pending": "Recovery pending", "scheduled-recovery-failure": "Scheduled recovery failed",
        "scheduled-recovery-stale": "Recovery sweep delayed", "scheduled-recovery-missing": "Recovery sweep missing",
        "otp-unreachable": "OpenTripPlanner unreachable", "otp-timeout": "OpenTripPlanner timed out",
        "otp-http-error": "OpenTripPlanner API failed", "otp-invalid-response": "OpenTripPlanner response invalid",
        "otp-routing-failed": "OpenTripPlanner routing failed", "otp-check-stale": "OpenTripPlanner check overdue",
        "otp-not-configured": "OpenTripPlanner monitoring not configured"
    };
    return labels[reason] || (reason ? "Attention required" : "OK");
}

function formatHealthAge(value) {
    const date = parseD1UtcTimestamp(value);
    if (!date) return "Never";
    const seconds = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000));
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    return `${Math.floor(seconds / 3600)}h ago`;
}


function renderCollectorStatus() {

    const dot =
        document.getElementById(
            "collector-status-dot"
        );

    const button =
        document.getElementById(
            "collector-status-button"
        );

    if (!dot || !button) {
        return;
    }

    const state =
        getCollectorDisplayState();

    dot.className =
        "collector-status-dot " +
        "collector-status-" +
        state;

    const label = state === "healthy" ? "System healthy"
        : state === "degraded" ? "System degraded; retrying"
            : state === "blocked" ? "System blocked" : "Health unavailable";

    button.setAttribute(
        "aria-label",
        label
    );

    button.title = label;
    const text = document.getElementById("collector-status-label");
    if (text) text.textContent = label;
}


function formatDiscordMessageTime(
    message
) {

    const value =
        message.message_timestamp ||
        message.received_at;

    const date =
        message.message_timestamp
            ? new Date(value)
            : parseD1UtcTimestamp(value);

    if (
        !date ||
        Number.isNaN(date.getTime())
    ) {
        return "";
    }

    return date.toLocaleString(
        [],
        {
            dateStyle: "medium",
            timeStyle: "short"
        }
    );
}

// =========================
// DISCORD EVENT CANDIDATES
// =========================

async function fetchDiscordItems() {

    if (!session) {
        return [];
    }

    const response =
        await fetch(
            API + "/discord-items?_=" +
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
            "Discord items load failed: " +
            response.status
        );
    }

    const data =
        await response.json();

    return data.items || [];
}

async function fetchDiscordItemsByStatus(
    status
) {

    if (!session) {
        return [];
    }

    const response =
        await fetch(
            API +
                "/discord-items?status=" +
                encodeURIComponent(status) +
                "&_=" +
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
            "Discord items load failed: " +
            response.status
        );
    }

    const data =
        await response.json();

    return data.items || [];
}


function fetchRejectedDiscordItems() {
    return fetchDiscordItemsByStatus(
        "rejected"
    );
}


function fetchAcceptedDiscordItems() {
    return fetchDiscordItemsByStatus(
        "accepted"
    );
}


function deriveDiscordItemCollections(items) {

    const allItems =
        Array.isArray(items)
            ? items
            : [];

    return {
        allItems,

        rejectedItems:
            allItems.filter(
                item =>
                    item.status === "rejected"
            ),

        acceptedItems:
            allItems.filter(
                item =>
                    item.status === "accepted"
            )
    };
}


function getCanonicalAcceptedDiscordEvents() {

    return acceptedDiscordItems.filter(
        item =>
            item.item_type === "event" &&
            item.status === "accepted"
    );
}

function getCanonicalDiscordEvents() {

    return discordItems.filter(
        item =>
            item.item_type === "event" &&
            (
                item.status === "candidate" ||
                item.status === "needs-review"
            )
    );
}

function getCanonicalRejectedDiscordEvents() {

    return rejectedDiscordItems.filter(
        item =>
            item.item_type === "event" &&
            item.status === "rejected"
    );
}


function formatDiscordEventDate(event) {

    if (!event.event_date) {
        return "Date needs review";
    }

    const date =
        new Date(
            event.event_date +
            "T12:00:00"
        );

    if (Number.isNaN(date.getTime())) {
        return event.event_date;
    }

    return date.toLocaleDateString(
        [],
        {
            weekday: "long",
            day: "numeric",
            month: "long"
        }
    );
}


function formatDiscordEventTime(event) {

    if (!event.start_time) {
        return "Time needs review";
    }

    const start =
        event.start_time.slice(0, 5);

    if (!event.end_time) {
        return start;
    }

    return (
        start +
        " – " +
        event.end_time.slice(0, 5)
    );
}

function parseDiscordItinerary(value) {

    if (!value) {
        return null;
    }

    try {
        return typeof value === "string"
            ? JSON.parse(value)
            : value;
    } catch {
        return null;
    }
}


function formatJourneyClockTime(value) {

    if (!value) {
        return "";
    }

    const date =
        new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "";
    }

    return date.toLocaleTimeString(
        "en-GB",
        {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false
        }
    );
}


function formatAcceptedEventTravel(event) {

    const itinerary =
        parseDiscordItinerary(
            event.direct_itinerary_json
        );

    if (
        !itinerary ||
        !Array.isArray(itinerary.legs) ||
        itinerary.legs.length === 0
    ) {
        return "";
    }


    const walkIcon = `
        <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            class="accepted-travel-icon"
        >
            <circle cx="12" cy="4" r="2"></circle>
            <path d="M10 22l1-7-2-3"></path>
            <path d="M14 22l-1-7 2-4"></path>
            <path d="M9 12l2-5 4 2 2 4"></path>
        </svg>
    `;


    const busIcon = `
        <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            class="accepted-travel-icon"
        >
            <rect
                x="5"
                y="3"
                width="14"
                height="16"
                rx="2"
            ></rect>
            <path d="M5 11h14"></path>
            <path d="M8 19v2"></path>
            <path d="M16 19v2"></path>
            <circle cx="8" cy="16" r="1"></circle>
            <circle cx="16" cy="16" r="1"></circle>
        </svg>
    `;


    const steps =
        itinerary.legs
            .map(leg => {

                const mode =
                    String(
                        leg.mode || ""
                    ).toUpperCase();

                const startTime =
                    formatJourneyClockTime(
                        leg.start?.estimated?.time ||
                        leg.start?.scheduledTime
                    );

                const endTime =
                    formatJourneyClockTime(
                        leg.end?.estimated?.time ||
                        leg.end?.scheduledTime
                    );

                let destination =
                    leg.to?.name || "destination";

                if (
                    destination === "Destination" &&
                    event.location
                ) {
                    destination =
                        event.location;
                }


                if (mode === "WALK") {

                    const durationMinutes =
                        leg.start?.scheduledTime &&
                        leg.end?.scheduledTime
                            ? Math.max(
                                1,
                                Math.round(
                                    (
                                        new Date(
                                            leg.end.scheduledTime
                                        ) -
                                        new Date(
                                            leg.start.scheduledTime
                                        )
                                    ) /
                                    60000
                                )
                            )
                            : null;

                    return `
                        <div class="accepted-travel-leg">

                            <div class="accepted-travel-leg-time">
                                ${escapeHtml(startTime)}
                            </div>

                            <div class="accepted-travel-leg-icon">
                                ${walkIcon}
                            </div>

                            <div class="accepted-travel-leg-content">

                                <div class="accepted-travel-leg-main">
                                    Walk to
                                    ${escapeHtml(destination)}
                                </div>

                                <div class="accepted-travel-leg-meta">
                                    ${
                                        durationMinutes
                                            ? (
                                                `~${durationMinutes} min` +
                                                (
                                                    endTime
                                                        ? ` · Arrive ~${escapeHtml(endTime)}`
                                                        : ""
                                                )
                                            )
                                            : (
                                                endTime
                                                    ? `Arrive ~${escapeHtml(endTime)}`
                                                    : ""
                                            )
                                    }
                                </div>

                            </div>

                        </div>
                    `;
                }


                const service =
                    leg.route?.shortName ||
                    leg.route?.longName ||
                    mode;

                return `
                    <div class="accepted-travel-leg">

                        <div class="accepted-travel-leg-time">
                            ${escapeHtml(startTime)}
                        </div>

                        <div class="accepted-travel-leg-icon">
                            ${busIcon}
                        </div>

                        <div class="accepted-travel-leg-content">

                            <div class="accepted-travel-leg-main">
                                ${escapeHtml(service)}
                                →
                                ${escapeHtml(destination)}
                            </div>

                            <div class="accepted-travel-leg-meta">
                                Arrive ~${escapeHtml(endTime)}
                            </div>

                        </div>

                    </div>
                `;
            })
            .join("");


    return `
        <details class="accepted-event-travel">

            <summary class="accepted-event-travel-summary">

                <span>Travel</span>

                <span
                    class="accepted-event-travel-chevron"
                    aria-hidden="true"
                >
                    ›
                </span>

            </summary>

            <div class="accepted-event-travel-body">
                ${steps}
            </div>

        </details>
    `;
}

function renderLiveTravel(
    now = new Date()
) {

    const section =
        document.getElementById(
            "live-travel-section"
        );

    const container =
        document.getElementById(
            "live-travel"
        );

    if (!section || !container) {
        return;
    }

    const active =
        getActiveLiveTravelEvent(now);

    if (!active) {
        section.hidden = true;
        container.innerHTML = "";
        return;
    }

    const {
        event,
        itinerary,
        leaveTime
    } = active;

    const walkIcon = `
        <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            class="accepted-travel-icon"
        >
            <circle cx="12" cy="4" r="2"></circle>
            <path d="M10 22l1-7-2-3"></path>
            <path d="M14 22l-1-7 2-4"></path>
            <path d="M9 12l2-5 4 2 2 4"></path>
        </svg>
    `;

    const busIcon = `
        <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            class="accepted-travel-icon"
        >
            <rect
                x="5"
                y="3"
                width="14"
                height="16"
                rx="2"
            ></rect>
            <path d="M5 11h14"></path>
            <path d="M8 19v2"></path>
            <path d="M16 19v2"></path>
            <circle cx="8" cy="16" r="1"></circle>
            <circle cx="16" cy="16" r="1"></circle>
        </svg>
    `;

    const steps =
        itinerary.legs
            .map(leg => {

                const mode =
                    String(
                        leg.mode || ""
                    ).toUpperCase();

                const startTime =
                    formatJourneyClockTime(
                        leg.start?.estimated?.time ||
                        leg.start?.scheduledTime
                    );

                const endTime =
                    formatJourneyClockTime(
                        leg.end?.estimated?.time ||
                        leg.end?.scheduledTime
                    );

                let destination =
                    leg.to?.name ||
                    "destination";

                if (
                    destination === "Destination" &&
                    event.location
                ) {
                    destination =
                        event.location;
                }

                if (mode === "WALK") {

                    const start =
                        new Date(
                            leg.start?.estimated?.time ||
                            leg.start?.scheduledTime
                        );

                    const end =
                        new Date(
                            leg.end?.estimated?.time ||
                            leg.end?.scheduledTime
                        );

                    const durationMinutes =
                        !Number.isNaN(start.getTime()) &&
                        !Number.isNaN(end.getTime())
                            ? Math.max(
                                1,
                                Math.round(
                                    (end - start) /
                                    60000
                                )
                            )
                            : null;

                    return `
                        <div class="accepted-travel-leg">

                            <div class="accepted-travel-leg-time">
                                ${escapeHtml(startTime)}
                            </div>

                            <div class="accepted-travel-leg-icon">
                                ${walkIcon}
                            </div>

                            <div class="accepted-travel-leg-content">

                                <div class="accepted-travel-leg-main">
                                    Walk to ${escapeHtml(destination)}
                                </div>

                                <div class="accepted-travel-leg-meta">
                                    ${
                                        durationMinutes
                                            ? `~${durationMinutes} min · `
                                            : ""
                                    }Arrive ~${escapeHtml(endTime)}
                                </div>

                            </div>

                        </div>
                    `;
                }

                const service =
                    leg.route?.shortName ||
                    leg.route?.longName ||
                    mode;

                const headsign =
                    leg.trip?.tripHeadsign ||
                    "";

                const origin =
                    leg.from?.name ||
                    "stop";

                return `
                    <div class="accepted-travel-leg">

                        <div class="accepted-travel-leg-time">
                            ${escapeHtml(startTime)}
                        </div>

                        <div class="accepted-travel-leg-icon">
                            ${busIcon}
                        </div>

                        <div class="accepted-travel-leg-content">

                            <div class="accepted-travel-leg-main">
                                Get the ${escapeHtml(service)}${
                                    headsign
                                        ? ` towards ${escapeHtml(headsign)}`
                                        : ""
                                }
                            </div>

                            <div class="accepted-travel-leg-meta">
                                ${escapeHtml(origin)}
                                →
                                ${escapeHtml(destination)}
                                · Arrive ~${escapeHtml(endTime)}
                            </div>

                        </div>

                    </div>
                `;
            })
            .join("");

    container.innerHTML = `
        <div class="card live-travel-card">

            <div class="live-travel-label">
                Travel
            </div>

            <div class="discord-event-title">
                ${escapeHtml(
                    event.title ||
                    "Upcoming event"
                )}
            </div>

            <div class="live-travel-leave">
                Leave at
                <strong>
                    ${escapeHtml(
                        formatJourneyClockTime(
                            leaveTime
                        )
                    )}
                </strong>
            </div>

            <div class="live-travel-steps">
                ${steps}
            </div>

        </div>
    `;

    section.hidden = false;
}

setInterval(
    () => renderLiveTravel(),
    60 * 1000
);

function getActiveLiveTravelEvent(
    now = new Date()
) {

    const candidates =
        getCanonicalAcceptedDiscordEvents()
            .map(event => {

                const itinerary =
                    parseDiscordItinerary(
                        event.direct_itinerary_json
                    );

                if (
                    !itinerary ||
                    !itinerary.start_time ||
                    !event.event_date ||
                    !event.start_time
                ) {
                    return null;
                }

                const leaveTime =
                    new Date(
                        itinerary.start_time
                    );

                const eventStart =
                    new Date(
                        `${event.event_date}T${event.start_time}`
                    );

                if (
                    Number.isNaN(
                        leaveTime.getTime()
                    ) ||
                    Number.isNaN(
                        eventStart.getTime()
                    )
                ) {
                    return null;
                }

                const showFrom =
                    new Date(
                        leaveTime.getTime() -
                        60 * 60 * 1000
                    );

                if (
                    now < showFrom ||
                    now >= eventStart
                ) {
                    return null;
                }

                return {
                    event,
                    itinerary,
                    leaveTime,
                    eventStart,
                    showFrom
                };
            })
            .filter(Boolean)
            .sort(
                (a, b) =>
                    a.leaveTime -
                    b.leaveTime
            );

    return candidates[0] || null;
}

function formatDiscordSourceMessages(event) {

    let messages = [];

    try {
        messages =
            JSON.parse(
                event.source_messages ||
                "[]"
            );
    } catch (error) {
        console.error(
            "Invalid Discord source messages",
            error
        );

        return {
            summary: "",
            content: ""
        };
    }

    if (
        !Array.isArray(messages) ||
        messages.length === 0
    ) {
        return {
            summary: "",
            content: ""
        };
    }

    const label =
        messages.length === 1
            ? "View original announcement"
            : `View original announcements (${messages.length})`;

    return {
        summary: `
            <button
                type="button"
                class="discord-original-announcement-toggle"
            >
                ${escapeHtml(label)}
            </button>
        `,

        content: `
            <div
                class="discord-original-announcement-messages"
                hidden
            >
                ${
                    messages
                        .map(
                            message => `
                                <div class="discord-original-announcement-content">${escapeHtml(
                                    message.content || ""
                                )}</div>
                            `
                        )
                        .join("")
                }
            </div>
        `
    };
}

function formatDiscordActions(event) {

    let actions = [];

    try {
        actions =
            JSON.parse(
                event.actions || "[]"
            );
    } catch (error) {
        console.error(
            "Invalid Discord actions",
            error
        );

        return "";
    }

    if (
        !Array.isArray(actions) ||
        actions.length === 0
    ) {
        return "";
    }

    return `
        <div class="discord-actions">
            ${
                actions
                    .map(
                        action => `
                            <a
                                class="discord-action-button"
                                href="${escapeHtml(
                                    action.url
                                )}"
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                ${escapeHtml(
                                    action.label
                                )}
                            </a>
                        `
                    )
                    .join("")
            }
        </div>
    `;
}

function renderAcceptedDiscordEvents() {

    const container =
        document.getElementById(
            "accepted-discord-events"
        );

    if (!container) {
        return;
    }

    const events =
        getCanonicalAcceptedDiscordEvents();

    if (events.length === 0) {
        container.innerHTML = `
            <div class="card">
                <p>No accepted events.</p>
            </div>
        `;
        return;
    }

    container.innerHTML =
        events
            .map(event => {

                const source =
                    DISCORD_CHANNELS[
                        event.channel_id
                    ];

                const society =
                    source?.society ||
                    "Discord";

                const logo =
                    source?.logo || "";

                const sourceMessages =
                    formatDiscordSourceMessages(
                        event
                    );

                return `
                    <div
                        class="
                            card
                            discord-event-card
                            accepted-discord-event-card
                        "
                    >

                        <div class="discord-event-header">

                            ${
                                logo
                                    ? `
                                        <img
                                            class="discord-society-logo"
                                            src="${logo}"
                                            alt=""
                                        >
                                    `
                                    : ""
                            }

                            <div class="discord-society-name">
                                ${escapeHtml(society)}
                            </div>

                        </div>

                        <div class="discord-event-title">
                            ${escapeHtml(
                                event.title ||
                                "Untitled event"
                            )}
                        </div>

                        <div class="discord-event-details">

                            <div>
                                ${escapeHtml(
                                    formatDiscordEventDate(
                                        event
                                    )
                                )}
                            </div>

                            <div>
                                ${escapeHtml(
                                    formatDiscordEventTime(
                                        event
                                    )
                                )}
                            </div>

                            ${
                                event.location
                                    ? `
                                        <div>
                                            ${escapeHtml(
                                                event.location
                                            )}
                                        </div>
                                    `
                                    : ""
                            }

                            ${
                                event.meeting_point
                                    ? `
                                        <div>
                                            Meeting point:
                                            ${escapeHtml(
                                                event.meeting_point
                                            )}
                                            ${
                                                event.meeting_time
                                                    ? ` at ${escapeHtml(
                                                        event.meeting_time.slice(
                                                            0,
                                                            5
                                                        )
                                                    )}`
                                                    : ""
                                            }
                                        </div>
                                    `
                                    : ""
                            }

                        </div>

                        ${formatAcceptedEventTravel(event)}

                        ${
                            event.description
                                ? `
                                        <div class="discord-event-description">
                                            ${escapeHtml(
                                                event.description
                                            )}
                                        </div>
                                `
                                : ""
                        }

                        <div class="discord-card-actions">
                            ${sourceMessages.summary}
                            ${formatDiscordActions(event)}
                        </div>

                        ${sourceMessages.content}

                        <button
                            type="button"
                            class="discord-event-reject"
                            data-no-longer-going
                            data-item-id="${event.id}"
                        >
                            I no longer want to go
                        </button>

                    </div>
                `;
            })
            .join("");
}

function renderDiscordEvents() {

    const section =
        document.getElementById(
            "discord-events-section"
        );

    const container =
        document.getElementById(
            "discord-events"
        );

    if (!section || !container) {
        return;
    }

    const canonicalEvents =
        getCanonicalDiscordEvents();

    if (
        canonicalEvents.length === 0
    ) {
        section.hidden = true;
        container.innerHTML = "";
        return;
    }

    section.hidden = false;

    if (canonicalEvents.length === 0) {
        container.innerHTML = "";
        return;
    }

    container.innerHTML =
        canonicalEvents
            .map(event => {

                const source =
                    DISCORD_CHANNELS[
                        event.channel_id
                    ];

                const society =
                    source?.society ||
                    "Discord";

                const logo =
                    source?.logo || "";

                const needsReview =
                    event.status ===
                    "needs-review";

                const sourceMessages =
                    formatDiscordSourceMessages(
                        event
                    );

                return `
                    <div
                        class="
                            card
                            discord-event-card
                            ${
                                needsReview
                                    ? "discord-event-needs-review"
                                    : ""
                            }
                        "
                    >

                        <div class="discord-event-header">

                            ${
                                logo
                                    ? `
                                        <img
                                            class="discord-society-logo"
                                            src="${logo}"
                                            alt=""
                                        >
                                    `
                                    : ""
                            }

                            <div>
                                <div class="discord-society-name">
                                    ${escapeHtml(society)}
                                </div>

                                ${
                                    needsReview
                                        ? `
                                            <div class="discord-event-review-label">
                                                Details need review
                                            </div>
                                        `
                                        : ""
                                }
                            </div>

                        </div>

                        <div class="discord-event-title">
                            ${escapeHtml(
                                event.title ||
                                "Untitled event"
                            )}
                        </div>

                        <div class="discord-event-details">

                            <div>
                                ${escapeHtml(
                                    formatDiscordEventDate(
                                        event
                                    )
                                )}
                            </div>

                            <div>
                                ${escapeHtml(
                                    formatDiscordEventTime(
                                        event
                                    )
                                )}
                            </div>

                            ${
                                event.location
                                    ? `
                                        <div>
                                            ${escapeHtml(
                                                event.location
                                            )}
                                        </div>
                                    `
                                    : `
                                        <div>
                                            Location not specified
                                        </div>
                                    `
                            }

                            <div>
                                ${
                                    event.drinking_status === "drinking"
                                        ? "Drinking"
                                        : event.drinking_status === "non_drinking"
                                            ? "Non-drinking"
                                            : "Drinking status unclear"
                                }
                            </div>

                            ${
                                event.meeting_point
                                    ? `
                                        <div>
                                            Meeting point:
                                            ${escapeHtml(
                                                event.meeting_point
                                            )}
                                            ${
                                                event.meeting_time
                                                    ? ` at ${escapeHtml(
                                                        event.meeting_time.slice(
                                                            0,
                                                            5
                                                        )
                                                    )}`
                                                    : ""
                                            }
                                        </div>
                                    `
                                    : ""
                            }

                        </div>

                        ${
                            event.description
                                ? `
                                        <div class="discord-event-description">
                                            ${escapeHtml(
                                                event.description
                                            )}
                                        </div>
                                `
                                : ""
                        }

                        <div class="discord-card-actions">
                            ${sourceMessages.summary}
                            ${formatDiscordActions(event)}
                        </div>

                        ${sourceMessages.content}

                        <button
                            type="button"
                            class="discord-event-edit"
                            data-discord-event-edit
                        >
                            Edit
                        </button>

                        <form
                            class="discord-event-edit-form"
                            data-discord-event-edit-form
                            data-item-id="${event.id}"
                            hidden
                        >
                            <label>
                                Title
                                <input
                                    type="text"
                                    name="title"
                                    value="${escapeHtml(
                                        event.title || ""
                                    )}"
                                >
                            </label>

                            <label>
                                Date
                                <input
                                    type="date"
                                    name="eventDate"
                                    value="${escapeHtml(
                                        event.event_date || ""
                                    )}"
                                >
                            </label>

                            <label>
                                Start time
                                <input
                                    type="time"
                                    name="startTime"
                                    value="${escapeHtml(
                                        event.start_time
                                            ? event.start_time.slice(0, 5)
                                            : ""
                                    )}"
                                >
                            </label>

                            <label>
                                End time
                                <input
                                    type="time"
                                    name="endTime"
                                    value="${escapeHtml(
                                        event.end_time
                                            ? event.end_time.slice(0, 5)
                                            : ""
                                    )}"
                                >
                            </label>

                            <label>
                                Location
                                <input
                                    type="text"
                                    name="location"
                                    value="${escapeHtml(
                                        event.location || ""
                                    )}"
                                >
                            </label>

                            <label>
                                Location type
                                <select
                                    name="locationType"
                                >
                                    ${[
                                        "unknown",
                                        "campus",
                                        "off-campus",
                                        "online"
                                    ].map(
                                        value => `
                                            <option
                                                value="${value}"
                                                ${
                                                    event.location_type === value
                                                        ? "selected"
                                                        : ""
                                                }
                                            >
                                                ${value}
                                            </option>
                                        `
                                    ).join("")}
                                </select>
                            </label>

                            <label>
                                Meeting point
                                <input
                                    type="text"
                                    name="meetingPoint"
                                    value="${escapeHtml(
                                        event.meeting_point || ""
                                    )}"
                                >
                            </label>

                            <label>
                                Meeting point type
                                <select
                                    name="meetingPointType"
                                >
                                    ${[
                                        "unknown",
                                        "campus",
                                        "off-campus",
                                        "online"
                                    ].map(
                                        value => `
                                            <option
                                                value="${value}"
                                                ${
                                                    event.meeting_point_type === value
                                                        ? "selected"
                                                        : ""
                                                }
                                            >
                                                ${value}
                                            </option>
                                        `
                                    ).join("")}
                                </select>
                            </label>

                            <label>
                                Meeting time
                                <input
                                    type="time"
                                    name="meetingTime"
                                    value="${escapeHtml(
                                        event.meeting_time
                                            ? event.meeting_time.slice(0, 5)
                                            : ""
                                    )}"
                                >
                            </label>

                            <label>
                                Drinking status
                                <select
                                    name="drinkingStatus"
                                >
                                    ${[
                                        ["unclear", "Unclear"],
                                        ["drinking", "Drinking"],
                                        ["non_drinking", "Non-drinking"]
                                    ].map(
                                        ([value, label]) => `
                                            <option
                                                value="${value}"
                                                ${
                                                    (
                                                        event.drinking_status ||
                                                        "unclear"
                                                    ) === value
                                                        ? "selected"
                                                        : ""
                                                }
                                            >
                                                ${label}
                                            </option>
                                        `
                                    ).join("")}
                                </select>
                            </label>

                            <label>
                                Description
                                <textarea
                                    name="description"
                                >${escapeHtml(
                                    event.description || ""
                                )}</textarea>
                            </label>

                            <div class="discord-event-edit-actions">
                                <button
                                    type="submit"
                                >
                                    Save
                                </button>

                                <button
                                    type="button"
                                    data-discord-event-edit-cancel
                                >
                                    Cancel
                                </button>
                            </div>
                        </form>

                        <div class="discord-event-actions">

                            <button
                                type="button"
                                class="discord-event-reject"
                                data-discord-event-decision="rejected"
                                data-item-id="${event.id}"
                                aria-label="Not interested"
                                title="Not interested"
                            >
                                ×
                            </button>

                            <button
                                type="button"
                                class="discord-event-accept"
                                data-discord-event-decision="accepted"
                                data-item-id="${event.id}"
                                aria-label="I would like to go"
                                title="I would like to go"
                            >
                                ✓
                            </button>

                        </div>

                    </div>
                `;
            })
            .join("");
}

function renderRejectedDiscordEvents() {

    const section =
        document.getElementById(
            "rejected-discord-events-section"
        );

    const container =
        document.getElementById(
            "rejected-discord-events"
        );

    if (!section || !container) {
        return;
    }

    const canonicalRejectedEvents =
        getCanonicalRejectedDiscordEvents();


    if (
        canonicalRejectedEvents.length === 0
    ) {
        section.hidden = true;
        container.innerHTML = "";
        return;
    }


    section.hidden = false;

    const sortedEvents =
        [...canonicalRejectedEvents]
            .sort(
                (a, b) => {

                    if (
                        rejectedDiscordSort ===
                        "event"
                    ) {

                        const aDate =
                            `${a.event_date || "9999-12-31"}T${a.start_time || "23:59"}`;

                        const bDate =
                            `${b.event_date || "9999-12-31"}T${b.start_time || "23:59"}`;

                        return (
                            aDate.localeCompare(
                                bDate
                            )
                        );
                    }


                    const aRejected =
                        a.rejected_at || "";

                    const bRejected =
                        b.rejected_at || "";

                    return (
                        bRejected.localeCompare(
                            aRejected
                        )
                    );
                }
            );


    container.innerHTML =
        sortedEvents
            .map(event => {

                const source =
                    DISCORD_CHANNELS[
                        event.channel_id
                    ];

                const society =
                    source?.society ||
                    "Discord";

                const logo =
                    source?.logo || "";

                return `
                    <div
                        class="
                            card
                            discord-event-card
                            rejected-discord-event-card
                        "
                    >

                        <div class="discord-event-header">

                            ${
                                logo
                                    ? `
                                        <img
                                            class="discord-society-logo"
                                            src="${logo}"
                                            alt=""
                                        >
                                    `
                                    : ""
                            }

                            <div class="discord-society-name">
                                ${escapeHtml(society)}
                            </div>

                        </div>

                        <div class="discord-event-title">
                            ${escapeHtml(
                                event.title ||
                                "Untitled event"
                            )}
                        </div>

                        <div class="discord-event-details">

                            <div>
                                ${escapeHtml(
                                    formatDiscordEventDate(
                                        event
                                    )
                                )}
                            </div>

                            <div>
                                ${escapeHtml(
                                    formatDiscordEventTime(
                                        event
                                    )
                                )}
                            </div>

                            ${
                                event.location
                                    ? `
                                        <div>
                                            ${escapeHtml(
                                                event.location
                                            )}
                                        </div>
                                    `
                                    : ""
                            }

                        </div>

                        ${
                            event.description
                                ? `
                                    <div class="discord-event-description">
                                        ${escapeHtml(
                                            event.description
                                        )}
                                    </div>
                                `
                                : ""
                        }

                        <button
                            type="button"
                            class="discord-event-restore"
                            data-restore-discord-item="${event.id}"
                        >
                            Restore
                        </button>

                    </div>
                `;
            })
            .join("");
}

async function decideDiscordItem(
    itemId,
    status
) {
    const response =
        await fetch(
            API +
            "/discord-items/decision",
            {
                method: "PUT",

                headers: {
                    Authorization:
                        "Bearer " +
                        session,

                    "Content-Type":
                        "application/json"
                },

                body:
                    JSON.stringify({
                        itemId,
                        status
                    })
            }
        );

    if (!response.ok) {
        throw new Error(
            "Discord item decision failed: " +
            response.status
        );
    }

    discordItems =
        await fetchDiscordItems();

    rejectedDiscordItems =
        await fetchRejectedDiscordItems();

    renderDiscordEvents();
    renderRejectedDiscordEvents();
}

async function saveDiscordItemDetails(
    itemId,
    details
) {
    const response =
        await fetch(
            API +
                "/discord-items/details",
            {
                method: "PUT",

                headers: {
                    Authorization:
                        "Bearer " +
                        session,

                    "Content-Type":
                        "application/json"
                },

                body:
                    JSON.stringify({
                        itemId,

                        title:
                            details.title,

                        eventDate:
                            details.eventDate,

                        startTime:
                            details.startTime,

                        endTime:
                            details.endTime,

                        location:
                            details.location,

                        locationType:
                            details.locationType,

                        meetingPoint:
                            details.meetingPoint,

                        meetingPointType:
                            details.meetingPointType,

                        meetingTime:
                            details.meetingTime,

                        drinkingStatus:
                            details.drinkingStatus,

                        description:
                            details.description
                    })
            }
        );

    if (!response.ok) {
        throw new Error(
            "Discord item update failed: " +
            response.status
        );
    }

    discordItems =
        await fetchDiscordItems();

    renderDiscordEvents();
}

document
    .getElementById(
        "discord-events"
    )
    .addEventListener(
        "click",
        async event => {

            const button =
                event.target.closest(
                    "[data-discord-event-decision]"
                );

            if (!button) {
                return;
            }


            const itemId =
                Number(
                    button.dataset.itemId
                );

            const status =
                button.dataset
                    .discordEventDecision;


            button
                .closest(
                    ".discord-event-card"
                )
                ?.querySelectorAll(
                    "button"
                )
                .forEach(
                    item =>
                        item.disabled = true
                );


            try {

                await decideDiscordItem(
                    itemId,
                    status
                );

            } catch (error) {

                console.error(error);

                button
                    .closest(
                        ".discord-event-card"
                    )
                    ?.querySelectorAll(
                        "button"
                    )
                    .forEach(
                        item =>
                            item.disabled = false
                    );
            }
        }
    );

document
    .getElementById(
        "discord-events"
    )
    .addEventListener(
        "click",
        event => {

            const editButton =
                event.target.closest(
                    "[data-discord-event-edit]"
                );

            if (editButton) {

                const card =
                    editButton.closest(
                        ".discord-event-card"
                    );

                const form =
                    card?.querySelector(
                        "[data-discord-event-edit-form]"
                    );

                if (!form) {
                    return;
                }


                form.hidden = false;
                editButton.hidden = true;

                return;
            }


            const cancelButton =
                event.target.closest(
                    "[data-discord-event-edit-cancel]"
                );

            if (cancelButton) {

                const card =
                    cancelButton.closest(
                        ".discord-event-card"
                    );

                const form =
                    card?.querySelector(
                        "[data-discord-event-edit-form]"
                    );

                const button =
                    card?.querySelector(
                        "[data-discord-event-edit]"
                    );

                if (!form) {
                    return;
                }


                form.reset();
                form.hidden = true;

                if (button) {
                    button.hidden = false;
                }
            }
        }
    );

document
    .getElementById(
        "discord-events"
    )
    .addEventListener(
        "submit",
        async event => {

            const form =
                event.target.closest(
                    "[data-discord-event-edit-form]"
                );

            if (!form) {
                return;
            }


            event.preventDefault();


            const itemId =
                Number(
                    form.dataset.itemId
                );

            const formData =
                new FormData(
                    form
                );


            form
                .querySelectorAll(
                    "button, input, textarea, select"
                )
                .forEach(
                    element =>
                        element.disabled = true
                );


            try {

                await saveDiscordItemDetails(
                    itemId,
                    {
                        title:
                            formData.get(
                                "title"
                            ),

                        eventDate:
                            formData.get(
                                "eventDate"
                            ),

                        startTime:
                            formData.get(
                                "startTime"
                            ),

                        endTime:
                            formData.get(
                                "endTime"
                            ),

                        location:
                            formData.get(
                                "location"
                            ),

                        locationType:
                            formData.get(
                                "locationType"
                            ),

                        meetingPoint:
                            formData.get(
                                "meetingPoint"
                            ),

                        meetingPointType:
                            formData.get(
                                "meetingPointType"
                            ),

                        meetingTime:
                            formData.get(
                                "meetingTime"
                            ),

                        drinkingStatus:
                            formData.get(
                                "drinkingStatus"
                            ),

                        description:
                            formData.get(
                                "description"
                            )
                    }
                );

            } catch (error) {

                console.error(error);

                form
                    .querySelectorAll(
                        "button, input, textarea, select"
                    )
                    .forEach(
                        element =>
                            element.disabled = false
                    );
            }
        }
    );


document
    .getElementById(
        "rejected-discord-events"
    )
    .addEventListener(
        "click",
        async event => {

            const button =
                event.target.closest(
                    "[data-restore-discord-item]"
                );

            if (!button) {
                return;
            }


            const itemId =
                Number(
                    button.dataset
                        .restoreDiscordItem
                );


            button.disabled = true;


            try {

                await decideDiscordItem(
                    itemId,
                    "candidate"
                );

            } catch (error) {

                console.error(error);

                button.disabled = false;
            }
        }
    );

document
    .getElementById(
        "rejected-discord-sort"
    )
    .addEventListener(
        "change",
        event => {

            rejectedDiscordSort =
                event.target.value;

            renderRejectedDiscordEvents();
        }
    );


function renderDiscordMessages() {

    const container =
        document.getElementById(
            "discord-messages"
        );

    if (!container) {
        return;
    }

    /*
    * Keep the dashboard compact.
    * The API retains the larger history.
    */
    const visibleMessages =
        discordMessages
            .filter(message => DISCORD_CHANNELS[message.channel_id])
            .slice(0, 10);

    if (visibleMessages.length === 0) {

        container.innerHTML = `
            <div class="card">
                <p>No collected messages yet.</p>
            </div>
        `;

        return;
    }

    container.innerHTML =
        visibleMessages
            .map(message => {

                const timestamp = formatDiscordMessageTime(message);
                const source = DISCORD_CHANNELS[message.channel_id];

                return `
                    <div class="card discord-message">

                        <div class="discord-message-header">
                            <img
                                class="discord-society-logo"
                                src="${source.logo}"
                                alt=""
                            >

                            <div class="discord-message-source">
                                <div class="discord-society-name">
                                    ${escapeHtml(source.society)}
                                </div>

                                <div class="discord-channel-name">
                                    #${escapeHtml(source.channel)}
                                </div>
                            </div>
                        </div>

                        <div class="discord-message-content">${escapeHtml(
                            (message.content || "")
                                .replace(/\s*<@&\d+>\s*/g, " ")
                                .replace(/\s*<@!?\d+>\s*/g, " ")
                                .trim()
                        )}</div>

                        ${timestamp
                            ? `<div class="discord-message-meta">${escapeHtml(timestamp)}</div>`
                            : ""}
                    </div>
                `;
            })
            .join("");
}


async function refreshCollector() {

    try {

        const data =
            await fetchCollectorStatus();

        const fetchedDiscordItems =
            await fetchDiscordItems();

        const collections =
            deriveDiscordItemCollections(
                fetchedDiscordItems
            );

        /*
        * Commit all three collections together. If the
        * single canonical-items request fails, the catch
        * path retains the previous internally consistent
        * snapshot rather than mixing new and stale subsets.
        */
        discordItems =
            collections.allItems;

        rejectedDiscordItems =
            collections.rejectedItems;

        acceptedDiscordItems =
            collections.acceptedItems;

        if (!data) {
            collectorHealth = null;
            systemHealth = null;
            systemHealthApiAvailable = false;
            discordMessages = [];

        } else {
            collectorHealth =
                data.health || null;

            systemHealth =
                data.system_health || null;

            systemHealthApiAvailable =
                systemHealth !== null;

            discordMessages =
                data.messages || [];
        }

    } catch (error) {

        console.error(error);

        /*
        * Treat an unreachable status API as
        * offline, but don't erase messages
        * already visible on screen.
        */
        collectorHealth = null;
        systemHealth = null;
        systemHealthApiAvailable = false;
    }

    renderCollectorStatus();
    renderDiscordEvents();
    renderRejectedDiscordEvents();
    renderDiscordMessages();
    renderLiveTravel();
}


const collectorStatusDialog =
    document.getElementById(
        "collector-status-dialog"
    );

const collectorStatusDetails =
    document.getElementById(
        "collector-status-details"
    );


document
    .getElementById(
        "collector-status-button"
    )
    .addEventListener(
        "click",
        () => {

            const state = getCollectorDisplayState();
            const statusLabel = state === "healthy" ? "System healthy"
                : state === "degraded" ? "Degraded · retrying"
                    : state === "blocked" ? "Blocked" : "Health unavailable";
            const components = systemHealth?.components || [];
            const componentRows = components.map(component => {
                const reason = systemHealthReasonLabel(component.reason_code);
                const referenceTime = component.last_success_at || component.last_report_at;
                const metrics = Object.entries(component.metrics || {}).slice(0, 12)
                    .map(([key, value]) => `<div><span>${escapeHtml(key.replaceAll("_", " "))}</span><span>${escapeHtml(String(value))}</span></div>`)
                    .join("");
                return `<details class="system-health-component system-health-${escapeHtml(component.state)}">
                    <summary>
                        <span>${escapeHtml(component.label || "Component")}</span>
                        <span class="system-health-component-state">${escapeHtml(component.state)} · ${escapeHtml(reason)} · ${escapeHtml(formatHealthAge(referenceTime))}</span>
                    </summary>
                    <div class="system-health-detail-grid">
                        <span>Alive</span><span>${component.alive === null ? "Unknown" : component.alive ? "Yes" : "No"}</span>
                        <span>Progress</span><span>${escapeHtml(component.progress || "unknown")}</span>
                        <span>Problem started</span><span>${escapeHtml(formatHealthAge(component.problem_started_at))}</span>
                        <span>Last success</span><span>${escapeHtml(formatHealthAge(component.last_success_at))}</span>
                        <span>Last progress</span><span>${escapeHtml(formatHealthAge(component.last_progress_at))}</span>
                        <span>Retry count</span><span>${escapeHtml(String(component.retry_count || 0))}</span>
                        <span>Automatic recovery</span><span>${component.automatic_recovery ? "Expected" : "No"}</span>
                        <span>Intervention</span><span>${component.intervention_required ? "Required" : "Not required"}</span>
                    </div>
                    ${metrics ? `<div class="system-health-metrics">${metrics}</div>` : ""}
                </details>`;
            }).join("");
            const incidentRows = (systemHealth?.recent_incidents || []).slice(0, 5).map(incident => {
                const opened = parseD1UtcTimestamp(incident.opened_at);
                const resolved = parseD1UtcTimestamp(incident.resolved_at);
                const duration = opened && resolved
                    ? Math.max(0, Math.round((resolved - opened) / 60000)) + "m"
                    : "Unknown";
                return `<div class="system-health-incident">
                    <span>${escapeHtml(incident.label || incident.component_id || "Component")}</span>
                    <span>${escapeHtml(systemHealthReasonLabel(incident.reason_code))} · ${escapeHtml(duration)} · ${escapeHtml(formatHealthAge(incident.resolved_at))}</span>
                </div>`;
            }).join("");

            collectorStatusDetails.innerHTML = `
                <div class="collector-dialog-overall">
                    <span class="collector-status-dot collector-status-${state}"></span>
                    <strong>${escapeHtml(statusLabel)}</strong>
                </div>
                <div class="collector-component-list">
                    ${componentRows || `<div class="system-health-empty">No backend health report is available.</div>`}
                </div>
                <div class="system-health-incidents">
                    <h4>Recently resolved</h4>
                    ${incidentRows || `<div class="system-health-empty">No recent incidents.</div>`}
                </div>
                <div class="collector-last-check">Updated: ${escapeHtml(formatHealthAge(systemHealth?.generated_at))}</div>
            `;
            collectorStatusDialog.showModal();
        }
    );


document
    .getElementById(
        "collector-status-close"
    )
    .addEventListener(
        "click",
        () => {
            collectorStatusDialog.close();
        }
    );


collectorStatusDialog.addEventListener(
    "cancel",
    event => {
        event.preventDefault();
        collectorStatusDialog.close();
    }
);

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
// PENDING GMAIL TASKS
// =========================

async function fetchPendingGmailTasks() {
    if (!session) {
        return [];
    }

    const response = await fetch(
        API + "/gmail/tasks/pending",
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
            `Pending task load failed: ${response.status}`
        );
    }

    const data = await response.json();
    return Array.isArray(data.tasks)
        ? data.tasks
        : [];
}


function pendingGmailTaskDueText(task) {
    if (!task.dueDate) {
        return "";
    }

    const date = new Date(
        task.dueDate + "T12:00:00"
    );
    const formatted = Number.isNaN(date.getTime())
        ? task.dueDate
        : date.toLocaleDateString([], {
            weekday: "short",
            day: "numeric",
            month: "short",
            year: "numeric"
        });

    return task.dueTime
        ? `${formatted} at ${task.dueTime}`
        : formatted;
}


function renderPendingGmailTasks(message = "") {
    const section = document.getElementById(
        "pending-tasks-section"
    );
    const list = document.getElementById(
        "pending-task-list"
    );
    const status = document.getElementById(
        "pending-tasks-status"
    );

    if (!section || !list || !status) {
        return;
    }

    status.textContent = message;
    section.hidden = pendingGmailTasks.length === 0 && !message;

    list.innerHTML = pendingGmailTasks.map(task => {
        const due = pendingGmailTaskDueText(task);
        const links = Array.isArray(task.urls)
            ? task.urls.filter(url =>
                typeof url === "string" &&
                /^https?:\/\//i.test(url)
            )
            : [];

        return `
            <article class="card pending-task-card">
                <div class="pending-task-source">
                    ${escapeHtml(task.sourceLabel || "Psychology email")}
                </div>
                <h3>${escapeHtml(task.title || "Untitled task")}</h3>
                ${task.description ? `
                    <p class="pending-task-description">${escapeHtml(task.description)}</p>
                ` : ""}
                ${due ? `
                    <p class="pending-task-due">
                        <strong>Due:</strong> ${escapeHtml(due)}
                    </p>
                ` : ""}
                ${links.length ? `
                    <div class="pending-task-links">
                        ${links.map((url, index) => `
                            <a
                                href="${escapeHtml(url)}"
                                target="_blank"
                                rel="noopener noreferrer"
                            >Link ${index + 1}</a>
                        `).join("")}
                    </div>
                ` : ""}
                <div class="pending-task-actions">
                    <button
                        type="button"
                        data-pending-task-action="accept"
                        data-candidate-id="${escapeHtml(String(task.candidateId))}"
                    >Accept</button>
                    <button
                        type="button"
                        class="secondary"
                        data-pending-task-action="decline"
                        data-candidate-id="${escapeHtml(String(task.candidateId))}"
                    >Decline</button>
                </div>
            </article>
        `;
    }).join("");
}


async function decidePendingGmailTask(candidateId, action) {
    const response = await fetch(
        `${API}/gmail/tasks/${encodeURIComponent(candidateId)}/${action}`,
        {
            method: "POST",
            headers: {
                Authorization:
                    "Bearer " + session
            }
        }
    );

    if (!response.ok) {
        throw new Error(
            `Pending task ${action} failed: ${response.status}`
        );
    }

    return response.json();
}


async function initialisePendingGmailTasks() {
    try {
        pendingGmailTasks =
            await fetchPendingGmailTasks();
        renderPendingGmailTasks();
    } catch (error) {
        console.error(
            "Pending tasks load failed",
            error
        );
        renderPendingGmailTasks(
            "Pending tasks could not be loaded. Please try again."
        );
    }
}


const pendingTaskList =
    document.getElementById(
        "pending-task-list"
    );

if (pendingTaskList) {
    pendingTaskList.addEventListener(
        "click",
        async event => {
            const button = event.target.closest(
                "[data-pending-task-action]"
            );
            if (!button || button.disabled) {
                return;
            }

            const candidateId =
                button.dataset.candidateId;
            const action =
                button.dataset.pendingTaskAction;
            if (!candidateId || ![
                "accept",
                "decline"
            ].includes(action)) {
                return;
            }

            const card = button.closest(
                ".pending-task-card"
            );
            const buttons = card
                ? card.querySelectorAll("button")
                : [button];
            buttons.forEach(item => {
                item.disabled = true;
            });

            try {
                await decidePendingGmailTask(
                    candidateId,
                    action
                );
                pendingGmailTasks =
                    pendingGmailTasks.filter(task =>
                        String(task.candidateId) !==
                            String(candidateId)
                    );
                renderPendingGmailTasks(
                    action === "accept"
                        ? "Task accepted."
                        : "Task declined."
                );

                if (action === "accept") {
                    try {
                        tasks = await fetchTasks();
                        renderTasks();
                    } catch (error) {
                        console.error(
                            "Accepted task list refresh failed",
                            error
                        );
                        renderPendingGmailTasks(
                            "Task accepted, but the task list could not be refreshed."
                        );
                    }
                }
            } catch (error) {
                console.error(
                    "Pending task decision failed",
                    error
                );
                renderPendingGmailTasks(
                    "That change could not be saved. Please try again."
                );
            }
        }
    );
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
// UNDO LAUNDRY START
// =========================

async function undoStartLaundryTask(id) {

    const task =
        tasks.find(
            task => task.id === id
        );


    if (
        !task ||
        !isLaundryTask(task) ||
        task.laundryState !==
            "in-progress"
    ) {
        return;
    }


    const oldTasks =
        JSON.parse(
            JSON.stringify(tasks)
        );


    /*
     * Reverse an accidental
     * "Start laundry".
     *
     * This does NOT complete the task,
     * alter recurrence, or affect
     * lastCompleted.
     */
    task.laundryState =
        null;

    task.laundryStartedAt =
        null;


    try {

        await saveTasks();

        renderTasks();

    } catch (error) {

        tasks = oldTasks;

        console.error(error);

        alert(
            "Laundry start could not be undone."
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
                                task.laundryState === "in-progress"
                            )
                                ? `
                                    <button
                                        onclick="
                                            this.closest('details').removeAttribute('open');
                                            undoStartLaundryTask('${task.id}');
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
                                            Undo start
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

                    <div class="calendar-setting-controls">

                        <label class="calendar-setting-field">

                            <span class="calendar-setting-label">
                                Behaviour
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

                        </label>


                        <label class="calendar-setting-field">

                            <span class="calendar-setting-label">
                                Event type
                            </span>

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

                        </label>


                        <label
                            class="calendar-displaceable-option"
                            ${role !== "fixed" ? "hidden" : ""}
                        >

                            <span>
                                Scheduler may skip events
                            </span>

                            <input
                                type="checkbox"
                                class="calendar-displaceable"
                                data-calendar-id="${escapeHtml(calendar.id)}"
                                ${displaceable ? "checked" : ""}
                            >

                            <span
                                class="calendar-toggle"
                                aria-hidden="true"
                            ></span>

                        </label>

                    </div>

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


        calendarEvents =
            data.items || [];


        const connectGoogleButton =
            document.getElementById(
                "connect-google"
            );

        if (connectGoogleButton) {
            connectGoogleButton.hidden = true;
        }


        calendarSettings =
            await fetchCalendarSettings();


        calendarData =
            (data.calendars || [])
                .slice()
                .sort(
                    (a, b) =>
                        a.name.localeCompare(
                            b.name
                        )
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
initialisePendingGmailTasks();
loadCalendar();
loadSchedulerSettings();
refreshCollector();

/*
* Heartbeat itself arrives every 30 seconds,
* so checking the dashboard every 30 seconds
* keeps the dot current without excessive
* requests.
*/
setInterval(
    refreshCollector,
    30 * 1000
);


// =========================
// SERVICE WORKER
// =========================

if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register(
        "service-worker.js"
    );
}

const openAcceptedEventsButton =
    document.getElementById(
        "open-accepted-events"
    );

const closeAcceptedEventsButton =
    document.getElementById(
        "close-accepted-events"
    );

const acceptedEventsView =
    document.getElementById(
        "accepted-events-view"
    );


if (
    openAcceptedEventsButton &&
    acceptedEventsView &&
    dashboardView
) {
    openAcceptedEventsButton.addEventListener(
        "click",
        async () => {

            acceptedEventsView.hidden =
                false;

            dashboardView.hidden =
                true;

            try {
                acceptedDiscordItems =
                    await fetchAcceptedDiscordItems();

                renderAcceptedDiscordEvents();

            } catch (error) {
                console.error(
                    "Accepted events load failed",
                    error
                );
            }
        }
    );
}

document.addEventListener(
    "click",
    event => {

        const button =
            event.target.closest(
                ".discord-original-announcement-toggle"
            );

        if (!button) {
            return;
        }

        const card =
            button.closest(
                ".discord-event-card"
            );

        if (!card) {
            return;
        }

        const messages =
            card.querySelector(
                ".discord-original-announcement-messages"
            );

        if (!messages) {
            return;
        }

        const opening =
            messages.hidden;

        messages.hidden =
            !opening;

        button.classList.toggle(
            "open",
            opening
        );
    }
);

document
    .getElementById(
        "accepted-discord-events"
    )
    .addEventListener(
        "click",
        async event => {

            const button =
                event.target.closest(
                    "[data-no-longer-going]"
                );

            if (!button) {
                return;
            }

            const itemId =
                Number(
                    button.dataset.itemId
                );

            if (
                !Number.isInteger(itemId) ||
                itemId <= 0
            ) {
                return;
            }

            button.disabled = true;

            try {

                await decideDiscordItem(
                    itemId,
                    "rejected"
                );

                acceptedDiscordItems =
                    await fetchAcceptedDiscordItems();

                renderAcceptedDiscordEvents();

            } catch (error) {

                console.error(
                    "Accepted event withdrawal failed",
                    error
                );

                button.disabled = false;
            }
        }
    );

if (
    closeAcceptedEventsButton &&
    acceptedEventsView &&
    dashboardView
) {
    closeAcceptedEventsButton.addEventListener(
        "click",
        () => {

            acceptedEventsView.hidden =
                true;

            dashboardView.hidden =
                false;
        }
    );
}
