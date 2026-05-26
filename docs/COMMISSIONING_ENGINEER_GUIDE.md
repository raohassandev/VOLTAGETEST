# Automatrix VOLTAGETEST / UMS Commissioning Engineer Guide

**Release:** v1.0.0  
**Product:** Automatrix Engineering VOLTAGETEST / UMS - Industrial UPS Monitoring System

Live board proof/calibration is required before final field handover.

## Site Information

- Site name:
- Customer contact:
- Commissioning engineer:
- Date:
- Package version:
- License ID:

## UPS And Analyzer Details

For each UPS/device record:

- UPS name and model
- Serial number
- Board/device ID
- Energy analyzer make/model
- CT ratio
- PT ratio
- Modbus TCP/RTU mode
- IP address or COM port
- Baud rate, parity, stop bits
- Modbus address

## Wiring Verification

- Confirm CT direction and phase mapping.
- Confirm PT/voltage input wiring.
- Confirm UPS alarm input wiring.
- Confirm board power and network connection.
- Capture before/after photos where required by the site.

## Communication Test

- Ping device or verify serial connection.
- Read analyzer registers.
- Record voltage, current, power, frequency, and energy registers.
- Confirm MQTT telemetry reaches the dashboard.
- Confirm database persistence.

## Measurement Comparison

Compare dashboard values with an external meter:

- Voltage
- Current
- Real power
- Power factor
- Frequency
- Energy/kWh

Record calibration offsets/scales and before/after screenshots.

## Alarm And Status Verification

- Trigger or simulate alarm input.
- Confirm dashboard alarm state.
- Confirm alarm history/event record.
- Confirm acknowledgement behavior.

## License And User Setup

- Install signed offline license.
- Confirm seat count.
- Add UPS devices after license activation.
- Confirm seat limit blocks extra active UPS assets.
- Create customer user accounts.
- Remove temporary commissioning accounts.

## Backup And Restore

- Configure backup schedule.
- Run manual backup.
- Perform a safe restore test against an approved target.
- Record backup path and timestamp.

## Network Checklist

- Application port open
- PostgreSQL access restricted
- MQTT broker settings confirmed
- Firewall rules documented
- Static IPs or DHCP reservations recorded

## Acceptance Checklist

- Login works
- Dashboard loads
- UPS list/add/edit works
- Telemetry persists
- Alarms work
- License page works
- Backup/restore tested
- Live board values calibrated
- Customer sign-off completed

## Sign-Off

Customer representative:

Commissioning engineer:

Date:
