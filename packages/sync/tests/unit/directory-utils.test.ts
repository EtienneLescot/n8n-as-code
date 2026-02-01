import test from 'node:test';
import assert from 'node:assert';
import { createProjectSlug } from '../../src/services/directory-utils.js';

test('createProjectSlug: basic normalization', () => {
    assert.strictEqual(createProjectSlug('Personal'), 'personal');
    assert.strictEqual(createProjectSlug('Test Project'), 'test_project');
    assert.strictEqual(createProjectSlug('Marketing - Project 2026'), 'marketing_project_2026');
});

test('createProjectSlug: trims and collapses separators', () => {
    assert.strictEqual(createProjectSlug('  Weird---Name  '), 'weird_name');
    assert.strictEqual(createProjectSlug('__Already__Slug__'), 'already_slug');
});

test('createProjectSlug: never returns empty', () => {
    assert.strictEqual(createProjectSlug('___'), 'project');
    assert.strictEqual(createProjectSlug('   '), 'project');
});
