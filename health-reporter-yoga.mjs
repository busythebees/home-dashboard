import {execFile as execFileCallback} from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {promisify} from "node:util";

export const REPORT_INTERVAL_MS = 30_000;
export const OTP_HEALTH_URL = "http://127.0.0.1:8080/otp/";
export const LOCAL_HEALTH_MAX_BYTES = 64 * 1024;
export const LOCAL_HEALTH_STALE_MS = 90_000;
export const COLLECTOR_HEALTH_PATH = path.join(
    process.env.HOME || "", ".config/vesktop/MessageLoggerData/collector-health.json"
);
export const FORWARDER_HEALTH_PATH = path.join(
    process.env.HOME || "", ".config/discord-forwarder-health.json"
);

const execFile = promisify(execFileCallback);
const ALLOWED_REASONS = new Set([
    "outbox-backlog", "outbox-pressure", "outbox-full", "outbox-enqueue-rejected",
    "outbox-corrupt", "outbox-no-progress", "network-error", "request-timeout",
    "bridge-retryable-response", "cloudflare-retryable-response", "concurrent-edit",
    "invalid-bridge-response", "retryable-error", "cursor-expired", "missing-forwarder-state",
    "malformed-forwarder-state", "unreadable-forwarder-state",
    "interrupted-forwarder-state-write", "invalid-forwarder-state-write",
    "invalid-forwarder-cursor", "invalid-initial-cursor",
    "unsupported-forwarder-state-version", "invalid-forwarder-marker",
    "malformed-forwarder-marker", "unreadable-forwarder-marker",
    "invalid-forwarder-marker-write", "unreadable-forwarder-state-directory",
    "unsupported-forwarder-marker-version", "contradictory-forwarder-state",
    "interrupted-forwarder-initialization", "forwarder-initialization-required",
    "bridge-permanent-response", "cloudflare-permanent-response",
    "structured-content-too-large", "forwarding-blocked", "collector-unavailable",
    "vesktop-unavailable", "bridge-unavailable", "bridge-poll-failed",
    "forwarder-unavailable", "vpn-unavailable"
]);

function isoOrNull(value) {
    if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return null;
    return new Date(value).toISOString();
}

function boundedReason(value, fallback = null) {
    return typeof value === "string" && ALLOWED_REASONS.has(value) ? value : fallback;
}

function nonnegative(value, fallback = 0) {
    return typeof value === "number" && Number.isFinite(value) && value >= 0
        ? Math.min(value, 1_000_000_000) : fallback;
}

export async function readBoundedJson(filePath, fileSystem = fs) {
    try {
        const details = await fileSystem.stat(filePath);
        if (!details.isFile() || details.size > LOCAL_HEALTH_MAX_BYTES) return null;
        const text = await fileSystem.readFile(filePath, "utf8");
        if (Buffer.byteLength(text) > LOCAL_HEALTH_MAX_BYTES) return null;
        const value = JSON.parse(text);
        return typeof value === "object" && value !== null && !Array.isArray(value) ? value : null;
    } catch {
        return null;
    }
}

async function commandSucceeds(command, args, exec = execFile) {
    try {
        await exec(command, args, {timeout: 5_000, windowsHide: true});
        return true;
    } catch {
        return false;
    }
}

export async function inspectProcesses(exec = execFile) {
    const [vesktop, forwarder, vpn] = await Promise.all([
        commandSucceeds("pgrep", ["-x", "vesktop"], exec),
        commandSucceeds("pgrep", ["-f", "discord-forwarder/forwarder.mjs"], exec),
        commandSucceeds("nmcli", ["-t", "-f", "NAME,TYPE", "connection", "show", "--active"],
            async (...args) => {
                try {
                    const result = await exec(...args);
                    if (!/(^|\n)protonwg\d*:wireguard(\n|$)/.test(result.stdout || "")) throw new Error("inactive");
                    return result;
                } catch (error) { throw error; }
            })
    ]);
    return {vesktop, forwarder, vpn};
}

export async function readBridgeHealth(fetchImpl = fetch, bridgeUrl = "http://127.0.0.1:17891") {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5_000);
    try {
        const response = await fetchImpl(`${bridgeUrl}/v1/health`, {signal: controller.signal});
        if (!response.ok) return null;
        const value = await response.json();
        return typeof value === "object" && value !== null ? value : null;
    } catch {
        return null;
    } finally {
        clearTimeout(timer);
    }
}

