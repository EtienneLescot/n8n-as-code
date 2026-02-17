/**
 * Runtime helpers for fluent API
 * 
 * Implements .out(), .to(), .in(), .uses(), .error()
 */

import { connectionTracker } from './links.js';
import { OutputConnection, InputConnection, AIDependencyMap, NodeProxy } from './types.js';

/**
 * Create a node proxy for fluent API
 * 
 * This allows syntax like:
 *   this.ScheduleTrigger.out(0).to(this.Configuration.in(0))
 */
export function createNodeProxy(propertyName: string): NodeProxy {
    const proxy: NodeProxy = {
        _propertyName: propertyName,
        
        out(index: number): OutputConnection {
            return createOutputConnection(propertyName, index, false);
        },
        
        in(index: number): InputConnection {
            return createInputConnection(propertyName, index);
        },
        
        error(): OutputConnection {
            return createOutputConnection(propertyName, 0, true);
        },
        
        uses(dependencies: AIDependencyMap): void {
            // Extract property names from dependency objects
            const deps: any = {};
            
            if (dependencies.ai_languageModel) {
                deps.ai_languageModel = extractPropertyName(dependencies.ai_languageModel.output);
            }
            if (dependencies.ai_memory) {
                deps.ai_memory = extractPropertyName(dependencies.ai_memory.output);
            }
            if (dependencies.ai_outputParser) {
                deps.ai_outputParser = extractPropertyName(dependencies.ai_outputParser.output);
            }
            if (dependencies.ai_tool) {
                deps.ai_tool = dependencies.ai_tool.map(t => extractPropertyName(t.output));
            }
            
            connectionTracker.addAIDependencies(propertyName, deps);
        }
    };
    
    return proxy;
}

/**
 * Create output connection builder
 */
function createOutputConnection(
    fromNode: string,
    output: number,
    isError: boolean
): OutputConnection {
    return {
        _from: { node: fromNode, output, isError },
        
        to(input: InputConnection): void {
            connectionTracker.addConnection(
                fromNode,
                output,
                input._to.node,
                input._to.input,
                isError
            );
        }
    };
}

/**
 * Create input connection builder
 */
function createInputConnection(
    toNode: string,
    input: number
): InputConnection {
    return {
        _to: { node: toNode, input }
    };
}

/**
 * Extract property name from node proxy or output object
 */
function extractPropertyName(obj: any): string {
    if (obj && obj._propertyName) {
        return obj._propertyName;
    }
    
    // If it's a raw object with output property, try to extract
    if (obj && typeof obj === 'object') {
        // Look for _propertyName in nested object
        for (const key in obj) {
            if (obj[key] && obj[key]._propertyName) {
                return obj[key]._propertyName;
            }
        }
    }
    
    throw new Error(`Cannot extract property name from: ${JSON.stringify(obj)}`);
}

/**
 * Create .output property for AI sub-nodes
 * 
 * This allows syntax like:
 *   this.Agent.uses({
 *       ai_languageModel: this.GeminiModel.output
 *   })
 */
export function createOutputReference(propertyName: string): { output: { _propertyName: string } } {
    return {
        output: {
            _propertyName: propertyName
        }
    };
}
