# 00 — Repository State

**Audit date:** 2026-05-21
**Auditor:** Claude Sonnet 4.6 (Claude Code)

---

## Git state

| Item | Value |
|------|-------|
| Branch | professionalization-plan |
| Latest local commit | f630cb1 — Update status files with latest commit hash |
| Latest remote commit | f630cb1 (up to date with origin) |
| Working tree | Clean (3 untracked: .claude/, UMS_CLAUDE_SHIPPING_EXECUTION_PLAN.md, firmware/ups_monitor/build/) |

## Git log (last 15 commits)

```
f630cb1 Update status files with latest commit hash
9aaadc6 Remove browser MQTT, fix publish interval, add secret guard, update status files
9bbc9b7 Fix blockers 2/4/5/6/7: alarm engine, fleet page, mosquitto, Dockerfile, burn-in
4f396f1 chore: add agent status report
7a5c0ec Add calibration guide and release package (Phases H + I)
01a50b5 Harden dashboard authentication defaults
fda4611 feat(alarms): configurable alarm rule overrides with scope resolution
214d349 feat(dashboard): show commissioning status in UPS detail page
0602b85 fix(rollup): correct timezone mismatch in 1-minute rollup query
7883ecc Fix firmware v0.5.2: AP SSID first-boot bug + hardware verified
3939e56 Fix firmware AP fallback behavior and compile v0.5.1
0e8ef6c Fix firmware commissioning AP fallback and compile verification
87f1601 Add firmware commissioning portal for WiFi MQTT and identity setup
47cfc65 Add production migrations rollups and retention jobs
dfef97c Track .env.example and unblock it from .gitignore
```

## Environment

| Item | Value |
|------|-------|
| OS | Windows 10 Pro 10.0.19045 |
| Node.js | v24.15.0 |
| npm | 11.12.1 |
| Docker | NOT INSTALLED |
| PostgreSQL (localhost:5432) | RUNNING |
| MQTT broker (localhost:1883) | RUNNING (Mosquitto) |
| Dashboard (localhost:3000) | RUNNING (Next.js dev) |
| ESP32 board | CONNECTED — DEV-COM11-TEST at 192.168.0.110, firmware 0.5.2, RSSI -54 dBm |

## API health check

```
GET http://localhost:3000/api/health
Response: {"status":"ok","uptime":90173,"dbEnabled":true,"db":"connected"}
```

## Live devices

| Device ID | UPS ID | IP | Firmware | Online | Last seen |
|-----------|--------|----|----------|--------|-----------|
| DEV-COM11-TEST | UPS-COM11-TEST | 192.168.0.110 | 0.5.2 | true | 2026-05-21T13:47:37Z |
| DEV-LOCAL-01 | UPSMON-01 | — | — | false | 2026-05-20T14:29:12Z |
