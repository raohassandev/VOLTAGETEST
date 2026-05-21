# Screenshot Index

Generated: 2026-05-21T13:50:50.331Z
Base URL: http://localhost:3000
Viewports: desktop-1920x1080, laptop-1366x768, tablet-768x1024, mobile-390x844

| Screen | Route | Desktop | Laptop | Tablet | Mobile | Visual status | Notes |
|--------|-------|---------|--------|--------|--------|---------------|-------|
| login | /login | [desktop](screenshots/login__desktop-1920x1080.png) | [laptop](screenshots/login__laptop-1366x768.png) | [tablet](screenshots/login__tablet-768x1024.png) | [mobile](screenshots/login__mobile-390x844.png) | PASS | Clean single-column; works on all viewports |
| fleet-dashboard | / | [desktop](screenshots/fleet-dashboard__desktop-1920x1080.png) | [laptop](screenshots/fleet-dashboard__laptop-1366x768.png) | [tablet](screenshots/fleet-dashboard__tablet-768x1024.png) | [mobile](screenshots/fleet-dashboard__mobile-390x844.png) | CLUTTERED (mobile) | Header wraps 3 lines mobile; table horizontal scroll tablet/mobile; no board IP |
| alarms | /alarms | [desktop](screenshots/alarms__desktop-1920x1080.png) | [laptop](screenshots/alarms__laptop-1366x768.png) | [tablet](screenshots/alarms__tablet-768x1024.png) | [mobile](screenshots/alarms__mobile-390x844.png) | NOT RESPONSIVE (mobile) | 9-col table min-w-860px; duplicate volt_dc alarms visible |
| alarm-rules | /admin/alarm-rules | [desktop](screenshots/alarm-rules__desktop-1920x1080.png) | [laptop](screenshots/alarm-rules__laptop-1366x768.png) | [tablet](screenshots/alarm-rules__tablet-768x1024.png) | [mobile](screenshots/alarm-rules__mobile-390x844.png) | EMPTY | 11-col table; no rules in DB — "No alarm rules defined" |
| inventory | /admin/inventory | [desktop](screenshots/inventory__desktop-1920x1080.png) | [laptop](screenshots/inventory__laptop-1366x768.png) | [tablet](screenshots/inventory__tablet-768x1024.png) | [mobile](screenshots/inventory__mobile-390x844.png) | ACCEPTABLE | 2 units shown; 7-col table scrolls on mobile |
| settings | /admin/settings | [desktop](screenshots/settings__desktop-1920x1080.png) | [laptop](screenshots/settings__laptop-1366x768.png) | [tablet](screenshots/settings__tablet-768x1024.png) | [mobile](screenshots/settings__mobile-390x844.png) | PASS | Responsive; measurement limitation note present |
| ups-detail-live | /ups/UPS-COM11-TEST | [desktop](screenshots/ups-detail-live__desktop-1920x1080.png) | [laptop](screenshots/ups-detail-live__laptop-1366x768.png) | [tablet](screenshots/ups-detail-live__tablet-768x1024.png) | [mobile](screenshots/ups-detail-live__mobile-390x844.png) | ACCEPTABLE | Live data shown; IP as plain text; no portal button; "not supported" cards correct |
| ups-detail-offline | /ups/UPSMON-01 | [desktop](screenshots/ups-detail-offline__desktop-1920x1080.png) | [laptop](screenshots/ups-detail-offline__laptop-1366x768.png) | [tablet](screenshots/ups-detail-offline__tablet-768x1024.png) | [mobile](screenshots/ups-detail-offline__mobile-390x844.png) | PASS | Offline badge; metric cards "--"; commissioning "No telemetry" |
| ups-notfound | /ups/DOES-NOT-EXIST | [desktop](screenshots/ups-notfound__desktop-1920x1080.png) | [laptop](screenshots/ups-notfound__laptop-1366x768.png) | [tablet](screenshots/ups-notfound__tablet-768x1024.png) | [mobile](screenshots/ups-notfound__mobile-390x844.png) | PASS | "UPS not found." error message with back link |
