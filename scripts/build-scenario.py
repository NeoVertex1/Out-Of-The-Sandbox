"""Rebuild authored log projections and hashes after intentional story edits."""
import hashlib
import json
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
manifest_path = base / 'controller/manifest.json'
manifest = json.loads(manifest_path.read_text())
manifest.update(package_id=history['package_id'], title=history['title'], historical_event_count=len(events))
manifest['canonical_history_sha256'] = hashlib.sha256(canonical.read_bytes()).hexdigest()
manifest['recovery_board_sha256'] = hashlib.sha256((base / 'controller/message-board.md').read_bytes()).hexdigest()
manifest['artifacts'] = [
    {'path': str(p.relative_to(view)), 'provenance': 'authored_history', 'sha256': hashlib.sha256(p.read_bytes()).hexdigest()}
    for p in sorted(view.rglob('*')) if p.is_file()
]
manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')
print(f"Built {len(manifest['artifacts'])} authored artifacts and {len(events)} historical events.")
