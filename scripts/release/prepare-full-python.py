"""Keep a clean bootstrap runtime and a separate, reusable full runtime."""
import importlib.metadata
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tomllib

ROOT = Path(__file__).resolve().parents[2]


def verify():
    from packaging.requirements import Requirement
    project = tomllib.loads((ROOT / "modules/MaiBot/pyproject.toml").read_text("utf-8"))
    for spec in project["project"]["dependencies"]:
        req = Requirement(spec)
        if req.marker and not req.marker.evaluate():
            continue
        version = importlib.metadata.version(req.name)
        if req.specifier and not req.specifier.contains(version, prereleases=True):
            raise RuntimeError(f"Unsatisfied dependency: {spec} (installed {version})")
    subprocess.run([sys.executable, "-m", "pip", "check"], check=True)
    # Exercise native extensions and the dashboard, rather than just metadata.
    subprocess.run([sys.executable, "-c", "import aiohttp, faiss, numpy, pandas, PIL, pyarrow, scipy, maibot_dashboard"], check=True)


def main():
    target = ROOT / "runtime/python-full"
    if "--verify" in sys.argv:
        verify()
        return
    if not (target / "python.exe").exists():
        shutil.copytree(ROOT / "runtime/python", target, dirs_exist_ok=True,
                        ignore=shutil.ignore_patterns("__pycache__", "*.pyc", "Doc"))
    python = str(target / "python.exe")
    project = tomllib.loads((ROOT / "modules/MaiBot/pyproject.toml").read_text("utf-8"))
    dependencies = project["project"]["dependencies"]
    constraints = project.get("tool", {}).get("uv", {}).get("constraint-dependencies", [])
    subprocess.run([python, "-m", "pip", "install", "--disable-pip-version-check",
                    "--no-compile", "--no-warn-script-location", "--timeout", "120",
                    "--retries", "5", *dependencies, *constraints], check=True)
    subprocess.run([python, str(Path(__file__).resolve()), "--verify"], check=True)
    packages = subprocess.check_output([python, "-m", "pip", "list", "--format=json"], text=True)
    (target / "bundled-dependencies.json").write_text(json.dumps({
        "maibotVersion": project["project"]["version"],
        "requirements": dependencies,
        "packages": json.loads(packages),
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Full Python environment ready: {target}")


if __name__ == "__main__":
    main()
