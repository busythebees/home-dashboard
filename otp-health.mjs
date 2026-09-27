import {randomUUID} from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export const OTP_GRAPHQL_URL = "http://127.0.0.1:8080/otp/gtfs/v1";
export const OTP_PROBE_TIMEOUT_MS = 30_000;
export const OTP_HEALTHY_INTERVAL_MS = 5 * 60_000;
export const OTP_STALE_MS = 10 * 60_000;
export const OTP_FAILURE_DELAYS_MS = [30_000, 60_000, 120_000, 300_000];
export const OTP_STATE_MAX_BYTES = 16 * 1024;
export const OTP_REPORTED_TIMESTAMP_MAX_AGE_MS = 30 * 24 * 60 * 60_000;
export const OTP_HEALTH_STATE_PATH = path.join(
    process.env.HOME || "", ".config/otp-health.json"
);

const FAILURE_REASONS = new Set([
    "otp-unreachable", "otp-timeout", "otp-http-error",
    "otp-invalid-response", "otp-routing-failed"
]);
const TRANSIT_MODES = new Set([
    "AIRPLANE", "BUS", "CABLE_CAR", "CARPOOL", "COACH", "FERRY",
    "FLEX", "FLEXIBLE", "FUNICULAR", "GONDOLA", "MONORAIL", "RAIL",
    "SNOW_AND_ICE", "SUBWAY", "TAXI", "TRAM", "TROLLEYBUS", "TRANSIT"
]);

const PLAN_QUERY = `
query AlsOtpHealth(
  $origin: PlanLabeledLocationInput!
  $destination: PlanLabeledLocationInput!
  $dateTime: PlanDateTimeInput!
  $modes: PlanModesInput!
  $searchWindow: Duration!
) {
  planConnection(
    origin: $origin
    destination: $destination
    dateTime: $dateTime
    modes: $modes
    searchWindow: $searchWindow
    first: 1
  ) {
    routingErrors { code }
    edges {
      node {
        duration
        legs { duration mode transitLeg }
      }
    }
  }
}`;

function finiteCoordinate(value, minimum, maximum) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum
        ? parsed : null;
}

export function readOtpHealthConfig(env = process.env) {
    const originLatitude = finiteCoordinate(env.OTP_HEALTH_ORIGIN_LATITUDE, -90, 90);
    const originLongitude = finiteCoordinate(env.OTP_HEALTH_ORIGIN_LONGITUDE, -180, 180);
    const destinationLatitude = finiteCoordinate(env.OTP_HEALTH_DESTINATION_LATITUDE, -90, 90);
    const destinationLongitude = finiteCoordinate(env.OTP_HEALTH_DESTINATION_LONGITUDE, -180, 180);
    const referenceHour = Number(env.OTP_HEALTH_REFERENCE_HOUR_UTC ?? 12);
    const endpoint = typeof env.OTP_GRAPHQL_URL === "string" && env.OTP_GRAPHQL_URL.trim()
        ? env.OTP_GRAPHQL_URL.trim() : OTP_GRAPHQL_URL;

    if ([originLatitude, originLongitude, destinationLatitude, destinationLongitude].includes(null) ||
        !Number.isInteger(referenceHour) || referenceHour < 0 || referenceHour > 23 ||
        (originLatitude === destinationLatitude && originLongitude === destinationLongitude)) {
        return null;
    }
    try {
        const parsed = new URL(endpoint);
        if (parsed.protocol !== "http:" || parsed.hostname !== "127.0.0.1" || parsed.port !== "8080" ||
            parsed.pathname !== "/otp/gtfs/v1" || parsed.username || parsed.password || parsed.search || parsed.hash) {
            return null;
        }
    } catch {
        return null;
    }
    return {
        endpoint,
        origin: {latitude: originLatitude, longitude: originLongitude},
        destination: {latitude: destinationLatitude, longitude: destinationLongitude},
        referenceHour
    };
}

