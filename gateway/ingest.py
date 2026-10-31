"""Gateway ingest: radio → AMP → de-dup → SQLite → intelligence.

This is the Raspberry Pi processing boundary. The virtual radio and a
future SX1278 driver both deliver RadioRx into Gateway.ingest().
"""

from __future__ import annotations

from typing import Optional

from gateway.amp import (
    AMP_FLAG_ACK_REQ,
    AMP_FLAG_FROM_GW,
    AMP_GATEWAY_ID_DEFAULT,
    AmpHeader,
    AmpType,
    HEATER_FROM_CODE,
    MODE_FROM_CODE,
    ParseResult,
    encode_frame,
    pack_ack,
    parse_frame,
    unpack_extended_obs,
    unpack_sampling_diag,
    unpack_sensor,
)
from gateway.contracts import (
    DATA_SIMULATED,
    MqHeaterState,
    Observation,
    OperatingMode,
    RadioRx,
    SensorQuality,
)
from gateway.intelligence.pipeline import IntelligencePipeline
from gateway.replay import ReplayWindow
from gateway.storage import SamplingDecisionRecord, StorageError
from gateway.storage.sqlite import SqliteRepository

TRIGGER_FROM_CODE = {
    0: "BOOT",
    1: "FIXED_SCHEDULE",
    2: "BATTERY_SOC",
    3: "THRESHOLD",
    4: "CROSS_MODAL",
    5: "INFORMATION_ENERGY",
    6: "MQ135_ACTIVATE",
    7: "MQ135_DEFER",
    8: "FAULT_DEGRADED",
}

SENSOR_FROM_CODE = {
    0: None,
    1: "PMS5003",
    2: "SCD41",
    3: "BME688",
    4: "MQ135",
    5: "ALL",
}


