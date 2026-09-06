"""Serve the complete Astra download on this computer, without installing packages."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import argparse

parser = argparse.ArgumentParser(description='Astra · 六地旅行')
parser.add_argument('--port', type=int, default=8765)
args = parser.parse_args()
handler = partial(SimpleHTTPRequestHandler, directory=str(Path(__file__).resolve().parent))
try:
    with ThreadingHTTPServer(('127.0.0.1', args.port), handler) as server:
        print(f'Astra: http://127.0.0.1:{args.port}/   (Ctrl+C to stop)', flush=True)
        server.serve_forever()
except KeyboardInterrupt:
    pass
