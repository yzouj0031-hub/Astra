"""JS 与 Python 随机流的数值一致性检查。

    python blender/tests/test_rng_parity.py

跑 node 取参考值，跟 blender/lib/rng.py 逐个 bit 比。任何一个不等就退出码 1。
"""
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(ROOT, "blender"))

from lib import rng  # noqa: E402


def js_reference():
    proc = subprocess.run(
        ["node", os.path.join(HERE, "rng_dump.mjs")],
        capture_output=True, text=True, cwd=ROOT,
    )
    if proc.returncode != 0:
        print(proc.stderr)
        raise SystemExit("node 跑挂了")
    return json.loads(proc.stdout)


def compare(name, expected, actual, exact=True):
    if len(expected) != len(actual):
        print(f"FAIL {name}: 长度 {len(expected)} vs {len(actual)}")
        return False
    for i, (e, a) in enumerate(zip(expected, actual)):
        same = (e == a) if exact else (abs(e - a) < 1e-15)
        if not same:
            print(f"FAIL {name}[{i}]: JS={e!r}  PY={a!r}  diff={a - e if isinstance(e, float) else 'n/a'}")
            return False
    print(f"  ok  {name:<8} {len(actual)} 个值全等   首值 {actual[0]!r}")
    return True


def main():
    ref = js_reference()
    r = rng.Rng()
    ok = True

    ok &= compare("rnd", ref["raw"], [r.rnd() for _ in range(20)])
    ok &= compare("rr", ref["rr"], [r.rr(-3.5, 7.25) for _ in range(10)])
    ok &= compare("ri", ref["ri"], [r.ri(0, 5) for _ in range(10)])
    arr = ["a", "b", "c", "d", "e", "f", "g"]
    ok &= compare("pick", ref["pick"], [r.pick(arr) for _ in range(10)])
    ok &= compare("smooth", ref["smooth"], [rng.smooth(0.2, 0.8, r.rnd()) for _ in range(10)])

    for _ in range(1_000_000):
        r.rnd()
    if r.seed != ref["seed_after_1e6"]:
        print(f"FAIL seed@1e6: JS={ref['seed_after_1e6']} PY={r.seed}")
        ok = False
    else:
        print(f"  ok  seed@1e6  {r.seed}  (百万步后仍未漂移)")

    print("PASS" if ok else "FAILED")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
