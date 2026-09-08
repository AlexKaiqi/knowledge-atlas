import test from 'node:test';
import assert from 'node:assert/strict';
import { environmentPackage, readEnvironmentPackage, environmentHandoff } from '../site/assets/environment-package.js';
import { readWorkspaceRoute, workspaceUrl } from '../site/assets/workspace-navigation.js';
const input = () => ({ environment: { id:'env1',title:'投硬币',visibility:'private', source:{id:'private-parent',version:1} }, selected:{version:2,purpose:'比较重复次数',files:[{path:'run.py',content:'print("heads")\n'}],reason:'修改了次数', name:'访客'}, privatePreferences:'不得带走', versions:[{version:1,files:[{path:'old.txt',content:'private history'}]}] });
test('environment exports freeze only the selected text files and omit other private material', () => {
 const data=input(), pack=environmentPackage(data);
 const parsed=readEnvironmentPackage(JSON.stringify(pack));
 data.selected.files[0].content='changed';
 assert.equal(pack.files[0].content,'print("heads")\n');
 assert.deepEqual(parsed.source,{id:'env1',version:2});
 for(const value of ['private-parent','不得带走','private history']) assert.ok(!JSON.stringify(pack).includes(value));
 assert.ok(environmentHandoff(input()).includes(JSON.stringify(pack,null,2)));
});
test('package imports preserve paths and reject traversal, duplicate names, nontext and oversize definitions', () => {
 const pack=environmentPackage(input());
 for (const name of ['../out','/etc/passwd','a//b','a/./b','a\\b','C:disk','a\u0000b']) assert.throws(()=>readEnvironmentPackage({...pack,files:[{path:name,content:'x'}]}));
 assert.throws(()=>readEnvironmentPackage({...pack,files:[pack.files[0],pack.files[0]]}));
 assert.throws(()=>readEnvironmentPackage({...pack,files:[{path:'x',content:'中'.repeat(10000)}]}));
 assert.throws(()=>readEnvironmentPackage({...pack,files:[{path:'x',content:7}]}));
 assert.deepEqual(readEnvironmentPackage({...pack,files:[{path:'.devcontainer/devcontainer.json',content:'{}'}]}).files,[{path:'.devcontainer/devcontainer.json',content:'{}'}]);
});
test('environment permalinks retain a selected revision and current exploration on refresh', () => {
 const url=workspaceUrl('https://atlas.test/sub/',{scene:'practice',id:'exploration',environment:'environment',environmentVersion:3});
 const route=readWorkspaceRoute('https://atlas.test'+url);
 assert.equal(route.scene,'practice'); assert.equal(route.environment,'environment'); assert.equal(route.environmentVersion,3); assert.equal(route.id,'exploration');
 assert.equal(readWorkspaceRoute('https://atlas.test/explore/?env=environment&ev=-1').environmentVersion,null);
 assert.ok(!workspaceUrl('https://atlas.test/',{scene:'conversation',environment:'stale'}).includes('env='));
});