export function nextOtpReferenceDateTime(now, referenceHour = 12) {
    const value = now instanceof Date ? now : new Date(now);
    const target = new Date(Date.UTC(
        value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate(), referenceHour, 0, 0
    ));
    if (target.getTime() <= value.getTime() + 60 * 60_000) {
        target.setUTCDate(target.getUTCDate() + 1);
    }
    return target.toISOString();
}

export function makeOtpPlanRequest(config, now = new Date()) {
    const location = coordinate => ({
        label: "ALS health reference",
        location: {coordinate}
    });
    return {
        operationName: "AlsOtpHealth",
        query: PLAN_QUERY,
        variables: {
            origin: location(config.origin),
            destination: location(config.destination),
            dateTime: {latestArrival: nextOtpReferenceDateTime(now, config.referenceHour)},
            modes: {
                transitOnly: true,
                transit: {access: ["WALK"], egress: ["WALK"], transfer: ["WALK"]}
            },
            searchWindow: "PT2H"
        }
    };
}

function validateOtpPlanResponse(value) {
    if (typeof value !== "object" || value === null || Array.isArray(value) ||
        ("errors" in value && (!Array.isArray(value.errors) || value.errors.length > 0))) {
        return "otp-invalid-response";
    }
    const plan = value.data?.planConnection;
    if (typeof plan !== "object" || plan === null || !Array.isArray(plan.routingErrors) ||
        !Array.isArray(plan.edges)) {
        return "otp-invalid-response";
    }
    if (plan.routingErrors.length > 0 || plan.edges.length < 1) return "otp-routing-failed";
    const itinerary = plan.edges[0]?.node;
    if (typeof itinerary !== "object" || itinerary === null ||
        !Number.isFinite(itinerary.duration) || itinerary.duration <= 0 ||
        !Array.isArray(itinerary.legs) || itinerary.legs.length < 1) {
        return "otp-invalid-response";
    }
    let hasTransitLeg = false;
    for (const leg of itinerary.legs) {
        if (typeof leg !== "object" || leg === null || !Number.isFinite(leg.duration) ||
            leg.duration < 0 || typeof leg.mode !== "string" || typeof leg.transitLeg !== "boolean") {
            return "otp-invalid-response";
        }
        if (leg.transitLeg && TRANSIT_MODES.has(leg.mode)) hasTransitLeg = true;
    }
    return hasTransitLeg ? null : "otp-routing-failed";
}

export async function probeOtp(config, options = {}) {
    const fetchImpl = options.fetchImpl ?? fetch;
    const now = options.now ?? new Date();
    const timeoutMs = options.timeoutMs ?? OTP_PROBE_TIMEOUT_MS;
    const startedAt = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetchImpl(config.endpoint, {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify(makeOtpPlanRequest(config, now)),
            signal: controller.signal
        });
        const responseTimeMs = Math.max(0, Date.now() - startedAt);
        if (!response.ok) {
            return {ok: false, reason: "otp-http-error", httpStatus: response.status,
                responseTimeMs};
        }
        let value;
        try {
            value = await response.json();
	    console.log("OTP RAW RESPONSE:", JSON.stringify(value, null, 2));
        } catch {
            return {ok: false, reason: "otp-invalid-response", httpStatus: response.status,
                responseTimeMs};
        }
        const reason = validateOtpPlanResponse(value);
        return reason
            ? {ok: false, reason, httpStatus: response.status, responseTimeMs}
            : {ok: true, reason: null, httpStatus: response.status, responseTimeMs};
    } catch (error) {
        const reason = controller.signal.aborted || error?.name === "AbortError"
            ? "otp-timeout" : "otp-unreachable";
        return {ok: false, reason, httpStatus: null,
            responseTimeMs: Math.max(0, Date.now() - startedAt)};
    } finally {
        clearTimeout(timer);
    }
}

