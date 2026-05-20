function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function appendNullToType(type: unknown): unknown {
  if (typeof type === 'string') {
    return type === 'null' ? 'null' : [type, 'null'];
  }

  if (Array.isArray(type)) {
    return type.includes('null') ? type : [...type, 'null'];
  }

  return ['null'];
}

function makeSchemaNullable(schema: Record<string, unknown>): Record<string, unknown> {
  if (schema.type !== undefined) {
    return {
      ...schema,
      type: appendNullToType(schema.type),
    };
  }

  if (Array.isArray(schema.anyOf)) {
    const hasNull = schema.anyOf.some((entry) => isRecord(entry) && entry.type === 'null');
    if (!hasNull) {
      return {
        ...schema,
        anyOf: [...schema.anyOf, { type: 'null' }],
      };
    }
  }

  if (Array.isArray(schema.oneOf)) {
    const hasNull = schema.oneOf.some((entry) => isRecord(entry) && entry.type === 'null');
    if (!hasNull) {
      return {
        ...schema,
        oneOf: [...schema.oneOf, { type: 'null' }],
      };
    }
  }

  return {
    anyOf: [schema, { type: 'null' }],
  };
}

function normalizeSchemaNode(schema: unknown, forceRequired: boolean): unknown {
  if (!isRecord(schema)) {
    return schema;
  }

  const normalized: Record<string, unknown> = { ...schema };

  if (Array.isArray(schema.anyOf)) {
    normalized.anyOf = schema.anyOf.map((entry) => normalizeSchemaNode(entry, forceRequired));
  }

  if (Array.isArray(schema.oneOf)) {
    normalized.oneOf = schema.oneOf.map((entry) => normalizeSchemaNode(entry, forceRequired));
  }

  if (isRecord(schema.items)) {
    normalized.items = normalizeSchemaNode(schema.items, forceRequired);
  }

  if (isRecord(schema.properties)) {
    const properties = Object.fromEntries(
      Object.entries(schema.properties).map(([key, value]) => [key, normalizeSchemaNode(value, forceRequired)]),
    );
    const propertyKeys = Object.keys(properties);
    const originalRequired = new Set(
      Array.isArray(schema.required)
        ? schema.required.filter((entry): entry is string => typeof entry === 'string')
        : [],
    );

    if (forceRequired) {
      for (const key of propertyKeys) {
        if (!originalRequired.has(key) && isRecord(properties[key])) {
          properties[key] = makeSchemaNullable(properties[key] as Record<string, unknown>);
        }
      }
    }

    normalized.properties = properties;
    normalized.required = forceRequired ? propertyKeys : [...originalRequired];

    if (normalized.additionalProperties === undefined) {
      normalized.additionalProperties = false;
    }
  }

  return normalized;
}

export function normalizeFunctionToolParametersSchema(
  schema: Record<string, unknown>,
  options: { forceRequiredObjectProperties?: boolean } = {},
): Record<string, unknown> {
  return normalizeSchemaNode(schema, options.forceRequiredObjectProperties === true) as Record<string, unknown>;
}

