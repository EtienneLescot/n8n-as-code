import axios, { AxiosInstance } from 'axios';
import { IN8nCredentials, IWorkflow } from '../types.js';

export class N8nApiClient {
    private client: AxiosInstance;

    constructor(credentials: IN8nCredentials) {
        let host = credentials.host;
        if (host.endsWith('/')) {
            host = host.slice(0, -1);
        }

        this.client = axios.create({
            baseURL: host,
            headers: {
                'X-N8N-API-KEY': credentials.apiKey,
                'Content-Type': 'application/json'
            }
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
        try {
            const res = await this.client.get('/api/v1/users/me');
            return {
                id: res.data.id,
                email: res.data.email,
                firstName: res.data.firstName,
                lastName: res.data.lastName
            };
        } catch (error) {
            console.error('Failed to get current user:', error);
            return null;
        }
    }

    async getAllWorkflows(): Promise<IWorkflow[]> {
        try {
            const res = await this.client.get('/api/v1/workflows');
            return res.data.data;
        } catch (error) {
            console.error('Failed to get workflows:', error);
            return [];
        }
    }

    async getWorkflow(id: string): Promise<IWorkflow | null> {
        try {
            const res = await this.client.get(`/api/v1/workflows/${id}`);
            return res.data;
        } catch (error) {
            // 404 is expected if workflow deleted remotely
            return null;
        }
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