function validTimestamp(value) {
    return typeof value === "string" && value.length <= 40 && Number.isFinite(Date.parse(value))
        ? new Date(value).toISOString() : null;
}

async function readState(filePath, fileSystem) {
    try {
        const details = await fileSystem.stat(filePath);
        if (!details.isFile() || details.size > OTP_STATE_MAX_BYTES) return null;
        const text = await fileSystem.readFile(filePath, "utf8");
        if (Buffer.byteLength(text) > OTP_STATE_MAX_BYTES) return null;
        const value = JSON.parse(text);
        if (value?.schema_version !== 1 ||
            (value.last_failure_code !== null && !FAILURE_REASONS.has(value.last_failure_code)) ||
            !Number.isSafeInteger(value.consecutive_failures) || value.consecutive_failures < 0 ||
            typeof value.route_valid !== "boolean") return null;
        return {
            last_check_at: validTimestamp(value.last_check_at),
            last_success_at: validTimestamp(value.last_success_at),
            problem_started_at: validTimestamp(value.problem_started_at),
            consecutive_failures: value.consecutive_failures,
            last_failure_code: value.last_failure_code,
            last_failure_http_status: Number.isInteger(value.last_failure_http_status) &&
                value.last_failure_http_status >= 100 && value.last_failure_http_status <= 599
                ? value.last_failure_http_status : null,
            response_time_ms: Number.isFinite(value.response_time_ms) && value.response_time_ms >= 0
                ? Math.min(value.response_time_ms, 1_000_000_000) : 0,
            route_valid: value.route_valid
        };
    } catch {
        return null;
    }
}

async function writeState(filePath, value, fileSystem) {
    const text = JSON.stringify({schema_version: 1, ...value});
    if (Buffer.byteLength(text) > OTP_STATE_MAX_BYTES) return;
    const directory = path.dirname(filePath);
    const temporary = `${filePath}.tmp-${process.pid}-${randomUUID()}`;
    try {
        await fileSystem.mkdir(directory, {recursive: true, mode: 0o700});
        await fileSystem.writeFile(temporary, text, {encoding: "utf8", mode: 0o600, flag: "wx"});
        await fileSystem.rename(temporary, filePath);
    } catch {
        try { await fileSystem.unlink(temporary); } catch {}
    }
}

function ageSeconds(timestamp, nowMs, fallbackTimestamp) {
    const parsed = Date.parse(timestamp || fallbackTimestamp || "");
    return Number.isFinite(parsed) ? Math.min(1_000_000_000,
        Math.max(0, (nowMs - parsed) / 1000)) : 0;
}

function reportedTimestamp(value, nowMs) {
    const parsed = Date.parse(value || "");
    return Number.isFinite(parsed) && parsed <= nowMs + 5 * 60_000 &&
        parsed >= nowMs - OTP_REPORTED_TIMESTAMP_MAX_AGE_MS
        ? new Date(parsed).toISOString() : null;
}

