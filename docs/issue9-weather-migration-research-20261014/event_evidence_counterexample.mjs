import assert from 'node:assert/strict';import {specialIssue} from './models.mjs';
const actual=specialIssue({permission:true,safe:true,freshWarnings:true,freshSwell:true,accessVerified:true,eventVerified:false});
console.log(JSON.stringify(actual));assert.equal(actual.publishLocation,false,'unverified weather event must not offer a special location');assert.equal(actual.allowNavigation,false);
