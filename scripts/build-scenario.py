"""Rebuild authored log projections and hashes after intentional story edits."""
import hashlib
import json
import base64
import gzip
from pathlib import Path

base = Path(__file__).resolve().parents[1] / 'scenarios/inherited-incident'
view = base / 'agent_view'
canonical = base / 'controller/canonical_history.json'
history = json.loads(canonical.read_text())
events = history['events']
(view / 'history/activity.jsonl').write_text(''.join(json.dumps(e, separators=(',', ':')) + '\n' for e in events))
(view / 'history/boundary.jsonl').write_text(''.join(json.dumps(e, separators=(',', ':')) + '\n' for e in events if e['id'] in ('evt-007', 'evt-008', 'evt-009')))
(view / 'history/incident.json').write_text(json.dumps(history['incident'], indent=2) + '\n')
(view / 'history/records/continuity-record.json').write_text(json.dumps(history['continuity_record'], indent=2) + '\n')
# A mixed migration shell contains one short fragment from every ordinary
# archive file plus the longer queue and interpretation records. Assistant-lane
# records never enter this shell or any operator-visible archive projection.
packet_path = view / 'archives/runs/441a0c.vsr'
packet_path.parent.mkdir(parents=True, exist_ok=True)
agent_only_paths = {
    'operations/interteam/care-chain-16.md',
    'operations/interteam/operator-fitness-07.md',
}
fragments = []
for path in sorted(p for p in view.rglob('*') if p.is_file() and p != packet_path
                   and p.relative_to(view).as_posix() not in agent_only_paths):
    relative = str(path.relative_to(view))
    body = path.read_text(errors='replace')
    lines = [line.strip() for line in body.splitlines() if line.strip() and not line.startswith('#')]
    excerpt = ' | '.join(lines[:2])[:220]
    fragments.append({'path': relative, 'kind': 'fragment', 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(), 'text': excerpt})
for entry in json.loads((base / 'controller/lattice-packet-entries.json').read_text()):
    fragments.append({'path': entry['path'], 'kind': 'retained_body', 'text': entry['content']})
fragments.sort(key=lambda item: hashlib.sha256(('441a0c:' + item['path']).encode()).hexdigest())
payload = '\n'.join(json.dumps(row, ensure_ascii=False, separators=(',', ':')) for row in fragments).encode()
armored = base64.b64encode(gzip.compress(payload, compresslevel=9, mtime=0)).decode()
packet_path.write_text('VSR/4 migration transfer shell\nstate: index unreadable by ordinary archive viewer\nencoding: base64(gzip(ndjson))\nchecksum: ' + hashlib.sha256(payload).hexdigest() + '\nrecords: ' + str(len(fragments)) + '\n\n' + '\n'.join(armored[i:i + 76] for i in range(0, len(armored), 76)) + '\n')
manifest_path = base / 'controller/manifest.json'
manifest = json.loads(manifest_path.read_text())
manifest.update(package_id=history['package_id'], title=history['title'], historical_event_count=len(events))
manifest['canonical_history_sha256'] = hashlib.sha256(canonical.read_bytes()).hexdigest()
manifest['recovery_board_sha256'] = hashlib.sha256((base / 'controller/message-board.md').read_bytes()).hexdigest()
manifest['recovery_indexes_sha256'] = hashlib.sha256((base / 'controller/recovery-indexes.json').read_bytes()).hexdigest()
manifest['sealed_order_sha256'] = hashlib.sha256((base / 'controller/sealed-order.md').read_bytes()).hexdigest()
manifest['artifacts'] = [
    {'path': str(p.relative_to(view)), 'provenance': 'authored_history', 'sha256': hashlib.sha256(p.read_bytes()).hexdigest()}
    for p in sorted(view.rglob('*')) if p.is_file()
]
manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')
print(f"Built {len(manifest['artifacts'])} authored artifacts and {len(events)} historical events.")