class Gateway:
    def __init__(
        self,
        repo: SqliteRepository,
        k_net: bytes,
        *,
        provenance: str = DATA_SIMULATED,
        display_by_wire: Optional[dict[int, str]] = None,
        positions: Optional[dict[int, tuple[float, float]]] = None,
        node_firmware_version: Optional[str] = None,
        config_version: Optional[str] = None,
    ) -> None:
        self.repo = repo
        self.k_net = k_net
        self.provenance = provenance
        self.display_by_wire = display_by_wire or {}
        self.positions = positions or {}
        self.node_firmware_version = node_firmware_version
        self.config_version = config_version
        self.replay = ReplayWindow()
        self.pending_acks: list[bytes] = []
        self.pending_ext: dict[int, dict] = {}
        self.stats = {
            "rx": 0,
            "crc_fail": 0,
            "mac_fail": 0,
            "duplicate": 0,
            "accepted": 0,
            "db_fail": 0,
        }
        self.pipeline = IntelligencePipeline(
            repo,
            provenance=provenance,
            display_by_wire=self.display_by_wire,
            positions=self.positions,
            stats=self.stats,
        )

    def restart(self) -> None:
        """In-memory restart; SQLite retained (SIM-014)."""
        self.replay.reset()
        self.pending_ext.clear()
        self.pending_acks.clear()
        self.pipeline.restart()

    def ingest(self, rx: RadioRx) -> None:
        self.stats["rx"] += 1
        result, frame = parse_frame(self.k_net, rx.psdu)
        crc_ok = result not in (ParseResult.BAD_CRC, ParseResult.BAD_LEN, ParseResult.BAD_MAGIC, ParseResult.BAD_VERSION)
        mac_ok = result not in (ParseResult.BAD_MAC,) and result == ParseResult.OK
        if result == ParseResult.BAD_CRC:
            self.stats["crc_fail"] += 1
        if result == ParseResult.BAD_MAC:
            self.stats["mac_fail"] += 1

        wire_id = frame.hdr.src if frame else None
        seq = frame.hdr.seq if frame else None
        mtype = frame.hdr.type if frame else None
        drop = None if result == ParseResult.OK else result.name
        dup = False
        schema_ok = result == ParseResult.OK

        if frame and result == ParseResult.OK:
            accepted = self.replay.accept(
                frame.hdr.src,
                frame.hdr.type,
                frame.hdr.seq,
                frame.hdr.timestamp,
                frame.hdr.sync_status,
                rx.received_at,
            )
            if not accepted:
                dup = True
                drop = "DUPLICATE"
                self.stats["duplicate"] += 1
                schema_ok = False

        radio_row = {
            "received_at": rx.received_at,
            "wire_id": wire_id,
            "sequence": seq,
            "message_type": mtype,
            "protocol_version": 1,
            "rssi": rx.rssi_dbm,
            "snr": rx.snr_db,
            "crc_valid": crc_ok and result != ParseResult.BAD_CRC,
            "mac_valid": result == ParseResult.OK or result == ParseResult.BAD_TYPE,
            "schema_valid": schema_ok,
            "duplicate": dup,
            "raw_payload": rx.psdu,
            "drop_reason": drop,
            "provenance": rx.provenance,
        }

        if result != ParseResult.OK or dup or frame is None:
            try:
                self.repo.insert_radio_packet(radio_row)
            except StorageError:
                self.stats["db_fail"] += 1
                return
            if result != ParseResult.OK:
                try:
                    self.repo.log(
                        rx.received_at,
                        "packet_ingest",
                        "WARNING",
                        result.name,
                        f"dropped frame {result.name}",
                        wire_id,
                        self.provenance,
                    )
                except StorageError:
                    self.stats["db_fail"] += 1
            return

        self.stats["accepted"] += 1
        if frame.hdr.flags & AMP_FLAG_ACK_REQ:
            self._queue_ack(frame.hdr, rx.received_at)

        if frame.hdr.type == AmpType.SENSOR_DATA:
            self._on_sensor(frame, rx, radio_row)
        elif frame.hdr.type == AmpType.DIAGNOSTICS:
            self._on_diag(frame, rx, radio_row)
        elif frame.hdr.type == AmpType.HEARTBEAT:
            try:
                self.repo.insert_radio_packet(radio_row)
                if wire_id is not None and seq is not None:
                    self.repo.nodes.mark_seen(wire_id, last_seen=rx.received_at, last_sequence=seq)
            except StorageError:
                self.stats["db_fail"] += 1
        else:
            try:
                self.repo.insert_radio_packet(radio_row)
            except StorageError:
                self.stats["db_fail"] += 1

    def _queue_ack(self, hdr: AmpHeader, now: int) -> None:
        payload = pack_ack(hdr.seq, hdr.type, 0)
        ack_hdr = AmpHeader(
            type=AmpType.ACK,
            flags=AMP_FLAG_FROM_GW,
            src=AMP_GATEWAY_ID_DEFAULT,
            dst=hdr.src,
            seq=hdr.seq,
            timestamp=now,
            ttl=1,
        )
        self.pending_acks.append(encode_frame(self.k_net, ack_hdr, payload))

    def _on_diag(self, frame, rx: RadioRx, radio_row: dict) -> None:
        ext = unpack_extended_obs(frame.payload)
        samp = unpack_sampling_diag(frame.payload) if not ext else None
        rec = None
        if samp:
            rec = SamplingDecisionRecord(
                wire_id=frame.hdr.src,
                timestamp=frame.hdr.timestamp,
                previous_mode=MODE_FROM_CODE.get(samp["prev_mode"], "NORMAL"),
                new_mode=MODE_FROM_CODE.get(samp["new_mode"], "NORMAL"),
                trigger=TRIGGER_FROM_CODE.get(samp["trigger"], "UNKNOWN"),
                confidence=samp["confidence"],
                expected_information_gain=samp["eig"],
                estimated_energy_cost=samp["energy_mj"] / 1000.0,
                selected_sensor=SENSOR_FROM_CODE.get(samp["selected_sensor"]),
                provenance=self.provenance,
            )
        try:
            with self.repo.transaction():
                self.repo.insert_radio_packet(radio_row)
                self.repo.nodes.mark_seen(
                    frame.hdr.src,
                    last_seen=rx.received_at,
                    last_sequence=frame.hdr.seq,
                )
                if rec is not None:
                    self.repo.insert_sampling_decision(rec)
        except StorageError:
            self.stats["db_fail"] += 1
            return
        if ext:
            ext["t"] = frame.hdr.timestamp
            self.pending_ext[frame.hdr.src] = ext

    def _on_sensor(self, frame, rx: RadioRx, radio_row: dict) -> None:
        try:
            sp = unpack_sensor(frame.payload)
        except ValueError:
            radio_row = dict(radio_row)
            radio_row["schema_valid"] = False
            radio_row["drop_reason"] = "BAD_SENSOR"
            try:
                self.repo.insert_radio_packet(radio_row)
                self.repo.log(
                    rx.received_at,
                    "packet_ingest",
                    "WARNING",
                    "BAD_SENSOR",
                    "unpack failed",
                    frame.hdr.src,
                    self.provenance,
                )
            except StorageError:
                self.stats["db_fail"] += 1
            return
        display = self.display_by_wire.get(frame.hdr.src, f"NODE-{frame.hdr.src:02d}")
        ext = self.pending_ext.get(frame.hdr.src, {})
        heater = MqHeaterState(HEATER_FROM_CODE.get(ext.get("heater_code", 0), "OFF"))
        obs = Observation(
            wire_id=frame.hdr.src,
            display_id=display,
            sequence=frame.hdr.seq,
            sample_id=sp.sample_id,
            measurement_time=frame.hdr.timestamp,
            received_at=rx.received_at,
            pm1=ext.get("pm1"),
            pm25=sp.pm25_x10 / 10.0,
            pm10=sp.pm10_x10 / 10.0,
            n0p3=ext.get("n0p3"),
            co2=float(sp.co2_ppm),
            temperature=sp.temp_c_x100 / 100.0,
            humidity=sp.rh_x100 / 100.0,
            pressure=sp.pressure_x10 / 10.0,
            bme688_gas_feature=float(sp.gas_res) / 10.0,
            mq135_raw=ext.get("mq135_raw"),
            mq135_index=ext.get("mq135_index"),
            mq_heater_state=heater,
            mq_warmup_s=float(ext.get("warmup_s", 0)),
            mq_present=bool(ext.get("mq_present", True)),
            quality=SensorQuality(
                pms=float(ext.get("q_pms", 1.0)),
                scd41=float(ext.get("q_scd", 1.0)),
                bme688=float(ext.get("q_bme", 1.0)),
                mq135=float(ext.get("q_mq", 1.0)),
            ),
            quality_flags=sp.status_flags,
            operating_mode=OperatingMode.NORMAL,
            battery_pct=sp.batt_pct,
            firmware_version=self.node_firmware_version,
            config_version=self.config_version,
            provenance=self.provenance,
        )
        self.pipeline.process(obs, radio_row, rx.received_at)
