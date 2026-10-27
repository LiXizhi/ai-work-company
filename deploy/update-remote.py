"""Updater for the already provisioned US instance. Invoked over SSH stdin."""
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tarfile
import time
import urllib.request

release, expected = sys.argv[1:]
assert re.fullmatch(r'[0-9TZ]+-[0-9a-f]{12}', release), 'invalid release ID'
assert re.fullmatch(r'[0-9a-f]{64}', expected), 'invalid checksum'
root = Path('/opt/ai-work-company')
lock = (root / 'deploy.lock').open('w')
fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
archive = root / 'releases' / (release + '.tar.gz')
assert hashlib.sha256(archive.read_bytes()).hexdigest() == expected, 'archive checksum mismatch'
current = root / 'current'
previous = current.resolve(strict=True)
dest = root / 'releases' / release
dest.mkdir()  # Never overwrite a release.
with tarfile.open(archive) as bundle:
    for member in bundle.getmembers():
        assert not member.issym() and not member.islnk(), 'release links prohibited'
        assert member.isfile() or member.isdir(), 'special files prohibited'
    bundle.extractall(dest, filter='data')
manifest = json.loads((dest / 'release-manifest.json').read_text())
for name, digest in manifest['files'].items():
    path = dest / name
    assert path.resolve().is_relative_to(dest), 'unsafe manifest path'
    assert hashlib.sha256(path.read_bytes()).hexdigest() == digest, name
for path in dest.rglob('*'):
    path.chmod(0o755 if path.is_dir() else 0o644)
dest.chmod(0o755)

def run(*args, **kwargs):
    return subprocess.run(args, check=True, **kwargs)

# Check prerequisite services before stopping anything; do not rewrite infrastructure.
run('systemctl', 'is-active', 'ai-work-company', 'nginx')
run('nginx', '-t')
staged_link = root / 'current.next'
assert not staged_link.exists() and not staged_link.is_symlink(), 'stale deployment link'
run('systemctl', 'stop', 'ai-work-company')
backup = Path('/var/lib/ai-work-company/backups') / ('pre-' + release + '.sqlite')
try:
    run('runuser', '-u', 'awc', '--', str(root / 'runtime/node'), 'scripts/backup.mjs',
        '/var/lib/ai-work-company/company.sqlite', str(backup), cwd=previous)
    assert backup.is_file() and backup.stat().st_size > 0, 'missing backup'
except Exception:
    run('systemctl', 'start', 'ai-work-company')
    raise
state = {'previous': str(previous), 'release': str(dest), 'backup': str(backup)}
(root / 'last-deployment.json').write_text(json.dumps(state, indent=2) + '\n')
staged_link.symlink_to(dest)
os.replace(staged_link, current)
try:
    run('systemctl', 'start', 'ai-work-company')
    for attempt in range(15):
        try:
            with urllib.request.urlopen('http://127.0.0.1:5003/health', timeout=2) as response:
                assert json.load(response)['status'] == 'ok'
            break
        except Exception:
            if attempt == 14:
                raise
            time.sleep(1)
    base = 'https://us1.gameserver.keepwork.com/ai-work-company'
    for path, code in [('/health', 200), ('/company/', 200), ('/free/', 200),
                       ('/admin/', 200), ('/v1/market', 200), ('/v1/me', 401),
                       ('/admin/api/overview', 401), ('/.env', 404), ('/data/company.sqlite', 404)]:
        response = run('curl', '-sS', '--max-time', '10', '--resolve',
                       'us1.gameserver.keepwork.com:443:127.0.0.1', '-o', '/dev/null',
                       '-w', '%{http_code}', base + path, capture_output=True, text=True)
        assert response.stdout == str(code), (path, response.stdout)
        print(path, code, flush=True)
except Exception:
    run('systemctl', 'stop', 'ai-work-company')
    print('Deployment failed; service stopped. Previous release and backup:', state, file=sys.stderr)
    print('Inspect logs and reconcile state before manual rollback; database is not automatically overwritten.', file=sys.stderr)
    raise
print('Release active:', dest, '\nPre-deployment backup:', backup)
