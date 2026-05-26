# MQTT Topics â€” UMS v1.0.0

## Active Topic Scheme

All devices use:

```
ums/devices/<device_id>/data
```

The MQTT worker subscribes to:

```
ums/devices/+/data
```

### Payload format (JSON)

```json
{
  "device_id": "UMS-3076F5A5AD54",
  "firmware": "1.0.0",
  "ip": "192.168.0.100",
  "rssi": -62,
  "seq": 1234,
  "volt_in": 230.5,
  "volt_out": 229.8,
  "volt_dc": 53.1,
  "ct_in": 2.1,
  "ct_out": 1.9,
  "s_in_va": 483.2,
  "s_out_va": 436.6,
  "p_in_w": null,
  "p_out_w": null,
  "pf_in": null,
  "pf_out": null,
  "freq_in": 50.02,
  "freq_out": 50.00,
  "q_in_var": null,
  "q_out_var": null,
  "e_in_kwh": null,
  "e_out_kwh": null
}
```

Fields with `null` require calibration or hardware support. See `docs/MEASUREMENT_LIMITATIONS.md`.

---

## MQTT Authentication

Each device authenticates with:

- **Username:** `<device_id>` (e.g. `UMS-3076F5A5AD54`)
- **Password:** set via device web UI at `http://<device-ip>/`

The MQTT worker authenticates with:

- **Username:** `dashboard`
- **Password:** set in `.env` as `MQTT_PASSWORD`

---

## ACL Rules (Mosquitto)

See `deployment/mosquitto/acl.example` for the reference ACL configuration.

```
pattern write ums/devices/%u/data     # devices write their own topic
topic read ums/devices/+/data         # dashboard reads all device topics
```

---

## Legacy Topic (archived)

The old topic scheme (`building/<site>/<ups>/<device>/telemetry`) was used in firmware â‰¤ v0.5.x.
It is **no longer supported**. Legacy notes are kept under `archive/` for development history only.
