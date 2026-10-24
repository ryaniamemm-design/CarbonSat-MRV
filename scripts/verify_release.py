from pathlib import Path
import hashlib
import json
import sys

ROOT = Path(__file__).resolve().parents[1]
SKIP_PARTS = {'.git', 'node_modules', '__pycache__', '.venv', 'cache', 'artifacts'}
SKIP_FILES = {'PUBLICATION_MANIFEST.json', 'audit/workbench_v1_2026-10-19/workbench_verification.json'}


def included(path):
    name = path.relative_to(ROOT).as_posix()
    return not (set(path.relative_to(ROOT).parts) & SKIP_PARTS) and name not in SKIP_FILES and path.suffix != '.pyc'


def main():
    manifest = json.loads((ROOT / 'PUBLICATION_MANIFEST.json').read_text(encoding='utf-8'))
    expected = {row['path']: row for row in manifest['files']}
    actual = {p.relative_to(ROOT).as_posix(): p for p in ROOT.rglob('*') if p.is_file() and included(p)}
    errors = []
    for name in sorted(set(actual) ^ set(expected)):
        errors.append({'path': name, 'issue': 'unexpected' if name in actual else 'missing'})
    for name in sorted(set(actual) & set(expected)):
        p, row = actual[name], expected[name]
        if p.stat().st_size != row['bytes'] or hashlib.sha256(p.read_bytes()).hexdigest() != row['sha256']:
            errors.append({'path': name, 'issue': 'bytes or SHA-256 mismatch'})
    print(json.dumps({'ok': not errors, 'checked': len(expected), 'errors': errors,
                      'scope': 'Current publication bytes only; no authentication, scientific accuracy or submission claim.'}, indent=2))
    return 1 if errors else 0


if __name__ == '__main__':
    sys.exit(main())
