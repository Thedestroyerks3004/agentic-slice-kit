"""SyllabusMind. Finds the syllabus topics a student is confidently wrong about."""
import sys
from pathlib import Path

_kit = str(Path(__file__).resolve().parents[2])      # the kit root holds the spine, slice/
if _kit not in sys.path:
    sys.path.append(_kit)
