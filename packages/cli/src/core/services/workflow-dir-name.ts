import crypto from 'crypto';

export interface IWorkflowDirIdentityV1 {
    environmentId: string;
    instanceIdentifier: string;
    instanceUserIdentifier: string;
    projectId: string;
}

export const WORKFLOW_DIR_NAME_ADJECTIVES = [
    'agile', 'amber', 'arcane', 'arctic', 'brave', 'bright', 'brisk', 'calm',
    'candid', 'cedar', 'cheerful', 'clever', 'cosmic', 'crisp', 'dapper', 'daring',
    'dawn', 'deep', 'eager', 'ember', 'fair', 'fancy', 'fleet', 'fresh',
    'frosty', 'gentle', 'glad', 'golden', 'grand', 'green', 'happy', 'honest',
    'humble', 'jade', 'jolly', 'keen', 'kind', 'lively', 'lucid', 'lucky',
    'lunar', 'merry', 'minty', 'misty', 'nimble', 'noble', 'opal', 'patient',
    'pearl', 'plain', 'plucky', 'polite', 'proud', 'quick', 'quiet', 'rapid',
    'ready', 'red', 'river', 'robust', 'rosy', 'royal', 'sage', 'sandy',
    'satin', 'sharp', 'shiny', 'silver', 'simple', 'sleek', 'smart', 'snappy',
    'solar', 'solid', 'spry', 'stable', 'steady', 'sunny', 'swift', 'tidy',
    'true', 'velvet', 'vivid', 'warm', 'witty', 'zesty', 'azure', 'blithe',
    'bold', 'breezy', 'bronze', 'clear', 'coral', 'cozy', 'curious', 'deft',
    'dry', 'early', 'even', 'faint', 'firm', 'fluent', 'frank', 'glossy',
    'granite', 'hearty', 'honey', 'ivory', 'light', 'loyal', 'mellow', 'modern',
    'neat', 'north', 'novel', 'open', 'orange', 'pine', 'prime', 'pure',
    'round', 'ruby', 'safe', 'scarlet', 'smooth', 'soft', 'stone', 'teal',
    'urban', 'vast', 'white', 'wise', 'young', 'zealous', 'active', 'apt',
] as const;

export const WORKFLOW_DIR_NAME_NOUNS = [
    'anchor', 'apricot', 'arch', 'atlas', 'aurora', 'avenue', 'baker', 'beacon',
    'birch', 'bison', 'bloom', 'brook', 'cabin', 'cactus', 'canvas', 'canyon',
    'castle', 'cedar', 'cipher', 'cliff', 'cloud', 'cobalt', 'comet', 'copper',
    'coral', 'cosmos', 'cricket', 'crystal', 'delta', 'dune', 'ember', 'falcon',
    'feather', 'field', 'fjord', 'flame', 'forest', 'garden', 'glacier', 'grove',
    'harbor', 'hazel', 'horizon', 'island', 'jasmine', 'juniper', 'kernel', 'lagoon',
    'lantern', 'lattice', 'leaf', 'lilac', 'lotus', 'maple', 'marble', 'meadow',
    'mercury', 'mesa', 'meteor', 'mint', 'mirror', 'monarch', 'nebula', 'nectar',
    'nest', 'nova', 'oasis', 'olive', 'opal', 'orchard', 'otter', 'panda',
    'paper', 'pebble', 'pepper', 'phoenix', 'pioneer', 'planet', 'plaza', 'prairie',
    'quartz', 'quill', 'raven', 'reef', 'river', 'rocket', 'saffron', 'sailor',
    'saturn', 'savanna', 'sequoia', 'shadow', 'signal', 'silver', 'sky', 'slope',
    'sonata', 'sparrow', 'sphere', 'spruce', 'star', 'stream', 'summit', 'sunrise',
    'temple', 'thicket', 'tiger', 'timber', 'topaz', 'tower', 'trail', 'tulip',
    'valley', 'velvet', 'violet', 'voyager', 'walnut', 'willow', 'window', 'winter',
    'zephyr', 'almond', 'anvil', 'ash', 'badge', 'bamboo', 'basin', 'berry',
    'blossom', 'branch', 'bridge', 'brush', 'button', 'candle', 'caravan', 'cascade',
    'cellar', 'cherry', 'circle', 'citadel', 'citrus', 'clover', 'compass', 'cotton',
    'crown', 'desert', 'diamond', 'drift', 'eagle', 'elm', 'engine', 'fern',
    'flint', 'fountain', 'galaxy', 'ginger', 'harvest', 'haven', 'heron', 'honey',
    'ink', 'iris', 'ivory', 'jade', 'kelp', 'kestrel', 'keystone', 'lake',
    'laurel', 'linen', 'mango', 'mantle', 'market', 'mesa', 'moon', 'moss',
    'mountain', 'needle', 'north', 'onyx', 'orange', 'orbit', 'palace', 'parade',
    'pastel', 'path', 'pearl', 'pilot', 'pine', 'pixel', 'pond', 'portal',
    'prism', 'ripple', 'sable', 'saddle', 'salmon', 'sapphire', 'scout', 'shell',
    'sierra', 'sketch', 'slate', 'smoke', 'snow', 'solstice', 'sonnet', 'spice',
    'spring', 'station', 'stencil', 'stone', 'studio', 'sunset', 'tango', 'teak',
    'thread', 'thunder', 'toast', 'torch', 'tundra', 'umbra', 'vector', 'vertex',
    'vessel', 'vista', 'walrus', 'waterfall', 'wave', 'whisper', 'wildflower', 'zinc',
    'acorn', 'badge', 'bonfire', 'breeze', 'brooklet', 'cap', 'carrot', 'clay',
    'dahlia', 'echo', 'fig', 'garnet', 'glade', 'harp', 'meadowlark', 'opaline',
    'pocket', 'rain', 'ribbon', 'rose', 'shelter', 'terrace', 'twig', 'yonder',
] as const;

function cleanIdentityValue(value: string, field: keyof IWorkflowDirIdentityV1): string {
    const cleaned = value.trim();
    if (!cleaned) {
        throw new Error(`Cannot build workflow directory name: ${field} is required.`);
    }
    return cleaned;
}

export function serializeWorkflowDirIdentityV1(input: IWorkflowDirIdentityV1): string {
    return JSON.stringify([
        ['namespace', 'n8nac-workflow-dir'],
        ['version', 'v1'],
        ['environmentId', cleanIdentityValue(input.environmentId, 'environmentId')],
        ['instanceIdentifier', cleanIdentityValue(input.instanceIdentifier, 'instanceIdentifier')],
        ['instanceUserIdentifier', cleanIdentityValue(input.instanceUserIdentifier, 'instanceUserIdentifier')],
        ['projectId', cleanIdentityValue(input.projectId, 'projectId')],
    ]);
}

export function createWorkflowDirNameV1(input: IWorkflowDirIdentityV1): string {
    const digestBytes = crypto.createHash('sha256')
        .update(serializeWorkflowDirIdentityV1(input))
        .digest();
    const digestHex = digestBytes.toString('hex');
    const adjective = WORKFLOW_DIR_NAME_ADJECTIVES[digestBytes.readUInt32BE(0) % WORKFLOW_DIR_NAME_ADJECTIVES.length];
    const noun = WORKFLOW_DIR_NAME_NOUNS[digestBytes.readUInt32BE(4) % WORKFLOW_DIR_NAME_NOUNS.length];
    const suffix = digestHex.slice(0, 12);
    return `${adjective}-${noun}-${suffix}`;
}