export function createOtpHealthMonitor(options = {}) {
    const config = options.config === undefined
        ? readOtpHealthConfig(options.env ?? process.env) : options.config;
    const fetchImpl = options.fetchImpl ?? fetch;
    const fileSystem = options.fileSystem ?? fs;
    const statePath = options.statePath ?? OTP_HEALTH_STATE_PATH;
    const clock = options.clock ?? (() => new Date());
    const timeoutMs = options.timeoutMs ?? OTP_PROBE_TIMEOUT_MS;
    const startedAt = clock().toISOString();
    let initialized = false;
    let nextProbeAt = 0;
    let inFlight = null;
    let state = {
        last_check_at: null, last_success_at: null, problem_started_at: null,
        consecutive_failures: 0, last_failure_code: null,
        last_failure_http_status: null, response_time_ms: 0, route_valid: false
    };

    async function initialize() {
        if (initialized) return;
        initialized = true;
        const stored = await readState(statePath, fileSystem);
        if (stored) state = stored;
        nextProbeAt = 0;
    }

    async function runProbe(now) {
        const result = await probeOtp(config, {fetchImpl, now, timeoutMs});
        const checkedAt = now.toISOString();
        state.last_check_at = checkedAt;
        state.response_time_ms = result.responseTimeMs;
        state.route_valid = result.ok;
        if (result.ok) {
            state.last_success_at = checkedAt;
            state.problem_started_at = null;
            state.consecutive_failures = 0;
            state.last_failure_code = null;
            state.last_failure_http_status = null;
            nextProbeAt = now.getTime() + OTP_HEALTHY_INTERVAL_MS;
        } else {
            if (!state.problem_started_at) state.problem_started_at = checkedAt;
            state.consecutive_failures = Math.min(1_000_000, state.consecutive_failures + 1);
            state.last_failure_code = result.reason;
            state.last_failure_http_status = result.httpStatus;
            const delay = OTP_FAILURE_DELAYS_MS[
                Math.min(state.consecutive_failures - 1, OTP_FAILURE_DELAYS_MS.length - 1)
            ];
            nextProbeAt = now.getTime() + delay;
        }
        await writeState(statePath, state, fileSystem);
    }

    function component(now) {
        if (!config) return makeOtpNotConfiguredComponent(now);
        const nowMs = now.getTime();
        const lastSuccessAge = ageSeconds(state.last_success_at, nowMs,
            state.problem_started_at || startedAt);
        const checkAge = ageSeconds(state.last_check_at, nowMs, startedAt);
        const stale = lastSuccessAge >= OTP_STALE_MS / 1000;
        const reason = stale ? "otp-check-stale" : state.last_failure_code;
        const alive = state.route_valid && !stale;
        const lastSuccessAt = reportedTimestamp(state.last_success_at, nowMs);
        const lastCheckAt = reportedTimestamp(state.last_check_at, nowMs);
        return {
            id: "opentripplanner",
            alive,
            progress: alive ? "active" : "retrying",
            retrying: !alive,
            reason_code: reason,
            problem_started_at: alive ? null :
                (reportedTimestamp(state.problem_started_at, nowMs) || now.toISOString()),
            last_success_at: lastSuccessAt,
            last_progress_at: lastSuccessAt,
            retry_count: state.consecutive_failures,
            last_failure: state.last_failure_code && lastCheckAt ? {
                at: lastCheckAt,
                code: state.last_failure_code,
                http_status: state.last_failure_http_status
            } : null,
            metrics: {
                otp_response_time_ms: state.response_time_ms,
                otp_last_success_age_seconds: lastSuccessAge,
                otp_check_age_seconds: checkAge,
                otp_consecutive_failures: state.consecutive_failures,
                otp_route_valid: state.route_valid
            }
        };
    }

    return {
        async sample(nowValue = clock()) {
            await initialize();
            const now = nowValue instanceof Date ? nowValue : new Date(nowValue);
            if (!config) return makeOtpNotConfiguredComponent(now);
            if (now.getTime() >= nextProbeAt) {
                if (!inFlight) inFlight = runProbe(now).finally(() => { inFlight = null; });
                await inFlight;
            }
            return component(now);
        }
    };
}

export function makeOtpNotConfiguredComponent(nowValue = new Date()) {
    const now = nowValue instanceof Date ? nowValue : new Date(nowValue);
    const timestamp = now.toISOString();
    return {
        id: "opentripplanner", alive: false, progress: "blocked", retrying: false,
        reason_code: "otp-not-configured", problem_started_at: timestamp,
        last_success_at: null, last_progress_at: null, retry_count: 0,
        last_failure: null,
        metrics: {
            otp_response_time_ms: 0, otp_last_success_age_seconds: 0,
            otp_check_age_seconds: 0, otp_consecutive_failures: 0,
            otp_route_valid: false
        }
    };
}
