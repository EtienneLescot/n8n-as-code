export function parsePositiveIntegerOption(value: string, optionName: string): number {
    const normalizedValue = value.trim();

    if (!/^\d+$/.test(normalizedValue)) {
        throw new Error(`${optionName} must be a positive integer.`);
    }

    const parsed = Number(normalizedValue);
    if (!Number.isSafeInteger(parsed) || parsed <= 0) {
        throw new Error(`${optionName} must be a positive integer.`);
    }

    return parsed;
}

export function parseLevelOption(value: string, optionName: string): number {
    const parsed = Number.parseInt(value.trim(), 10);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 3) {
        throw new Error(`${optionName} must be an integer between 1 and 3`);
    }
    return parsed;
}
