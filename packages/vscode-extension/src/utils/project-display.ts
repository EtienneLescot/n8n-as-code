export type DisplayableProject = {
    id?: string;
    name?: string;
    type?: string;
};

export function getPersonalProjectOwner(project: DisplayableProject): string | undefined {
    if (project.type !== 'personal') {
        return undefined;
    }

    const name = project.name?.trim();
    if (!name || name.toLowerCase() === 'personal') {
        return undefined;
    }

    return name;
}

export function getProjectDisplayLabel(project: DisplayableProject): string {
    if (project.type !== 'personal') {
        return project.name?.trim() || project.id || 'Unnamed project';
    }

    const owner = getPersonalProjectOwner(project);
    return owner ? `Personal - ${owner}` : 'Personal';
}

export function getProjectDetail(project: DisplayableProject): string {
    const parts: string[] = [];

    if (project.type) {
        parts.push(`Type: ${project.type}`);
    }

    const owner = getPersonalProjectOwner(project);
    if (owner) {
        parts.push(`Owner: ${owner}`);
    }

    if (project.id) {
        parts.push(`ID: ${project.id}`);
    }

    return parts.join(' | ');
}
