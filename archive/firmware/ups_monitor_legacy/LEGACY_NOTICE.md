# Legacy Firmware — ups_monitor

**Status:** Archived — do not flash.

This is the original UPS monitor firmware (v0.3.x) that used the old MQTT topic scheme:

```
building/<site_id>/ups/<device_id>/telemetry
```

It has been superseded by `firmware/VOLTAGETEST/VOLTAGETEST.ino` (v2.1.0), which uses:

```
ums/devices/<device_id>/data
```

The v2.1.0 firmware adds:
- MQTT 3.1.1 authentication (username + password stored in NVS)
- `/api/info` endpoint for LAN discovery
- `FIRMWARE_VERSION` field in every payload
- Energy-analyzer fields: `p_in_w`, `p_out_w`, `pf_in`, `pf_out`, `freq_in`, `freq_out`, `q_in_var`, `q_out_var`, `e_in_kwh`, `e_out_kwh`
- TCP flush fix (write loop + `c.flush()`)

**Do not use this legacy firmware for new boards.**
