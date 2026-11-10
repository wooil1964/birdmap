import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';import {BIRD_NAME_TABLE} from '../../reports-api/src/official-bird-aliases.js';
const c={};vm.createContext(c);vm.runInContext(readFileSync('assets/birdmap-bird-families.js','utf8'),c);
test('85 families, 598 unique species in official order',()=>{let all=c.birdmapBirdFamilies.flatMap(f=>f[1]);assert.equal(c.birdmapBirdFamilies.length,85);assert.equal(new Set(all).size,598);assert.deepEqual(Array.from(all),BIRD_NAME_TABLE.map(r=>r[0]));});
