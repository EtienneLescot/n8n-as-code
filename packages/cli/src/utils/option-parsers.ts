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
