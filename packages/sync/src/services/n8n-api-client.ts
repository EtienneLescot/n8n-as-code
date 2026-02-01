import axios, { AxiosInstance } from 'axios';
import * as https from 'https';
import { IN8nCredentials, IWorkflow, IProject } from '../types.js';

export class N8nApiClient {
    private client: AxiosInstance;
    private projectsCache: Map<string, IProject> | null = null;

    constructor(credentials: IN8nCredentials) {
        let host = credentials.host;
        if (host.endsWith('/')) {
            host = host.slice(0, -1);
        }

        this.client = axios.create({
            baseURL: host,
            headers: {
                'X-N8N-API-KEY': credentials.apiKey,
                'Content-Type': 'application/json',
                'User-Agent': 'n8n-as-code'
            },
            // Allow self-signed certificates by default to avoid issues in local environments
            httpsAgent: new https.Agent({  
                rejectUnauthorized: false 
            })
        });
    }

    async testConnection(): Promise<boolean> {
        try {
            await this.client.get('/api/v1/users'); // Simple endpoint to test auth
            return true;
        } catch (error) {
            console.error('Connection test failed:', error);
            return false;
        }
    }

    async getCurrentUser(): Promise<{ id: string; email: string; firstName?: string; lastName?: string; } | null> {
        // Try /me first (modern n8n)
        try {
            const res = await this.client.get('/api/v1/users/me');
            console.debug('[N8nApiClient] getCurrentUser: Successfully retrieved user from /me endpoint');
            if (res.data && res.data.id) {
                return {
                    id: res.data.id,
                    email: res.data.email,
                    firstName: res.data.firstName,
                    lastName: res.data.lastName
                };
            }
        } catch (error: any) {
            console.debug('[N8nApiClient] getCurrentUser: /me endpoint failed:', error.message);
            // If it's a connection error, throw immediately
            if (!error.response) throw error;
        }

        // Fallback: get all users and take the first one (assuming the API key belongs to an admin or the only user)
        console.debug('[N8nApiClient] getCurrentUser: Trying /api/v1/users endpoint');
        try {
            const res = await this.client.get('/api/v1/users');
            if (res.data && res.data.data && res.data.data.length > 0) {
                console.debug('[N8nApiClient] getCurrentUser: Found', res.data.data.length, 'users');
                const user = res.data.data[0];
                return {
                    id: user.id,
                    email: user.email,
                    firstName: user.firstName,
                    lastName: user.lastName
                };
            }
        } catch (error: any) {
            console.debug('[N8nApiClient] getCurrentUser: /api/v1/users endpoint failed:', error.message);
            // If it's a connection error, throw immediately
            if (!error.response) throw error;
        }
        
        console.debug('[N8nApiClient] getCurrentUser: All attempts failed, returning null');
        return null;
    }

    /**
     * Fetches all projects from n8n.
     * Public method for CLI/UI to show project selection.
     * 
     * @returns Array of IProject
     */
    async getProjects(): Promise<IProject[]> {
        try {
            const res = await this.client.get('/api/v1/projects');
            const projects = res.data.data || [];
            return projects.map((p: any) => ({
                id: p.id,
                name: p.name,
                type: p.type,
                createdAt: p.createdAt,
                updatedAt: p.updatedAt
            }));
        } catch (error: any) {
            console.error(`[N8nApiClient] Failed to fetch projects: ${error.message}`);
            return [];
        }
    }

    /**
     * Fetches all projects from n8n and caches them.
     * Returns a Map of projectId -> IProject for quick lookups.
     * 
     * The cache is populated on first call and reused for subsequent calls.
     * If the API call fails, returns an empty cache to allow graceful degradation.
     * 
     * @returns Map of projectId to IProject
     */
    private async getProjectsCache(): Promise<Map<string, IProject>> {
        if (this.projectsCache !== null) {
            return this.projectsCache;
        }

        try {
            const res = await this.client.get('/api/v1/projects');
            const projects = res.data.data || [];
            
            this.projectsCache = new Map();
            for (const project of projects) {
                this.projectsCache.set(project.id, {
                    id: project.id,
                    name: project.name,
                    type: project.type,
                    createdAt: project.createdAt,
                    updatedAt: project.updatedAt
                });
            }
            
            // Only log in debug mode to avoid noise
            if (process.env.DEBUG) {
                console.debug(`[N8nApiClient] Cached ${this.projectsCache.size} projects`);
            }
            return this.projectsCache;
        } catch (error: any) {
            // Graceful degradation: workflows will have projectId but no homeProject/projectName
            console.warn(`[N8nApiClient] Failed to fetch projects: ${error.message}. Workflows will not have project names.`);
            this.projectsCache = new Map();
            return this.projectsCache;
        }
    }

    async getAllWorkflows(projectId?: string): Promise<IWorkflow[]> {
        try {
            const res = await this.client.get('/api/v1/workflows');
            let workflows = res.data.data;
            
            // Filter by project if specified
            if (projectId) {
                workflows = workflows.filter((wf: any) => {
                    if (!wf.shared || !Array.isArray(wf.shared) || wf.shared.length === 0) {
                        return false;
                    }
                    return wf.shared[0].projectId === projectId;
                });
            }
            
            // Enrich workflows with organization metadata
            const enriched = await Promise.all(
                workflows.map((wf: any) => this.enrichWorkflowMetadata(wf))
            );
            
            return enriched;
        } catch (error: any) {
            console.error('Failed to get workflows:', error.message);
            // Re-throw so the caller (Watcher) can distinguish between "no workflows" and "connection error"
            throw error;
        }
    }