export async fuction readOtpHealth(fetchImpl = fetch, otpUrl = "http://127.0.0.1:8080/otp/") {

const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), 5_000);

try {
    const response = await fetchImpl(otpUrl, {
	signal: controller.signal
    });

    return {
	alive: response.ok,
	status: response.status
    };
} catch {
    return {
	alive: false,
	status: null
    };
} finally {
    clearTimeout(timer);
}
}

function baseComponent(id, alive, reason, now) {
    return {
        id, alive, progress: alive ? "active" : "unknown", retrying: false,
        reason_code: reason, problem_started_at: reason ? now : null,
        last_success_at: alive ? now : null, last_progress_at: alive ? now : null,
        retry_count: 0, last_failure: null, metrics: {}
    };
}

export function buildHealthReport({collector, forwarder, bridge, processes, otp, now = new Date(), problemStarts = new Map()}) {
    const observedAt = now.toISOString();
    function reportTimestamp(value) {
        const normalized = isoOrNull(value);
        if (!normalized) return null;
        const age = now.getTime() - Date.parse(normalized);
        return age < -5 * 60_000 || age > 31 * 24 * 60 * 60_000 ? null : normalized;
    }
    function problemStart(id, reason, supplied = null) {
        if (!reason) {
            problemStarts.delete(id);
            return null;
        }
        const existing = reportTimestamp(supplied) || reportTimestamp(problemStarts.get(id)) || observedAt;
        problemStarts.set(id, existing);
        return existing;
    }
    const collectorReportedAt = reportTimestamp(collector?.reported_at);
    const collectorFresh = collectorReportedAt !== null &&
        now.getTime() - Date.parse(collectorReportedAt) <= LOCAL_HEALTH_STALE_MS;
    const collectorAlive = processes.vesktop && collectorFresh && collector?.alive !== false;
    const oldestPendingAt = isoOrNull(collector?.oldest_pending_at);
    const collectorComponent = {
        ...baseComponent("vesktop-collector", collectorAlive,
            collectorAlive ? boundedReason(collector?.reason_code) :
                (processes.vesktop ? "collector-unavailable" : "vesktop-unavailable"), observedAt),
        progress: Number(collector?.outbox_entry_count || 0) > 0 ? "retrying" : (collectorAlive ? "idle" : "unknown"),
        retrying: Number(collector?.outbox_entry_count || 0) > 0,
        problem_started_at: problemStart("vesktop-collector",
            collectorAlive ? boundedReason(collector?.reason_code) : "collector-unavailable", collectorReportedAt),
        last_success_at: collectorReportedAt,
        last_progress_at: reportTimestamp(collector?.last_successful_drain_at),
        metrics: {
            process_running: processes.vesktop,
            outbox_entry_count: nonnegative(collector?.outbox_entry_count),
            outbox_byte_usage: nonnegative(collector?.outbox_byte_usage),
            outbox_entry_capacity_percent: nonnegative(collector?.outbox_entry_capacity_percent),
            outbox_byte_capacity_percent: nonnegative(collector?.outbox_byte_capacity_percent),
            oldest_pending_age_seconds: oldestPendingAt
                ? Math.max(0, (now.getTime() - Date.parse(oldestPendingAt)) / 1000) : 0
        }
    };

    const bridgeAlive = bridge?.status === "ok";
    const bridgeComponent = {
        ...baseComponent("discord-bridge", bridgeAlive,
            bridgeAlive ? null : "bridge-unavailable", observedAt),
        retrying: !bridgeAlive && Number(bridge?.consecutive_poll_errors || 0) > 0,
        progress: bridgeAlive ? "active" : "retrying",
        problem_started_at: problemStart("discord-bridge", bridgeAlive ? null : "bridge-unavailable"),
        metrics: {
            bridge_consecutive_poll_errors: nonnegative(bridge?.consecutive_poll_errors),
            bridge_last_successful_poll_age_seconds: nonnegative(bridge?.last_successful_poll_age_ms) / 1000,
            bridge_last_read_progress_age_seconds: nonnegative(bridge?.last_read_progress_age_ms) / 1000
        }
    };

    const forwarderReportedAt = reportTimestamp(forwarder?.reported_at);
    const forwarderFresh = forwarderReportedAt !== null &&
        now.getTime() - Date.parse(forwarderReportedAt) <= LOCAL_HEALTH_STALE_MS;
    const forwarderAlive = processes.forwarder && forwarderFresh && forwarder?.alive !== false;
    const forwarderReason = forwarderAlive ? boundedReason(forwarder?.reason_code) :
        (processes.forwarder ? "missing-forwarder-state" : "forwarder-unavailable");
    const failureAt = reportTimestamp(forwarder?.last_failure?.at);
    const failureCode = boundedReason(forwarder?.last_failure?.code);
    const lastCursorAdvancedAt = isoOrNull(forwarder?.last_cursor_advanced_at);
    const forwarderComponent = {
        ...baseComponent("discord-forwarder", forwarderAlive, forwarderReason, observedAt),
        progress: ["active", "idle", "retrying", "blocked"].includes(forwarder?.progress)
            ? forwarder.progress : (forwarderAlive ? "idle" : "unknown"),
        retrying: forwarder?.retrying === true,
        problem_started_at: problemStart("discord-forwarder", forwarderReason, forwarder?.problem_started_at),
        last_success_at: reportTimestamp(forwarder?.last_success_at),
        last_progress_at: reportTimestamp(forwarder?.last_progress_at),
        retry_count: Math.floor(nonnegative(forwarder?.retry_count)),
        last_failure: failureAt && failureCode ? {
            at: failureAt, code: failureCode,
            http_status: Number.isInteger(forwarder?.last_failure?.http_status)
                ? forwarder.last_failure.http_status : null
        } : null,
        metrics: {cursor_advanced_age_seconds: lastCursorAdvancedAt
            ? Math.max(0, (now.getTime() - Date.parse(lastCursorAdvancedAt)) / 1000) : 0,
            process_running: processes.forwarder}
    };

const otpAlive = otp?.alive === true;

const otpComponent = {
    ...baseComponent(
	"opentripplanner",
	otpAlive,
	otpAlive ? null : "opentripplanner-unavailable",
	observedAt
    ),
    problem_started_at: problemStart(
	"opentripplanner",
	otpAlive ? null : "opentripplanner-unavailable"
    ),
    metrics: {
	http_status: otp?.status ?? null
    }
};
    return {
        schema_version: 2,
        observed_at: observedAt,
        components: [
            {...baseComponent("yoga-connectivity", processes.vpn,
                processes.vpn ? null : "vpn-unavailable", observedAt),
                problem_started_at: problemStart("yoga-connectivity", processes.vpn ? null : "vpn-unavailable"),
                metrics: {vpn_connected: processes.vpn}},
            collectorComponent,
            bridgeComponent,
            forwarderComponent,
	    otpComponent
        ]
    };
}

