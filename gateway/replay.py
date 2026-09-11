"""AMP seq-window replay defense — Python mirror of firmware amp_replay (DOC-005 §9.1)."""

from __future__ import annotations

from dataclasses import dataclass, field

AMP_SEQ_WINDOW = 32
AMP_T_REPLAY_S = 300
AMP_REPLAY_TABLE_SIZE = 64


@dataclass
class _Entry:
    src: int = 0
    type: int = 0
    last_seq: int = 0
    bitmap: int = 0
    primed: bool = False


@dataclass
class ReplayWindow:
    entries: list[_Entry] = field(default_factory=lambda: [_Entry() for _ in range(AMP_REPLAY_TABLE_SIZE)])

    def reset(self) -> None:
        self.entries = [_Entry() for _ in range(AMP_REPLAY_TABLE_SIZE)]

    def _find(self, src: int, typ: int) -> _Entry | None:
        free = None
        for e in self.entries:
            if e.primed and e.src == src and e.type == typ:
                return e
            if not e.primed and free is None:
                free = e
        return free

    def accept(
        self,
        src: int,
        typ: int,
        seq: int,
        timestamp: int,
        sync_status: int = 0,
        local_unix: int = 0,
    ) -> bool:
        src = src & 0xFFFF
        seq = seq & 0xFFFF
        if sync_status >= 1 and timestamp + AMP_T_REPLAY_S < local_unix:
            return False
        e = self._find(src, typ)
        if e is None:
            return False
        if e.primed and self._in_window(e, seq):
            return False
        if e.primed:
            forward = (seq - e.last_seq) & 0xFFFF
            back = (e.last_seq - seq) & 0xFFFF
            if forward == 0:
                return False
            if forward >= 0x8000 and back >= AMP_SEQ_WINDOW:
                return False
        if not e.primed:
            e.src = src
            e.type = typ
        self._record(e, seq)
        return True

    @staticmethod
    def _in_window(e: _Entry, seq: int) -> bool:
        if not e.primed:
            return False
        delta = (e.last_seq - seq) & 0xFFFF
        if delta == 0:
            return True
        if delta < AMP_SEQ_WINDOW:
            return (e.bitmap & (1 << delta)) != 0
        return False

    @staticmethod
    def _record(e: _Entry, seq: int) -> None:
        if not e.primed:
            e.last_seq = seq
            e.bitmap = 1
            e.primed = True
            return
        if seq == e.last_seq:
            return
        forward = (seq - e.last_seq) & 0xFFFF
        if 0 < forward < 0x8000:
            if forward >= AMP_SEQ_WINDOW:
                e.bitmap = 1
            else:
                e.bitmap = ((e.bitmap << forward) | 1) & 0xFFFFFFFF
            e.last_seq = seq
            return
        back = (e.last_seq - seq) & 0xFFFF
        if back < AMP_SEQ_WINDOW:
            e.bitmap |= 1 << back
