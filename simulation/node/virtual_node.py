"""Simulated AEIOS node: sensors → quality → policy → AMP → virtual radio."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from gateway.amp import (
    AMP_FLAG_ACK_REQ,
    AMP_GATEWAY_ID_DEFAULT,
    AmpHeader,
    AmpType,
    HEATER_CODES,
    SensorPayload,
    encode_frame,
    pack_extended_obs,
    pack_sampling_diag,
    pack_sensor,
    parse_frame,
    ParseResult,
    unpack_ack,
)
from gateway.contracts import (
    FLAG_BATT_LOW,
    FLAG_BME_FAULT,
    FLAG_PM_FAULT,
    FLAG_SAMPLE_INVALID,
    FLAG_SCD_FAULT,
    MqHeaterState,
    OperatingMode,
)
from simulation.environment.state import EnvState
from simulation.faults.injector import FaultInjector
from simulation.node.policy import Policy, PolicyInput, PolicyOutput, TRIGGER_BOOT, mode_code
from simulation.power.model import PowerModel, PowerState
from simulation.radio.medium import VirtualLoRaMedium
from simulation.sensors.bme688 import VirtualBME688
from simulation.sensors.mq135 import VirtualMQ135
from simulation.sensors.pms5003 import VirtualPMS5003
from simulation.sensors.scd41 import VirtualSCD41


@dataclass
class NodeTickResult:
    sampled: bool
    transmitted: int
    pms_frames: int
    mode: str
    power: PowerState


class VirtualNode:
    def __init__(
        self,
        *,
        wire_id: int,
        display_id: str,
        pos: tuple[float, float],
        seed: int,
        k_net: bytes,
        policy: Policy,
        power: PowerModel,
        pms: VirtualPMS5003,
        scd: VirtualSCD41,
        bme: VirtualBME688,
        mq: VirtualMQ135,
        ack_timeout_s: float = 3.0,
        max_retries: int = 3,
    ) -> None:
        self.wire_id = wire_id
        self.display_id = display_id
        self.pos = pos
        self.k_net = k_net
        self.policy = policy
        self.power = power
        self.pms = pms
        self.scd = scd
        self.bme = bme
        self.mq = mq
        self.ack_timeout_s = ack_timeout_s
        self.max_retries = max_retries
        self.mode = OperatingMode.NORMAL
        self.next_sample_t = 0.0
        self.seq_sensor = 0
        self.seq_diag = 0
        self.sample_id = 0
        self.pending: Optional[dict] = None
        self.boot_decision_sent = False
        self.pms_frames_ok = 0
        self.last_out: Optional[PolicyOutput] = None

    def step(
        self,
        t: float,
        dt: float,
        env: EnvState,
        medium: VirtualLoRaMedium,
        faults: FaultInjector,
    ) -> NodeTickResult:
        f_all = faults.active(t, self.display_id)
        heater_on = self.mq._heater_on
        sleeping = self.mode in (OperatingMode.SAFE, OperatingMode.LOW_BATTERY) and t < self.next_sample_t
        self.mq.tick(t, dt)
        self.power.tick(dt, mq_heater_on=heater_on, sleeping=sleeping)

        for frame in medium.collect_node(t, self.wire_id):
            self._handle_downlink(frame)
            self.power.radio_rx()

        if self.pending and t - self.pending["t"] >= self.ack_timeout_s:
            if self.pending["retries"] < self.max_retries:
                medium.transmit_uplink(
                    t, self.pending["psdu"], src=self.wire_id, pos=self.pos, faults=f_all
                )
                self.power.radio_tx(len(self.pending["psdu"]))
                self.pending["retries"] += 1
                self.pending["t"] = t
            else:
                self.pending = None

        sampled = False
        tx = 0
        pms_frames = 0
        if t + 1e-9 >= self.next_sample_t:
            sampled, tx, pms_frames = self._sample_and_send(t, env, medium, faults)
            interval = self.last_out.interval_s if self.last_out else 8.0
            self.next_sample_t = t + interval

        snap = self.power.snapshot(battery_low_fault=f_all.battery_low)
        return NodeTickResult(
            sampled=sampled,
            transmitted=tx,
            pms_frames=pms_frames,
            mode=self.mode.value,
            power=snap,
        )

    def _handle_downlink(self, psdu: bytes) -> None:
        res, frame = parse_frame(self.k_net, psdu)
        if res != ParseResult.OK or frame is None:
            return
        if frame.hdr.type != AmpType.ACK:
            return
        try:
            ack_seq, ack_type, _code = unpack_ack(frame.payload)
        except ValueError:
            return
        if self.pending and ack_type == AmpType.SENSOR_DATA and ack_seq == self.pending["seq"]:
            self.pending = None

    def _sample_and_send(
        self,
        t: float,
        env: EnvState,
        medium: VirtualLoRaMedium,
        faults: FaultInjector,
    ) -> tuple[bool, int, int]:
        f_pms = faults.active(t, self.display_id, "pms5003")
        f_scd = faults.active(t, self.display_id, "scd41")
        f_bme = faults.active(t, self.display_id, "bme688")
        f_mq = faults.active(t, self.display_id, "mq135")
        f_all = faults.active(t, self.display_id)
        pms_reading, pms_frame = self.pms.read(t, env, f_pms)
        scd = self.scd.read(t, env, f_scd)
        bme = self.bme.read(t, env, f_bme)
        mq = self.mq.read(t, env, f_mq)
        pms_frames = 1 if pms_frame is not None else 0
        if pms_reading is not None:
            self.pms_frames_ok += 1

        flags = 0
        if pms_reading is None:
            flags |= FLAG_PM_FAULT | FLAG_SAMPLE_INVALID
        if scd is None:
            flags |= FLAG_SCD_FAULT
        if bme is None:
            flags |= FLAG_BME_FAULT
        snap = self.power.snapshot(battery_low_fault=f_all.battery_low)
        if snap.soc < 0.15 or f_all.battery_low:
            flags |= FLAG_BATT_LOW

        q_pms = 0.0 if pms_reading is None else 0.95
        q_scd = 0.0 if scd is None else float(scd.get("quality", 1.0))
        q_bme = 0.0 if bme is None else float(bme.get("quality", 1.0))
        q_mq = 0.0 if mq is None else float(mq.get("quality", 0.2))

        inp = PolicyInput(
            pm25=None if pms_reading is None else pms_reading.pm25,
            co2=None if scd is None else scd["co2"],
            mq_index=None if mq is None else mq["mq135_index"],
            bme_gas=None if bme is None else bme["bme688_gas_feature"],
            soc=snap.soc,
            pms_ok=pms_reading is not None,
            scd_ok=scd is not None,
            bme_ok=bme is not None,
            mq_ok=mq is not None and q_mq >= 0.4,
            mq_heater_on=self.mq._heater_on,
        )
        out = self.policy.decide(inp, self.mode)
        prev = self.mode
        self.mode = out.mode
        self.last_out = out
        self.mq.set_heater(out.mq_heater, t)
        self.power.sample(pms=pms_reading is not None, scd=scd is not None, bme=bme is not None, mq_measure=mq is not None)

        ts = int(t)
        tx = 0
        if (not self.boot_decision_sent) or prev != out.mode:
            self.seq_diag = (self.seq_diag + 1) & 0xFFFF
            payload = pack_sampling_diag(
                mode_code(prev),
                mode_code(out.mode),
                out.trigger if self.boot_decision_sent else TRIGGER_BOOT,
                out.confidence,
                out.expected_information_gain,
                out.estimated_energy_cost * 1000.0,
                out.selected_sensor,
            )
            hdr = AmpHeader(
                type=AmpType.DIAGNOSTICS,
                src=self.wire_id,
                dst=AMP_GATEWAY_ID_DEFAULT,
                seq=self.seq_diag,
                timestamp=ts,
            )
            psdu = encode_frame(self.k_net, hdr, payload)
            medium.transmit_uplink(t, psdu, src=self.wire_id, pos=self.pos, faults=f_all)
            self.power.radio_tx(len(psdu))
            tx += 1
            self.boot_decision_sent = True

        self.seq_diag = (self.seq_diag + 1) & 0xFFFF
        heater = mq["heater_state"] if mq else MqHeaterState.OFF.value
        ext = pack_extended_obs(
            pm1=0.0 if pms_reading is None else pms_reading.pm1,
            n0p3=0.0 if pms_reading is None else pms_reading.n0p3,
            mq135_raw=0.0 if mq is None else mq["mq135_raw"],
            mq135_index=0.0 if mq is None else mq["mq135_index"],
            heater_code=HEATER_CODES.get(heater, 0),
            warmup_s=0.0 if mq is None else mq["warmup_s"],
            q_pms=q_pms,
            q_scd=q_scd,
            q_bme=q_bme,
            q_mq=q_mq,
            mq_present=mq is not None,
        )
        hdr_ext = AmpHeader(
            type=AmpType.DIAGNOSTICS,
            src=self.wire_id,
            dst=AMP_GATEWAY_ID_DEFAULT,
            seq=self.seq_diag,
            timestamp=ts,
        )
        psdu_ext = encode_frame(self.k_net, hdr_ext, ext)
        medium.transmit_uplink(t, psdu_ext, src=self.wire_id, pos=self.pos, faults=f_all)
        self.power.radio_tx(len(psdu_ext))
        tx += 1

        self.sample_id = (self.sample_id + 1) & 0xFFFF
        self.seq_sensor = (self.seq_sensor + 1) & 0xFFFF
        sp = SensorPayload(
            pm25_x10=_u16((pms_reading.pm25 if pms_reading else 0.0) * 10),
            pm10_x10=_u16((pms_reading.pm10 if pms_reading else 0.0) * 10),
            temp_c_x100=_i16(((scd["temperature"] if scd else (bme["temperature"] if bme else 0.0)) * 100)),
            rh_x100=_u16(((scd["humidity"] if scd else (bme["humidity"] if bme else 0.0)) * 100)),
            pressure_x10=_u16(((bme["pressure"] if bme else 1013.25) * 10)),
            gas_res=_u16(((bme["bme688_gas_feature"] if bme else 0.0) * 10)),
            co2_ppm=_u16(scd["co2"] if scd else 0.0),
            batt_pct=max(0, min(100, int(round(snap.soc * 100)))),
            status_flags=flags,
            sample_id=self.sample_id,
        )
        hdr_s = AmpHeader(
            type=AmpType.SENSOR_DATA,
            flags=AMP_FLAG_ACK_REQ,
            src=self.wire_id,
            dst=AMP_GATEWAY_ID_DEFAULT,
            seq=self.seq_sensor,
            timestamp=ts,
        )
        psdu_s = encode_frame(self.k_net, hdr_s, pack_sensor(sp))
        medium.transmit_uplink(t, psdu_s, src=self.wire_id, pos=self.pos, faults=f_all)
        self.power.radio_tx(len(psdu_s))
        tx += 1
        self.pending = {"psdu": psdu_s, "seq": self.seq_sensor, "t": t, "retries": 0}
        return True, tx, pms_frames


def _u16(x: float) -> int:
    return max(0, min(65535, int(round(x))))


def _i16(x: float) -> int:
    return max(-32768, min(32767, int(round(x))))