export async function reportOnce(options = {}) {
    const fileSystem = options.fileSystem ?? fs;
    const fetchImpl = options.fetchImpl ?? fetch;
    const [collector, forwarder, bridge, processes, otp] = await Promise.all([
        readBoundedJson(options.collectorHealthPath ?? COLLECTOR_HEALTH_PATH, fileSystem),
        readBoundedJson(options.forwarderHealthPath ?? FORWARDER_HEALTH_PATH, fileSystem),
        readBridgeHealth(fetchImpl, options.bridgeUrl),
        (options.inspectProcesses ?? inspectProcesses)(),
	readOtpHealth(fetchImpl, options.otpUrl)
    ]);
    const report = buildHealthReport({collector, forwarder, bridge, processes, otp,
        now: options.now ?? new Date(), problemStarts: options.problemStarts});
    if (!processes.vpn) return {sent: false, report};
    const response = await fetchImpl(`${options.cloudflareUrl}/collector/heartbeat`, {
        method: "POST",
        headers: {Authorization: `Bearer ${options.collectorToken}`, "Content-Type": "application/json"},
        body: JSON.stringify(report)
    });
    if (!response.ok) throw new Error(`health-report-http-${response.status}`);
    return {sent: true, report};
}

export async function run(options = {}) {
    const logger = options.logger ?? console;
    const sleep = options.sleep ?? (milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)));
    const problemStarts = options.problemStarts ?? new Map();
    while (true) {
        try {
            await reportOnce({...options, problemStarts});
        } catch (error) {
            logger.error(new Date().toISOString(), "Health report failed:",
                error instanceof Error ? error.message : String(error));
        }
        await sleep(REPORT_INTERVAL_MS);
    }
}

export async function main() {
    await run({
        cloudflareUrl: process.env.CLOUDFLARE_URL,
        collectorToken: process.env.COLLECTOR_TOKEN
    });
}

const mainPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (mainPath === import.meta.url) await main();
