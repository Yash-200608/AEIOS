"""Software battery/energy model. NOT a validated hardware power estimate."""

from __future__ import annotations

from dataclasses import dataclass


# Millijoules — algorithm-development placeholders only (C-19).
E_MCU_IDLE_PER_S = 2.0
E_MCU_SAMPLE = 12.0
E_PMS = 80.0
E_SCD = 40.0
E_BME = 22.0
E_MQ_HEATER_PER_S = 140.0
E_RADIO_TX_BASE = 48.0
E_RADIO_TX_PER_BYTE = 0.4
E_RADIO_RX = 8.0
E_SLEEP_PER_S = 0.4


@dataclass
class PowerState:
    soc: float
    voltage: float
    battery_state: str
    solar_state: str
    energy_consumed_j: float
    last_sample_cost_j: float


class PowerModel:
    def __init__(
        self,
        *,
        capacity_j: float = 20000.0,
        soc: float = 0.85,
        profile: str = "NORMAL_POWER",
        solar_w: float = 0.4,
    ) -> None:
        self.capacity_j = capacity_j
        self.energy_j = capacity_j * soc
        self.consumed_j = 0.0
        self.profile = profile
        self.solar_w = solar_w
        if profile == "LOW_BATTERY":
            self.energy_j = capacity_j * 0.12
            self.solar_w = 0.05
        elif profile == "SOLAR_DEFICIT":
            self.solar_w = 0.02
        elif profile == "RECOVERY":
            self.solar_w = 1.2

    @property
    def soc(self) -> float:
        return max(0.0, min(1.0, self.energy_j / self.capacity_j))

    @property
    def voltage(self) -> float:
        return 3.3 + 0.9 * self.soc

    def tick(self, dt: float, *, mq_heater_on: bool, sleeping: bool) -> None:
        cost = (E_SLEEP_PER_S if sleeping else E_MCU_IDLE_PER_S) * dt
        if mq_heater_on:
            cost += E_MQ_HEATER_PER_S * dt
        self._spend(cost)
        self.energy_j += self.solar_w * dt  # W * s = J
        self.energy_j = min(self.capacity_j, self.energy_j)

    def sample(self, *, pms: bool, scd: bool, bme: bool, mq_measure: bool) -> float:
        cost = E_MCU_SAMPLE
        if pms:
            cost += E_PMS
        if scd:
            cost += E_SCD
        if bme:
            cost += E_BME
        if mq_measure:
            cost += 15.0
        self._spend(cost)
        return cost / 1000.0

    def radio_tx(self, nbytes: int) -> float:
        cost = E_RADIO_TX_BASE + E_RADIO_TX_PER_BYTE * nbytes
        self._spend(cost)
        return cost / 1000.0

    def radio_rx(self) -> None:
        self._spend(E_RADIO_RX)

    def _spend(self, mJ: float) -> None:
        j = mJ / 1000.0
        self.energy_j = max(0.0, self.energy_j - j)
        self.consumed_j += j

    def snapshot(self, *, battery_low_fault: bool = False) -> PowerState:
        soc = self.soc
        if battery_low_fault or soc < 0.15:
            bstate = "LOW_BATTERY"
        elif soc < 0.3:
            bstate = "RECOVERY" if self.profile == "RECOVERY" else "LOW_BATTERY"
        else:
            bstate = self.profile if self.profile != "LOW_BATTERY" else "LOW_BATTERY"
        if self.solar_w < 0.08:
            solar = "SOLAR_DEFICIT"
        elif self.solar_w > 0.9:
            solar = "RECOVERY"
        else:
            solar = "NORMAL_POWER"
        return PowerState(
            soc=soc,
            voltage=self.voltage,
            battery_state=bstate,
            solar_state=solar,
            energy_consumed_j=self.consumed_j,
            last_sample_cost_j=0.0,
        )
