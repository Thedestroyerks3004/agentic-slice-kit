"""Puts this folder and the kit's spine (../slice) on sys.path."""
import sys
from pathlib import Path

here = Path(__file__).resolve().parent
sys.path[:0] = [str(here), str(here.parent)]