    async getWorkflow(id: string): Promise<IWorkflow | null> {
        try {
            const res = await this.client.get(`/api/v1/workflows/${id}`);
            // Enrich with organization metadata
            return await this.enrichWorkflowMetadata(res.data);
        } catch (error: any) {
            // 404 is expected if workflow deleted remotely
            if (error.response && error.response.status === 404) {
                return null;
            }
            // Re-throw other errors (connection, 500, etc.)
            throw error;
        }
    }
    
    /**
     * Enriches a workflow with organization metadata extracted from the API response.
     * This metadata includes project information and archived status.
     * 
     * @param workflow Raw workflow from n8n API
     * @returns Workflow with organization metadata
     */
    private async enrichWorkflowMetadata(workflow: any): Promise<IWorkflow> {
        const enriched: IWorkflow = { ...workflow };
        
        // Get projects cache
        const projectsCache = await this.getProjectsCache();
        
        // Extract project information from shared array
        // n8n stores projectId in workflow.shared[0].projectId
        if (workflow.shared && Array.isArray(workflow.shared) && workflow.shared.length > 0) {
            const firstShare = workflow.shared[0];
            
            if (firstShare.projectId) {
                enriched.projectId = firstShare.projectId;
                
                // Look up project details in cache
                const project = projectsCache.get(firstShare.projectId);
                if (project) {
                    enriched.homeProject = project;
                    enriched.projectName = project.name;
                } else {
                    console.debug(`[N8nApiClient] Project ${firstShare.projectId} not found in cache`);
                }
            }
        }
        
        // Extract archived status (direct property)
        if (workflow.isArchived !== undefined) {
            enriched.isArchived = workflow.isArchived;
        }
        
        return enriched;
    }

    async createWorkflow(payload: Partial<IWorkflow>): Promise<IWorkflow> {
        const res = await this.client.post('/api/v1/workflows', payload);
        return res.data;
    }

    async updateWorkflow(id: string, payload: Partial<IWorkflow>): Promise<IWorkflow> {
        // Use console.warn to be more visible in some environments
        console.warn(`[N8nApiClient] Starting PUT /api/v1/workflows/${id}`);
        const startTime = Date.now();
        
        try {
            const res = await this.client.put(`/api/v1/workflows/${id}`, payload);
            const duration = Date.now() - startTime;
            console.warn(`[N8nApiClient] PUT finished in ${duration}ms. Status: ${res.status}`);
            return res.data;
        } catch (error: any) {
            const duration = Date.now() - startTime;
            console.error(`[N8nApiClient] PUT failed after ${duration}ms: ${error.message}`);
            if (error.response) {
                console.error(`[N8nApiClient] Error data:`, error.response.data);
            }
            throw error;
        }
    }

    async deleteWorkflow(id: string): Promise<boolean> {
        try {
            await this.client.delete(`/api/v1/workflows/${id}`);
            return true;
        } catch (error) {
            console.error(`Failed to delete workflow ${id}:`, error);
            return false;
        }
    }

    async activateWorkflow(id: string, active: boolean): Promise<boolean> {
        try {
            await this.client.post(`/api/v1/workflows/${id}/activate`, { active });
            return true;
        } catch (error) {
            return false;
        }
    }

    async getHealth(): Promise<{ version: string }> {
        try {
            // 1. Try public endpoint if available (some versions)
            try {
                const res = await this.client.get('/healthz');
                if (res.data && res.data.version) return { version: res.data.version };
            } catch { }

            // 2. Scraping Root Page as fallback (Using raw axios to avoid API headers)
            const baseURL = this.client.defaults.baseURL;
            const res = await axios.get(`${baseURL}/`);
            const html = res.data;

            // Look for "release":"n8n@X.Y.Z" probably inside n8n:config:sentry meta (Base64 encoded)
            const sentryMatch = html.match(/name="n8n:config:sentry"\s+content="([^"]+)"/);
            if (sentryMatch && sentryMatch[1]) {
                const decoded = Buffer.from(sentryMatch[1], 'base64').toString('utf-8');
                const releaseMatch = decoded.match(/"release":"n8n@([^"]+)"/);
                if (releaseMatch && releaseMatch[1]) {
                    return { version: releaseMatch[1] };
                }
            }

            // Fallback: Check plain text just in case
            const releaseRegex = /"release":"n8n@([^"]+)"/;
            const plainMatch = html.match(releaseRegex);
            if (plainMatch && plainMatch[1]) return { version: plainMatch[1] };

            // Look for other common patterns
            const metaMatch = html.match(/n8n version: ([0-9.]+)/i);
            if (metaMatch && metaMatch[1]) return { version: metaMatch[1] };

            return { version: '1.0+' };
        } catch {
            return { version: 'Unknown' };
        }
    }

    async getNodeTypes(): Promise<any[]> {
        try {
            // Unofficial/Internal endpoint often used by frontend
            const res = await this.client.get('/rest/node-types');
            return res.data;
        } catch {
            // Fallback: If REST API not accessible, return empty
            return [];
        }
    }
}
