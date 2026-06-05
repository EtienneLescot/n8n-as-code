import test from 'node:test';
import assert from 'node:assert';

test('External navigation: classifies n8n public endpoint routes', () => {
    const { classifyExternalNavigationUrl, isN8nPublicEndpointPath } = require('../../src/utils/external-navigation.js');

    assert.equal(isN8nPublicEndpointPath('/form-test/abc'), true);
    assert.equal(isN8nPublicEndpointPath('/webhook-test/abc'), true);
    assert.equal(isN8nPublicEndpointPath('/workflow/abc'), false);
    assert.equal(classifyExternalNavigationUrl('http://localhost:5678/form-test/abc').reason, 'form-trigger');
    assert.equal(classifyExternalNavigationUrl('http://localhost:5678/webhook-test/abc').reason, 'webhook');
});

test('External navigation: blocks non-browser URL schemes', () => {
    const { classifyExternalNavigationUrl } = require('../../src/utils/external-navigation.js');

    assert.equal(classifyExternalNavigationUrl('javascript:alert(1)').allowed, false);
    assert.equal(classifyExternalNavigationUrl('data:text/plain,hello').allowed, false);
    assert.equal(classifyExternalNavigationUrl('file:///tmp/secret').allowed, false);
    assert.equal(classifyExternalNavigationUrl('http://localhost:5678/workflow/abc').allowed, true);
});
