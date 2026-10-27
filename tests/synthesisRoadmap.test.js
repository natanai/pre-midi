import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const roadmap=JSON.parse(readFileSync(new URL("../docs/synthesis-roadmap.json",import.meta.url),"utf8"));
const ids=new Map(roadmap.tasks.map(task=>[task.id,task]));
const allowedStatuses=new Set(["planned","in_progress","blocked","done"]);

test("synthesis roadmap is a valid machine-readable task graph",()=>{
 assert.equal(roadmap.schema_version,1);
 assert.equal(roadmap.tasks.length,ids.size,"Task IDs must be unique.");
 const phases=new Set(roadmap.phases.map(phase=>phase.id));
 assert.equal(phases.size,roadmap.phases.length);
 for(const task of roadmap.tasks){
  assert.match(task.id,/^SYN-\d{3}$/);
  assert.ok(phases.has(task.phase),task.id+" refers to a missing phase");
  assert.ok(["P0","P1","P2"].includes(task.priority),task.id+" has an invalid priority");
  assert.ok(allowedStatuses.has(task.status),task.id+" has an invalid status");
  assert.ok(task.title.trim().length>5,task.id+" has no title");
  assert.ok(task.deliverables.length>0,task.id+" has no deliverable");
  assert.ok(task.acceptance.length>=2,task.id+" needs multiple acceptance checks");
  for(const id of task.depends_on)assert.ok(ids.has(id),task.id+" depends on missing "+id);
 }
 for(const phase of roadmap.phases){
  assert.ok(phase.gate_task_ids.length,phase.id+" has no gate");
  for(const id of phase.gate_task_ids)assert.equal(ids.get(id)?.phase,phase.id);
 }
 const visiting=new Set(),visited=new Set();
 const visit=id=>{
  if(visiting.has(id))throw Error("Cycle at "+id);
  if(visited.has(id))return;
  visiting.add(id);
  for(const dependency of ids.get(id).depends_on)visit(dependency);
  visiting.delete(id);visited.add(id);
 };
 for(const id of ids.keys())visit(id);
});
test("native-first policy is explicit and the web is not a quality ceiling",()=>{
 const hosts=roadmap.platform_policy;
 assert.deepEqual(hosts.primary_targets,["desktop_native","mobile_native"]);
 assert.ok(hosts.priority_order.includes("pre_programmed_native"));
 assert.ok(hosts.priority_order.includes("web"));
 assert.ok(hosts.priority_order.indexOf("web")>hosts.priority_order.indexOf("desktop_native"));
 assert.match(hosts.web,/never constrain native audio quality/i);
 assert.match(hosts.professional_quality_gate,/even if web support/i);
 assert.ok(roadmap.sources_of_truth.song_roadmap.endsWith("song-rollout.md"));
});
