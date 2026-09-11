"""Virtual SX1278 + shared medium. Not a claim of real LoRa range or RF performance."""

from __future__ import annotations

from dataclasses import dataclass, field

from gateway.contracts import RadioRx
from simulation.faults.injector import FaultContext
from simulation.rng import StreamRng


@dataclass
class Pending:
    t_deliver: float
    rx: RadioRx
    dst: str  # "gw" or wire_id as str


class VirtualLoRaMedium:
    def __init__(
        self,
        seed: int,
        *,
        p_loss: float = 0.0,
        p_corrupt: float = 0.0,
        p_duplicate: float = 0.0,
        p_collision: float = 0.0,
        latency_s: float = 0.15,
        gw_pos: tuple[float, float] = (80.0, 20.0),
    ) -> None:
        self.rng = StreamRng(seed, 90)
        self.p_loss = p_loss
        self.p_corrupt = p_corrupt
        self.p_duplicate = p_duplicate
        self.p_collision = p_collision
        self.latency_s = latency_s
        self.gw_pos = gw_pos
        self._up: list[Pending] = []
        self._down: list[tuple[float, int, bytes]] = []
        self._tx_slots: dict[int, int] = {}
        self.stats = {"tx": 0, "lost": 0, "corrupt": 0, "dup_injected": 0, "collisions": 0, "rx_gw": 0}

    def transmit_uplink(
        self,
        t: float,
        psdu: bytes,
        *,
        src: int,
        pos: tuple[float, float],
        faults: FaultContext,
        provenance: str = "SIMULATED",
    ) -> None:
        self.stats["tx"] += 1
        slot = int(t)
        self._tx_slots[slot] = self._tx_slots.get(slot, 0) + 1
        collided = self._tx_slots[slot] > 1 and self.rng.chance(self.p_collision)
        if collided:
            self.stats["collisions"] += 1
            return
        if faults.radio_loss or self.rng.chance(self.p_loss):
            self.stats["lost"] += 1
            return
        buf = bytearray(psdu)
        if faults.packet_corruption or self.rng.chance(self.p_corrupt):
            if buf:
                i = int(self.rng.uniform(0, len(buf) - 1))
                buf[i] ^= 0xFF
                self.stats["corrupt"] += 1
        dist = ((pos[0] - self.gw_pos[0]) ** 2 + (pos[1] - self.gw_pos[1]) ** 2) ** 0.5
        rssi = -40.0 - dist / 8.0 + self.rng.gauss(0, 1.5)
        snr = 8.0 - dist / 40.0 + self.rng.gauss(0, 0.4)
        delay = self.latency_s
        rx = RadioRx(
            psdu=bytes(buf),
            received_at=int(t + delay),
            rssi_dbm=rssi,
            snr_db=snr,
            latency_s=delay,
            collided=False,
            duplicated=False,
            provenance=provenance,
        )
        self._up.append(Pending(t + delay + 1e-6 * len(self._up), rx, "gw"))
        if faults.packet_duplicate or self.rng.chance(self.p_duplicate):
            dup = RadioRx(**{**rx.__dict__, "duplicated": True, "received_at": int(t + delay + 0.05)})
            self._up.append(Pending(t + delay + 0.05, dup, "gw"))
            self.stats["dup_injected"] += 1

    def transmit_downlink(self, t: float, psdu: bytes, dst_wire: int) -> None:
        delay = max(0.0, self.latency_s * 0.5)
        self._down.append((t + delay, dst_wire, psdu))

    def collect_gateway(self, t: float) -> list[RadioRx]:
        due, rest = [], []
        for p in self._up:
            if p.t_deliver <= t:
                due.append(p.rx)
            else:
                rest.append(p)
        self._up = rest
        self.stats["rx_gw"] += len(due)
        return due

    def collect_node(self, t: float, wire_id: int) -> list[bytes]:
        due, rest = [], []
        for item in self._down:
            td, dst, psdu = item
            if td <= t and dst == wire_id:
                due.append(psdu)
            else:
                rest.append(item)
        self._down = rest
        return due
